const http = require('http');
const config = require("../../configLoader");
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { handleAppealPost, handleSubmitKey } = require('./handleappealnapi.js');
const { transferLicense } = require("../../autosecure/utils/bot/transferlicense.js");
const { queryParams } = require('../../db/database.js');
const { getUser } = require('../../db/usersCache.js');
const { getuserdata } = require('../../db/getuserdata.js');
const { registerServer } = require("../../autosecure/utils/process/gracefulShutdown");

const { getClientIp } = require("../../autosecure/utils/security/clientIp");
const { isIpBanned, banIp, inspectMaliciousRequest } = require("../../autosecure/utils/security/waf");

// Secure JWT Secret: Must come from environment or config, never hardcoded or silently generated fallback
const jwtsecret = config.jwtsecret || process.env.JWT_SECRET;
if (!jwtsecret || typeof jwtsecret !== 'string' || jwtsecret.length < 32) {
    throw new Error('[SECURITY FATAL] JWT_SECRET must be configured in persistent .env with at least 32 characters.');
}

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// Failed authentication tracking for Brute-Force Shield
const failedAuthTracker = new Map();
function recordFailedAuth(ip) {
    const now = Date.now();
    const record = failedAuthTracker.get(ip) || { count: 0, lastAttempt: now };
    if (now - record.lastAttempt > 15 * 60 * 1000) {
        record.count = 0;
    }
    record.count += 1;
    record.lastAttempt = now;
    failedAuthTracker.set(ip, record);
    return record.count;
}
function clearFailedAuth(ip) {
    failedAuthTracker.delete(ip);
}

// Rate limiter per IP for API port (sliding 1-minute window)
const reqRateTracker = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const record = reqRateTracker.get(ip) || { count: 0, windowStart: now };
    if (now - record.windowStart > 60 * 1000) {
        record.count = 1;
        record.windowStart = now;
        reqRateTracker.set(ip, record);
        return false;
    }
    record.count += 1;
    reqRateTracker.set(ip, record);
    return record.count > 60; // Max 60 requests per minute
}

// Cleanup trackers periodically every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of failedAuthTracker.entries()) {
        if (now - record.lastAttempt > 15 * 60 * 1000) failedAuthTracker.delete(ip);
    }
    for (const [ip, record] of reqRateTracker.entries()) {
        if (now - record.windowStart > 60 * 1000) reqRateTracker.delete(ip);
    }
}, 10 * 60 * 1000).unref();

// Prevent multiple server instances
let serverInstance = null;

