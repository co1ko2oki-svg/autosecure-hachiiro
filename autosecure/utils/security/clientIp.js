/**
 * Canonical Client IP Resolution & Trusted Proxy Security Utility
 * Eliminates IP spoofing via forged X-Forwarded-For headers.
 * Relies strictly on Express's validated req.ip / req.ips engine.
 */

/**
 * Returns canonical client IP address safely without trusting unvalidated headers.
 * @param {import('express').Request} req
 * @returns {string} Normalized IPv4 or IPv6 address
 */
function getClientIp(req) {
    if (!req) return '127.0.0.1';

    // 1. Use Express's validated req.ip (computed via configured trust proxy)
    let ip = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';

    // 2. Normalize IPv4-mapped IPv6 address (::ffff:192.168.1.1 -> 192.168.1.1)
    if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    // 3. Fallback for IPv6 loopback
    if (ip === '::1') {
        ip = '127.0.0.1';
    }

    return ip;
}

/**
 * Configures Express application trust proxy setting securely based on deployment topology.
 * @param {import('express').Application} app
 * @param {string} [mode='edge'] 'edge' for public entry servers, 'loopback' for internal backend servers
 */
function configureTrustProxy(app, mode = 'edge') {
    if (mode === 'loopback') {
        // Internal backend only accepts requests from local reverse proxy (frontendServer on 127.0.0.1)
        app.set('trust proxy', 'loopback');
        return;
    }

    // Edge servers: If an explicit proxy trust list is defined in environment, use it
    if (process.env.TRUSTED_PROXIES) {
        // Can be comma-separated list of IPs/CIDRs
        const proxies = process.env.TRUSTED_PROXIES.split(',').map(p => p.trim());
        app.set('trust proxy', proxies.length === 1 ? proxies[0] : proxies);
    } else if (process.env.TRUST_PROXY) {
        const val = process.env.TRUST_PROXY.trim();
        if (/^\d+$/.test(val)) {
            app.set('trust proxy', parseInt(val, 10));
        } else {
            app.set('trust proxy', val);
        }
    } else {
        // Default for standard deployment behind 1 reverse proxy hop (Nginx / Cloudflare)
        // Never set to true (which trusts arbitrary client-supplied X-Forwarded-For)
        app.set('trust proxy', 1);
    }
}

module.exports = {
    getClientIp,
    configureTrustProxy
};
