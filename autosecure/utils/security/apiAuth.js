/**
 * API Authentication & Authorization Middleware
 * Protects Express API endpoints with API key validation and security headers.
 * 
 * Usage:
 *   const { apiKeyAuth, securityHeaders } = require('./autosecure/utils/security/apiAuth');
 *   app.use(securityHeaders);
 *   app.use('/api/admin', apiKeyAuth);
 */

const crypto = require('crypto');

/**
 * Validates API key using constant-time comparison to prevent timing attacks.
 * The API key must be sent in the `Authorization` header as `Bearer <key>`
 * or in the `X-API-Key` header.
 * 
 * @param {string} configuredKey - The expected API key from config/env
 * @returns {import('express').RequestHandler}
 */
function createApiKeyAuth(configuredKey) {
    return (req, res, next) => {
        if (!configuredKey) {
            console.error('[API_AUTH] API authentication is disabled because no AUTH_KEY is configured. Rejecting request.');
            return res.status(503).json({
                success: false,
                error: 'Service not configured. Contact administrator.'
            });
        }

        let providedKey = '';

        // Check Authorization: Bearer <key>
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            providedKey = authHeader.slice(7).trim();
        }

        // Fallback to X-API-Key header
        if (!providedKey) {
            providedKey = (req.headers['x-api-key'] || '').trim();
        }

        if (!providedKey) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Provide API key via Authorization header or X-API-Key.'
            });
        }

        // Constant-time comparison to prevent timing attacks
        const keyBuffer = Buffer.from(configuredKey, 'utf8');
        const providedBuffer = Buffer.from(providedKey, 'utf8');

        if (keyBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
            return res.status(403).json({
                success: false,
                error: 'Invalid API key.'
            });
        }

        next();
    };
}

/**
 * Security headers middleware.
 * Adds standard HTTP security headers to all responses.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function securityHeaders(req, res, next) {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Enable XSS filter in older browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Prevent content from being embedded
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // Remove server identification header
    res.removeHeader('X-Powered-By');

    // Content Security Policy for API responses
    if (req.url.startsWith('/api/')) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }

    // Strict Transport Security (let reverse proxy handle HTTPS, but set header for belt-and-suspenders)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
}

/**
 * Validates that an incoming internal proxy request originates from loopback.
 * Used by backendServer to ensure requests only come from frontendServer.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function loopbackOnly(req, res, next) {
    const remoteAddr = req.socket && req.socket.remoteAddress;
    const isLoopback = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';

    if (!isLoopback) {
        return res.status(403).json({
            success: false,
            error: 'Access denied.'
        });
    }

    next();
}

module.exports = {
    createApiKeyAuth,
    securityHeaders,
    loopbackOnly
};