const server = http.createServer(async (req, res) => {
    const clientIp = getClientIp(req);

    // 1. Instant drop for banned IPs
    if (isIpBanned(clientIp)) {
        req.socket.destroy();
        return;
    }

    // 2. Malicious exploit scanner detection (instant auto-ban)
    const threat = inspectMaliciousRequest(req);
    if (threat.isMalicious) {
        await banIp(clientIp, `Exploit probe on API port: ${req.url} (${threat.reason})`, 'API_GUARD');
        console.warn(`[API GUARD] 🚨 AUTO-BANNED IP ${clientIp} for exploit attempt: ${req.method} ${req.url}`);
        req.socket.destroy();
        return;
    }

    // 3. Sliding rate limit
    if (isRateLimited(clientIp)) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: "Too many requests" }));
    }

    // 4. Safely parse request pathname to eliminate URL confusion vulnerabilities
    let pathname = '/';
    try {
        pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch {
        pathname = (req.url || '/').split('?')[0];
    }

    // Public Healthcheck Endpoint
    if (pathname === '/' || pathname === '/health') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ status: "ok" }));
    }

    // 5. Strict Authentication (required for all API endpoints)
    const headers = req.headers;
    const configuredAuthKey = config.authkey;
    const isAuthKeyConfigured = typeof configuredAuthKey === 'string' && configuredAuthKey.trim() !== '' && configuredAuthKey !== 'LOAD_FROM_ENV';
    const authKeyValid = isAuthKeyConfigured && typeof headers["key"] === 'string' && safeCompare(headers["key"], configuredAuthKey);

    if (!authKeyValid) {
        const strikes = recordFailedAuth(clientIp);
        if (strikes >= 3) {
            await banIp(clientIp, `Repeated unauthorized access / brute-force on API port (3 failed attempts)`, 'API_BRUTE_FORCE_GUARD');
            console.warn(`[API GUARD] 🚨 AUTO-BANNED IP ${clientIp} after 3 failed auth attempts on API port`);
            req.socket.destroy();
            return;
        }

        console.warn(`[API GUARD] ⚠️ Unauthorized access attempt by IP: ${clientIp} (Strike ${strikes}/3)`);
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    // Clear failed attempts upon successful authentication
    clearFailedAuth(clientIp);

    if (pathname === '/handleappealresult') {
        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'text/plain');
            return res.end('Only POST method is supported');
        }

        let body = '';
        let bodyLength = 0;
        const MAX_BODY = 64 * 1024;
        let isAborted = false;

        req.on('data', chunk => {
            if (isAborted) return;
            bodyLength += chunk.length;
            if (bodyLength > MAX_BODY) {
                isAborted = true;
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: "Payload too large" }));
            }
            body += chunk.toString();
        });

        req.on('end', async () => {
            if (isAborted) return;
            await handleAppealPost(res, body);
        });

    } else if (pathname === '/submitkey') {
        console.log(`[API] Received submitkey from ${clientIp}`);
        await handleSubmitKey(res, headers);

    } else if (pathname === '/transferlicense') {
        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ 
                error: true,
                message: 'Only POST method is supported for transfer'
            }));
        }

        let body = '';
        let bodyLength = 0;
        const MAX_BODY = 64 * 1024;
        let isAborted = false;

        req.on('data', chunk => {
            if (isAborted) return;
            bodyLength += chunk.length;
            if (bodyLength > MAX_BODY) {
                isAborted = true;
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: true, message: 'Payload too large' }));
            }
            body += chunk.toString();
        });

        req.on('end', async () => {
            if (isAborted) return;
            try {
                const data = JSON.parse(body);
                const authHeader = req.headers['authorization'];
                
                if (!authHeader) {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: true, result: "Unauthorized" }));
                }

                const parts = authHeader.split(' ');
                const token = parts.length === 2 ? parts[1] : authHeader;
                const decoded = jwt.verify(token, jwtsecret, { algorithms: ['HS256'] });
                
                if (!decoded?.license || !decoded?.user_id) {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: true, result: "Couldn't validate your token!" }));
                }

                if (!data?.newUserId || !/^\d{17,20}$/.test(String(data.newUserId).trim())) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ 
                        error: true, 
                        message: "A valid Discord newUserId is required" 
                    }));
                }

                const targetUserId = String(data.newUserId).trim();
                const newLicenseKey = await transferLicense(decoded.license, decoded.user_id, targetUserId);
                
                if (!newLicenseKey) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ 
                        error: true, 
                        result: "Failed to transfer license: license not found or not owned by user!" 
                    }));
                }

                const newToken = jwt.sign({ license: newLicenseKey, user_id: targetUserId }, jwtsecret, { expiresIn: '1h' });
                let user = await getUser(targetUserId);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Set-Cookie', `token=${newToken}; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`);

                let resultMessage =
                  user && user.username && user.username !== "Unknown User" && user.username !== "Couldn't fetch your discord user" && user.username !== "User Cacher isn't accessible!" && user.username !== "Invalid ID"
                    ? `Transferred your license to ${user.username} (id: ${targetUserId}) successfully. Here's your new license key ${newLicenseKey} (Please save this, if you lose it, you cannot regain access).`
                    : `Transferred your license to id: ${targetUserId} successfully. Here's your new license key ${newLicenseKey} (Please save this, if you lose it, you cannot regain access).`;

                res.end(JSON.stringify({
                  error: false,
                  result: resultMessage,
                  newToken: newToken
                }));

            } catch (error) {
                console.error("[API transferlicense] Error:", error);
                res.statusCode = error.name === 'JsonWebTokenError' ? 401 : 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                    error: true, 
                    result: error.name === 'JsonWebTokenError' ? "Invalid token" : "Failed to transfer your license!" 
                }));
            }
        });

    } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: "Endpoint not found" }));
    }
});

async function startserver() {
    if (config.novps === true || config.novps === "true") return;
    
    // Prevent multiple server instances
    if (serverInstance) {
        console.log('API server already running, skipping startup.');
        return;
    }
    
    const PORT = config.apiPort || 8080;
    const HOST = process.env.API_HOST || config.apiHost || '0.0.0.0';
    
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${PORT} is already in use. Trying next port...`);
            const nextPort = PORT + 1;
            server.listen(nextPort, HOST, () => {
                console.log(`API server listening on ${HOST}:${nextPort}`);
                serverInstance = server;
            });
        } else {
            console.error('Server error:', err);
        }
    });
    
    server.listen(PORT, HOST, () => {
        console.log(`API server listening on ${HOST}:${PORT}`);
        serverInstance = server;
        registerServer(server);
    });
}

// Only start server if not already running
if (!serverInstance) {
    startserver();
}

module.exports = { server, startserver };
