const { queryParams } = require("../../../db/database");
const { watchForEmail } = require("../../../mainbot/handlers/emailHandler");
const { extractCode } = require("./extractCode");
const axios = require('axios');

async function getEmailDescription(time, secEmail, getcode = false, checkdomain = false) {
    return new Promise((resolve) => {
        let hasResolved = false;

        const resolveOnce = (value) => {
            if (!hasResolved) {
                hasResolved = true;
                resolve(value);
            }
        };

        if (!secEmail || typeof secEmail !== 'string' || !secEmail.includes('@')) {
            console.log(`Invalid security email provided: ${secEmail}`);
            resolveOnce(null);
            return;
        }

        const domain = secEmail.split("@")[1];

        // --- TEMP MAIL API (1SECMAIL) INTEGRATION FOR LOCAL TEST ---
        const tempDomains = ["1secmail.com", "1secmail.org", "1secmail.net", "kzccv.com", "qiott.com", "wuuvo.com", "igjys.com", "oosnx.com"];
        if (tempDomains.includes(domain)) {
            const login = secEmail.split("@")[0];
            const checkTempMail = async () => {
                if (hasResolved) return;
                try {
                    const { data: messages } = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
                    if (messages && messages.length > 0) {
                        const msgId = messages[0].id;
                        const { data: msgContent } = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`);
                        const description = msgContent.textBody || msgContent.htmlBody || msgContent.subject || "";
                        
                        if (getcode) {
                            const code = await extractCode(description);
                            if (code) {
                                resolveOnce(code);
                                return;
                            }
                        } else {
                            resolveOnce(description);
                            return;
                        }
                    }
                } catch (error) {
                    console.error("TempMail API Error:", error.message);
                }
                
                if (!hasResolved) setTimeout(checkTempMail, 3500); // Check again in 3.5s
            };
            
            checkTempMail();
            setTimeout(() => { resolveOnce(null); }, 120000); // 2 minutes timeout max
            return;
        }

        // --- PRODUCTION LOGIC: READ FROM LOCAL DATABASE (FOR VPS / REAL DOMAINS) ---
        const normalizedEmail = secEmail.toLowerCase().trim();
        const localPart = normalizedEmail.split('@')[0];
        const lookbackTime = time - 60000;

        watchForEmail(normalizedEmail, async (emailData) => {
            if (emailData.time >= lookbackTime) {
                if (getcode) {
                    const code = await extractCode(emailData.description);
                    if (code) resolveOnce(code);
                } else {
                    resolveOnce(emailData.description);
                }
            }
        }, 120000);

        const checkDb = async () => {
            if (hasResolved) return;
            try {
                const results = await queryParams(
                    `SELECT description, time FROM emails 
                     WHERE (LOWER(receiver) = ? OR LOWER(receiver) LIKE ?) AND time >= ? 
                     ORDER BY time DESC LIMIT 1`,
                    [normalizedEmail, `${localPart}@%`, lookbackTime]
                );

                if (results && results.length > 0) {
                    const description = results[0].description;
                    if (getcode) {
                        const code = await extractCode(description);
                        if (code) {
                            resolveOnce(code);
                            return;
                        }
                    } else {
                        resolveOnce(description);
                        return;
                    }
                }
            } catch (error) {
                console.error("DB email check error:", error);
            }

            if (!hasResolved) {
                setTimeout(checkDb, 1500);
            }
        };

        checkDb();
        setTimeout(() => { resolveOnce(null); }, 120000); // 2 minutes max
    });
}

module.exports = { getEmailDescription };
