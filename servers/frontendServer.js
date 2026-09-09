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
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'dist');

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

app.get('/gift/:code', (req, res) => {
    res.redirect(`/store?gift=true&code=${encodeURIComponent(req.params.code)}`);
});
app.get('/gift', (req, res) => {
    res.redirect('/store?gift=true');
});

app.use(express.static(FRONTEND_DIR));

// All web routes served by the React TSX SPA
app.get('{*path}', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

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
