const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { queryParams } = require("../../db/database");
const embedWrapper = require("../utils/emails/embedWrapper");
const { ignoreEmails } = require("../../config.json");
const EventEmitter = require('events');
const config = require('../../config.json');

// --- Config ---
const SMTP_PORT = 25;
const SMTP_HOST = config.smtpHost || '0.0.0.0'; // Listen on all interfaces
const emailWatchers = new Map();
let client = null; // Discord client (set via initialize)

// --- SMTP Server Setup ---
const smtpServer = new SMTPServer({
    logger: false, // Disable verbose protocol debug logging
    disabledCommands: ['AUTH', 'STARTTLS'], // Disable authentication and TLS (no certs provided)
    onRcptTo(address, session, callback) {
        const recipient = (address.address || "").toLowerCase().trim();
        const configuredDomains = (config.domains || []).map(d => String(d).toLowerCase().trim());
        const recipientDomain = recipient.split('@')[1];

        // Only accept emails targeted to configured domains or active email watchers
        if (emailWatchers.has(recipient) || configuredDomains.some(d => recipientDomain === d || recipientDomain?.endsWith(`.${d}`))) {
            return callback(); // Accept
        }

        // Reject external spam probes
        return callback(new Error('550 Not accepting mail for external domains'));
    },
    onData(stream, session, callback) {
        simpleParser(stream)
            .then(parsed => processIncomingEmail(parsed))
            .then(() => callback())
            .catch(err => {
                console.error('Error processing email:', err);
                callback(err);
            });
    },
    onConnect(session, callback) {
        callback(); // Accept the connection
    },
});

// --- Functions ---
function initialize(discordClient) {
    client = discordClient;
    console.log('?? Email handler initialized with Discord client');
    startSMTPServer();
}

let isListening = false;

function startSMTPServer() {
    if (isListening || (smtpServer.server && smtpServer.server.listening)) {
        isListening = true;
        return;
    }
    
    try {
        smtpServer.listen(SMTP_PORT, SMTP_HOST, () => {
            console.log(`? SMTP server running on ${SMTP_HOST}:${SMTP_PORT}`);
            isListening = true;
        });

        // Only attach error handler once
        if (!smtpServer.listenerCount('error')) {
            smtpServer.on('error', (err) => {
                console.error('? SMTP server error:', err.message);
                if (err.code === 'ERR_SERVER_ALREADY_LISTEN') {
                    isListening = true;
                    return;
                }

                // Client socket errors (e.g. read ETIMEDOUT, ECONNRESET, TLS) do NOT mean the server stopped listening
                const isClientError = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(err.code)
                    || err.message?.includes('read ETIMEDOUT')
                    || err.message?.includes('ECONNRESET')
                    || err.message?.includes('SSL routines');

                if (isClientError) {
                    return;
                }

                // Server-level fatal error
                isListening = false;
                setTimeout(() => {
                    if (!isListening && (!smtpServer.server || !smtpServer.server.listening)) {
                        startSMTPServer();
                    }
                }, 5000);
            });
        }
    } catch (err) {
        console.error('Failed to start SMTP Server:', err.message);
    }
}

async function processIncomingEmail(parsed) {
    const { from, to, subject, text, date } = parsed;
    const recipient = (to?.value?.[0]?.address || "unknown@unknown").toLowerCase().trim();
    const sender = (from?.value?.[0]?.address || "unknown@unknown").toLowerCase().trim();

    if (ignoreEmails.includes(sender)) {
        console.log(`Ignoring email from ${sender} (in ignore list)`);
        return;
    }

    const code = extractVerificationCode(text || "");
    console.log(`New email: ${sender} -> ${recipient}${code ? ` (code: ${code})` : ''}`);

    const emailTime = Date.now();
    // Notify watchers (if any)
    if (emailWatchers.has(recipient)) {
        emailWatchers.get(recipient)({
            text,
            time: emailTime,
            description: text
        });
    }

    // Store in DB
    await storeEmail(recipient, sender, subject || "(no subject)", text || "", emailTime);

    // Send Discord notifications (if client is available)
    if (client) {
        await sendNotifications(recipient, parsed);
    }
}

function extractVerificationCode(text) {
    const codeMatch = text.match(/\b\d{6,7}\b/); // Match 6-7 digit codes
    return codeMatch ? codeMatch[0] : null;
}

async function storeEmail(email, from, subject, text, time) {
    try {
        console.log(`[DEBUG] Storing email: receiver=${email}, sender=${from}, time=${time} (type: ${typeof time})`);
        await queryParams(
            `INSERT INTO emails(receiver, sender, subject, description, time) VALUES(?, ?, ?, ?, ?)`,
            [email.toLowerCase().trim(), from, subject, text, time]
        );
        console.log(`[DEBUG] Email stored successfully for ${email}`);
    } catch (err) {
        console.error('Failed to store email:', err);
    }
}

async function sendNotifications(email, parsed) {
    try {
        const subscribers = await queryParams(
            `SELECT user_id FROM email_notifier WHERE LOWER(email) = ?`,
            [email.toLowerCase().trim()]
        );

        if (!subscribers?.length) return;

        for (const sub of subscribers) {
            try {
                const discordUser = await client.users.fetch(sub.user_id);
                if (discordUser) {
                    await discordUser.send({
                        content: `New email to **${email}**`,
                        embeds: [embedWrapper(parsed.subject || "(no subject)", parsed.text || "")],
                    });
                }
            } catch (err) {
                console.error(`Failed to DM user ${sub.user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error sending notifications:', err);
    }
}

function watchForEmail(email, callback, timeout = 120000) {
    const normalized = (email || "").toLowerCase().trim();
    emailWatchers.set(normalized, callback);
    setTimeout(() => emailWatchers.delete(normalized), timeout);
}

function shutdown() {
    console.log('?? Shutting down SMTP server...');
    smtpServer.close();
}

module.exports = {
    initialize,
    watchForEmail,
    storeEmail,
    sendNotifications,
    shutdown,
};
