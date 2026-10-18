/**
 * Canonical Client IP Resolution & Trusted Proxy Security Utility
 * Accurately resolves real client IP behind Cloudflare, reverse proxies, and direct TCP sockets.
 */

const net = require('net');

/**
 * Checks whether an IP is a public Internet routable address.
 * Rejects private, loopback, multicast, or link-local addresses.
 * @param {string} ip
 * @returns {boolean}
 */
function isPublicIp(ip) {
    if (!ip || !net.isIP(ip)) return false;

    // Reject loopback (127.0.0.0/8 and ::1)
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) return false;

    // IPv4 checks
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 10) return false;                           // 10.0.0.0/8
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16.0.0/12
        if (parts[0] === 192 && parts[1] === 168) return false;      // 192.168.0.0/16
        if (parts[0] === 169 && parts[1] === 254) return false;      // 169.254.0.0/16 (link-local)
        if (parts[0] === 0 || parts[0] >= 224) return false;        // Current network & Multicast/Reserved
        return true;
    }

    // IPv6 checks
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return false;
    return true;
}

/**
 * Normalizes and validates an IP string.
 * @param {string} rawIp
 * @returns {string|null}
 */
function cleanIp(rawIp) {
    if (!rawIp || typeof rawIp !== 'string') return null;
    let ip = rawIp.trim();

    // If multiple IPs are present in comma-separated header, take the first valid one
    if (ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }

    // Normalize IPv4-mapped IPv6 address (::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    // Normalize IPv6 loopback
    if (ip === '::1') {
        ip = '127.0.0.1';
    }

    return net.isIP(ip) ? ip : null;
}

// Cloudflare IPv4 ranges to recognize authentic Cloudflare edge proxy servers
const CLOUDFLARE_V4_RANGES = [
    ['173.245.48.0', 20],
    ['103.21.244.0', 22],
    ['103.22.200.0', 22],
    ['103.31.4.0', 22],
    ['141.101.64.0', 18],
    ['108.162.192.0', 18],
    ['190.93.240.0', 20],
    ['188.114.96.0', 20],
    ['197.234.240.0', 22],
    ['198.41.128.0', 17],
    ['162.158.0.0', 15],
    ['104.16.0.0', 13],
    ['104.24.0.0', 14],
    ['172.64.0.0', 13],
    ['131.0.72.0', 22]
];

function ipToLong(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

function inSubnet(ipLong, subnetIp, maskBits) {
    const subnetLong = ipToLong(subnetIp);
    if (ipLong === null || subnetLong === null) return false;
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (ipLong & mask) === (subnetLong & mask);
}

function isCloudflareIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const long = ipToLong(ip);
    if (long === null) {
        const lower = ip.toLowerCase();
        return (
            lower.startsWith('2400:cb00:') ||
            lower.startsWith('2606:4700:') ||
            lower.startsWith('2803:f800:') ||
            lower.startsWith('2405:b500:') ||
            lower.startsWith('2405:8100:') ||
            lower.startsWith('2a06:98c') ||
            lower.startsWith('2c0f:f248:')
        );
    }
    for (const [subnet, mask] of CLOUDFLARE_V4_RANGES) {
        if (inSubnet(long, subnet, mask)) return true;
    }
    return false;
}

function isPrivateOrLoopback(ip) {
    if (!ip || typeof ip !== 'string') return true;
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    const long = ipToLong(ip);
    if (long === null) {
        const lower = ip.toLowerCase();
        return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc00:') || lower.startsWith('fd00:');
    }
    return (
        inSubnet(long, '10.0.0.0', 8) ||
        inSubnet(long, '172.16.0.0', 12) ||
        inSubnet(long, '192.168.0.0', 16) ||
        inSubnet(long, '127.0.0.0', 8)
    );
}

function isTrustedProxy(ip) {
    if (!ip) return false;
    return isPrivateOrLoopback(ip) || isCloudflareIp(ip);
}

/**
 * Returns canonical client IP address safely.
 * Only accepts public IPs from reverse-proxy headers if the connecting socket originates from a trusted proxy (Cloudflare or internal reverse proxy).
 * Protects against IP-spoofing attacks that attempt to bypass rate limits or WAF IP bans.
 * @param {import('express').Request | import('http').IncomingMessage} req
 * @returns {string} Normalized IPv4 or IPv6 address
 */
function getClientIp(req) {
    if (!req) return '127.0.0.1';

    // 1. Resolve raw socket remote address
    const socketIp = cleanIp(req.socket && req.socket.remoteAddress) || '127.0.0.1';

    // 2. Anti-Spoofing Guard:
    // If connection did NOT originate from a trusted proxy (loopback, private LAN, or verified Cloudflare edge),
    // any proxy headers (cf-connecting-ip, x-real-ip, x-forwarded-for) are untrusted and must be rejected!
    if (!isTrustedProxy(socketIp)) {
        return socketIp;
    }

    const headers = req.headers || {};

    // 3. Cloudflare Real Visitor IP (cf-connecting-ip) - must be public IP
    const cfIp = cleanIp(headers['cf-connecting-ip']);
    if (cfIp && isPublicIp(cfIp)) return cfIp;

    // 4. True-Client-IP header (Cloudflare Enterprise / Akamai) - must be public IP
    const trueClientIp = cleanIp(headers['true-client-ip']);
    if (trueClientIp && isPublicIp(trueClientIp)) return trueClientIp;

    // 5. X-Real-IP header (standard Nginx / Envoy) - must be public IP
    const xRealIp = cleanIp(headers['x-real-ip']);
    if (xRealIp && isPublicIp(xRealIp)) return xRealIp;

    // 6. X-Forwarded-For header (leftmost public IP)
    const xForwarded = headers['x-forwarded-for'];
    if (typeof xForwarded === 'string' && xForwarded.trim()) {
        const parts = xForwarded.split(',');
        for (const p of parts) {
            const candidate = cleanIp(p);
            if (candidate && isPublicIp(candidate)) {
                return candidate;
            }
        }
    }

    // 7. Express validated req.ip
    const expressIp = cleanIp(req.ip);
    if (expressIp && isPublicIp(expressIp)) return expressIp;

    return socketIp;
}

/**
 * Configures Express application trust proxy setting securely based on deployment topology.
 * @param {import('express').Application} app
 * @param {string} [mode='edge'] 'edge' for public entry servers, 'loopback' for internal backend servers
 */
function configureTrustProxy(app, mode = 'edge') {
    if (mode === 'loopback') {
        app.set('trust proxy', 'loopback');
        return;
    }

    if (process.env.TRUSTED_PROXIES) {
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
        app.set('trust proxy', 1);
    }
}

module.exports = {
    getClientIp,
    configureTrustProxy,
    cleanIp,
    isPublicIp,
    isCloudflareIp,
    isPrivateOrLoopback,
    isTrustedProxy
};
