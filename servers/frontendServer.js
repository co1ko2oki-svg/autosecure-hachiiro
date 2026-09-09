const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ANTI-CRASH] Frontend Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error(`[ANTI-CRASH] Frontend Uncaught Exception: ${err ? err.message : err}`, err ? err.stack : '');
});

const app = express();
const PORT = process.env.FRONTEND_PORT || process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'public');

const staticLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
});
app.use(staticLimiter);

app.get('/config.js', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'config.js'));
});

app.use('/assets', express.static(path.join(FRONTEND_DIR, 'assets'), {
    maxAge: '1h'
}));
app.use('/terms', express.static(path.join(FRONTEND_DIR, 'terms'), {
    maxAge: '1h'
}));

app.get('/gift/:code', (req, res) => {
    res.redirect(`/store?gift=true&code=${encodeURIComponent(req.params.code)}`);
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

app.use(express.static(FRONTEND_DIR));

function startFrontend() {
    app.listen(PORT, () => {
        if (process.env.RUN_ALL_MODE === 'true') {
            console.log(`[FRONTEND] ✔ Cổng ${PORT} sẵn sàng (Website: http://localhost:${PORT})`);
            return;
        }
        console.log(`[FRONTEND] Listening on http://localhost:${PORT}`);
    });
}

if (require.main === module) {
    startFrontend();
}

module.exports = { app, startFrontend };
