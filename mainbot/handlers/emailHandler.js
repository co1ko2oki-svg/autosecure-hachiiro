const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { queryParams } = require("../../db/database");
const embedWrapper = require("../utils/emails/embedWrapper");
const { ignoreEmails } = require("../../config.json");
const EventEmitter = require('events');
const config = require('../../config.json');

// --- Config ---
const SMTP_PORT = Number(process.env.SMTP_PORT || config.smtpPort || 2525);
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

        // Always accept if forwarded from localhost (e.g. mail proxy / mail-hotwar-asia on 127.0.0.1)
        const isLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(session.remoteAddress);

        // Only accept emails targeted to configured domains, active email watchers, or forwarded from localhost
        if (isLocalhost || emailWatchers.has(recipient) || configuredDomains.some(d => recipientDomain === d || recipientDomain?.endsWith(`.${d}`))) {
            return callback(); // Accept
        }

        // Also accept custom domains configured by users in DB
        queryParams('SELECT 1 FROM autosecure WHERE LOWER(domain) = ? UNION SELECT 1 FROM secureconfig WHERE LOWER(domain) = ? LIMIT 1', [recipientDomain, recipientDomain])
            .then(res => {
                if (res && res.length > 0) {
                    return callback();
                }
                return callback(new Error('550 Not accepting mail for external domains'));
            })
            .catch(() => callback(new Error('550 Domain verification failed')));
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
    console.log('[EMAIL] Handler initialized with Discord client');
    startSMTPServer();
}

let isListening = false;
let isStarting = false;
let retryTimeout = null;
let eaddrinuseLogged = false;

// Attach error handler once
if (!smtpServer.listenerCount('error')) {
    smtpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            if (!eaddrinuseLogged) {
                console.error(`[SMTP] Server error: Cổng ${SMTP_PORT} đang bị chiếm dụng bởi phần mềm khác. Bot sẽ thử lại ngầm...`);
                eaddrinuseLogged = true;
            }
        } else {
            console.error('[SMTP] Server error:', err.message);
        }
        
        if (err.code === 'ERR_SERVER_ALREADY_LISTEN') {
            isListening = true;
            isStarting = false;
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
        isStarting = false;

        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
            if (!isListening && (!smtpServer.server || !smtpServer.server.listening)) {
                startSMTPServer();
            }
        }, 10000);
    });
}

function startSMTPServer() {
    if (isListening || isStarting || (smtpServer.server && smtpServer.server.listening)) {
        isListening = true;
        return;
    }

    isStarting = true;
    
    try {
        if (smtpServer.server) {
            smtpServer.server.setMaxListeners(50);
            smtpServer.server.removeAllListeners('listening');
            smtpServer.server.once('listening', () => {
                console.log(`[SMTP] Server running on ${SMTP_HOST}:${SMTP_PORT}`);
                isListening = true;
                isStarting = false;
            });
        }

        smtpServer.listen(SMTP_PORT, SMTP_HOST);
    } catch (err) {
        isStarting = false;
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
