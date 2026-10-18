/**
 * Web Application Firewall (WAF) & Real-Time Threat Shield
 * Protects endpoints from Path Traversal, LFI, Automated Scanners, and Brute-force attacks.
 * Features ultra-fast in-memory O(1) ban cache + persistent SQLite synchronization.
 */

const net = require('net');
const { getClientIp, isCloudflareIp, isPrivateOrLoopback } = require('./clientIp');

let queryParams = null;
try {
    const hasDriver = (() => {
        try { require.resolve('@journeyapps/sqlcipher'); return true; } catch {}
        try { require.resolve('sqlite3'); return true; } catch {}
        return false;
    })();

    if (hasDriver) {
        const dbModule = require('../../../db/database');
        queryParams = dbModule?.queryParams;
    }
} catch (err) {
    // Database module may be offline or running in mock/test environment
}

// In-Memory ban cache for high-throughput zero-latency checks
const bannedIpsCache = new Set();
let isInitialized = false;

// Strike tracking for suspicious activity: IP -> { count, firstStrike, lastStrike }
const strikeTracker = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of strikeTracker.entries()) {
        if (now - record.lastStrike > 10 * 60 * 1000) {
            strikeTracker.delete(ip);
        }
    }
}, 10 * 60 * 1000).unref();

/**
 * Checks if an IP is immune from being permanently banned (prevents locking out loopback or Cloudflare edge servers)
 */
function isImmuneFromBan(ip) {
    return isPrivateOrLoopback(ip) || isCloudflareIp(ip);
}

/**
 * High-Severity Exploit Signatures:
 * Any request matching these is an unambiguous, malicious attack payload.
 * Triggers an INSTANT AUTO-BAN upon first detection.
 */
const HIGH_SEVERITY_SIGNATURES = [
    // 1. Directory Traversal / Path Traversal / LFI
    /(?:^|[\\/])\.\.(?:[\\/]|$)/,
    /(?:%2e|%252e){2}(?:%2f|%252f|%5c|%255c)/i,
    /\.\.(?:%2f|%5c)/i,
    /(?:%2f|%5c)\.\./i,
    /%c0%af|%c1%9c|%2500|%00|\0/i,

    // 2. Sensitive Linux/Unix files (/proc/self/environ, /etc/passwd, etc.)
    /\/proc\/(?:self|\d+)\/(?:environ|cmdline|status|version|cpuinfo|maps|fd)/i,
    /(?:^|[\\/])proc[\\/]self[\\/]environ/i,
    /\/etc\/(?:passwd|shadow|hosts|group|issue|hostname|crontab)/i,
    /\/dev\/(?:null|zero|random|urandom|shm)/i,

    // 3. Sensitive Windows files
    /(?:win\.ini|system\.ini|boot\.ini|windows[\\/]system32)/i,

    // 4. Exposed Secrets, Environment & Source Control files
    /(?:^|[\\/])\.(?:env|git|svn|hg|bzr|docker)(?:[\\/]|\?|$)/i,
    /(?:^|[\\/])(?:docker-compose\.ya?ml|web\.config|id_rsa|id_dsa|id_ed25519)(?:[\\/]|\?|$)/i,
    /\.(?:sqlite|sqlite3|db|dump|sql|backup|bak)(?:\?|$)/i,

    // 5. Automated Vulnerability Scanner Probes & Known Exploit Paths
    /\/api\/orders\/.*proc/i,                       // Order traversal probe
    /\/api\/w\/(?:default|starter|admins)\/jobs_u/i, // Windmill CVE exploit probe
    /\/api\/console\/api_server/i,                  // Sense API server probe
    /\/api\/fs\/read/i,                             // Arbitrary filesystem read probe
    /\/api\/system\/fileView/i,                     // Arbitrary file view probe
    /\/api\/graphql/i,                              // GraphQL scanning probe
    /\/actuator\/(?:gateway|health|env|heapdump)/i, // Spring Boot Actuator probe
    /\/(?:_profiler|_wdt|solr|v2\/_catalog)/i,      // Framework / Registry probes
    /\/(?:phpmyadmin|pma|adminer|myadmin)/i,        // Database admin scanner probes
    /\/(?:wp-admin|wp-login\.php|xmlrpc\.php)/i,    // WordPress attack probes

    // 6. Remote Code Execution & Injection Probes
    /\$\{jndi:(?:ldap|rmi|dns)/i,                   // Log4j CVE-2021-44228
    /(?:;|\&|\|)\s*(?:curl|wget|bash|sh|powershell|cmd\.exe|nc|ncat)\s+/i // Command injection
];

/**
 * Suspicious Query Patterns (checked inside req.url and raw query strings)
 */
const SUSPICIOUS_QUERY_PATTERNS = [
    /allowOutsideWorkspace\s*=\s*true/i,
    /(?:path|file|apis|target|url|dest|read|view|include|load)\s*=\s*.*(?:proc[\\/]self|\/etc\/|\.\.[\\/])/i,
    /(?:union\s+select|information_schema|order\s+by\s+\d+--)/i,
    /(?:%3c|<)script[\s>]/i
];

/**
 * Safely decodes a URL string up to 2 passes to neutralize multi-layer encoding evasion.
 */
function safelyDecodeUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let decoded = raw;
    for (let i = 0; i < 2; i++) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            break;
        }
    }
    return decoded;
}

/**
 * Initialize WAF: ensures banned_ips table exists and hydrates memory cache.
 */
async function initWaf() {
    if (!queryParams) return;
    try {
        await queryParams(`CREATE TABLE IF NOT EXISTS banned_ips(
            ip TEXT PRIMARY KEY,
            reason TEXT,
            banned_by TEXT,
            banned_at INTEGER
        )`);

        const rows = await queryParams('SELECT ip FROM banned_ips');
        if (Array.isArray(rows)) {
            for (const row of rows) {
                if (row && row.ip) {
                    const clean = row.ip.trim();
                    if (!isImmuneFromBan(clean)) {
                        bannedIpsCache.add(clean);
                    }
                }
            }
        }
        isInitialized = true;
    } catch (err) {
        console.error('[WAF] Initialization error loading banned IPs:', err.message);
    }
}

// Auto-initialize on module import
initWaf();

// Periodically sync in-memory cache with database (every 60 seconds)
setInterval(async () => {
    if (!queryParams) return;
    try {
        const rows = await queryParams('SELECT ip FROM banned_ips');
        if (Array.isArray(rows)) {
            const currentDbIps = new Set();
            for (const r of rows) {
                if (r && r.ip) {
                    const clean = r.ip.trim();
                    if (!isImmuneFromBan(clean)) {
                        currentDbIps.add(clean);
                        bannedIpsCache.add(clean);
                    }
                }
            }
            // Remove unbanned IPs
            for (const cachedIp of bannedIpsCache) {
                if (!currentDbIps.has(cachedIp)) {
                    bannedIpsCache.delete(cachedIp);
                }
            }
        }
    } catch {}
}, 60 * 1000).unref();

/**
 * Checks whether an IP is currently banned in O(1) memory cache.
 * @param {string} ip
 * @returns {boolean}
 */
function isIpBanned(ip) {
    if (!ip || isImmuneFromBan(ip)) return false;
    return bannedIpsCache.has(ip);
}

/**
 * Permanently bans an IP across in-memory cache and SQLite database.
 * Protects immune IPs (loopback and Cloudflare proxy IPs).
 * @param {string} ip
 * @param {string} reason
 * @param {string} [bannedBy='WAF_AUTO_SHIELD']
 */
async function banIp(ip, reason, bannedBy = 'WAF_AUTO_SHIELD') {
    if (!ip || isImmuneFromBan(ip)) return false;

    const normalizedIp = ip.trim();
    bannedIpsCache.add(normalizedIp);

    if (queryParams) {
        try {
            await queryParams(
                `INSERT OR REPLACE INTO banned_ips (ip, reason, banned_by, banned_at) VALUES (?, ?, ?, ?)`,
                [normalizedIp, reason || 'Malicious Attack Pattern', bannedBy, Date.now()]
            );
            console.warn(`[WAF] 🚫 BANNED IP: ${normalizedIp} | Reason: ${reason}`);
            return true;
        } catch (err) {
            console.error(`[WAF] Failed to persist IP ban for ${normalizedIp}:`, err.message);
            return false;
        }
    }
    return true;
}

/**
 * Removes an IP from ban list.
 * @param {string} ip
 */
async function unbanIp(ip) {
    if (!ip) return false;
    const normalizedIp = ip.trim();
    bannedIpsCache.delete(normalizedIp);
    if (queryParams) {
        try {
            await queryParams(`DELETE FROM banned_ips WHERE ip = ?`, [normalizedIp]);
            console.log(`[WAF] ✅ Unbanned IP: ${normalizedIp}`);
            return true;
        } catch (err) {
            console.error(`[WAF] Failed to remove IP ban for ${normalizedIp}:`, err.message);
            return false;
        }
    }
    return true;
}

/**
 * Inspects a request for malicious payloads.
 * @param {import('http').IncomingMessage | import('express').Request} req
 * @returns {{ isMalicious: boolean, isHighSeverity: boolean, reason: string }}
 */
function inspectMaliciousRequest(req) {
    const rawUrl = req.originalUrl || req.url || '';

    // Guard against excessive URL length attacks (>4096 chars)
    if (rawUrl.length > 4096) {
        return {
            isMalicious: true,
            isHighSeverity: true,
            reason: 'Excessively long URL (>4096 characters)'
        };
    }

    const decodedUrl = safelyDecodeUrl(rawUrl);

    // 1. High-severity signature checks against both raw and decoded URLs
    for (const regex of HIGH_SEVERITY_SIGNATURES) {
        if (regex.test(rawUrl) || regex.test(decodedUrl)) {
            return {
                isMalicious: true,
                isHighSeverity: true,
                reason: `Triggered high-severity exploit signature: ${regex}`
            };
        }
    }

    // 2. Suspicious query parameters
    for (const regex of SUSPICIOUS_QUERY_PATTERNS) {
        if (regex.test(rawUrl) || regex.test(decodedUrl)) {
            return {
                isMalicious: true,
                isHighSeverity: true,
                reason: `Triggered suspicious query parameter exploit: ${regex}`
            };
        }
    }

    return { isMalicious: false, isHighSeverity: false, reason: '' };
}

/**
 * Express middleware to shield against attacks.
 */
function wafMiddleware(req, res, next) {
    const clientIp = getClientIp(req);

    // 1. Check if IP is already banned (instant 403)
    if (isIpBanned(clientIp)) {
        if (req.url && req.url.startsWith('/api')) {
            return res.status(403).json({
                success: false,
                error: 'Access Denied: Your IP has been blocked by security firewall.'
            });
        }
        return res.status(403).send('<h1 style="text-align:center;margin-top:20%;font-family:sans-serif;">403 Forbidden - Access Denied</h1>');
    }

    // 2. Inspect request for malicious payloads
    const threat = inspectMaliciousRequest(req);
    if (threat.isMalicious) {
        if (threat.isHighSeverity) {
            // Immediate ban on severe exploit probe
            banIp(clientIp, threat.reason, 'WAF_AUTO_BAN');
            console.warn(`[WAF SHIELD] 🚨 AUTO-BANNED ${clientIp} for severe attack: ${req.method} ${req.originalUrl || req.url} (${threat.reason})`);
            return res.status(403).json({
                success: false,
                error: 'Forbidden: Malicious activity detected and IP has been blocked.'
            });
        }

        // Suspicious probe (strike accumulation)
        const now = Date.now();
        const record = strikeTracker.get(clientIp) || { count: 0, firstStrike: now, lastStrike: now };
        record.count += 1;
        record.lastStrike = now;
        strikeTracker.set(clientIp, record);

        if (record.count >= 3) {
            banIp(clientIp, `Accumulated 3 suspicious request strikes: ${threat.reason}`, 'WAF_STRIKE_BAN');
            console.warn(`[WAF SHIELD] 🚨 AUTO-BANNED ${clientIp} after 3 suspicious strikes: ${req.method} ${req.originalUrl || req.url}`);
        }

        return res.status(403).json({
            success: false,
            error: 'Forbidden'
        });
    }

    next();
}

module.exports = {
    wafMiddleware,
    isIpBanned,
    banIp,
    unbanIp,
    inspectMaliciousRequest,
    initWaf,
    isImmuneFromBan,
    HIGH_SEVERITY_SIGNATURES
};
