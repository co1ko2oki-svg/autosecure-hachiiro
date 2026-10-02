/**
 * GDPR & PCI-DSS Compliant Sensitive Data Redactor.
 * Automatically masks and sanitizes PII and authentication credentials in log messages.
 * 
 * Rules:
 * - GDPR: Mask personal data (Emails -> u***r@domain.com, IPs -> 192.168.***.***)
 * - PCI-DSS / OWASP CWE-532: Forbid storing sensitive auth data in logs
 *   (Passwords, OTP codes, Recovery codes, TOTP secrets, Session cookies, Bearer tokens)
 * - Observability: Preserve operational context (IGN, timestamps, status, durations, error traces)
 */

const crypto = require('crypto');

// Luhn algorithm check for PCI-DSS PAN (credit card) detection
function isValidLuhn(numStr) {
    const digits = numStr.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits.charAt(i), 10);
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
}

/**
 * Mask an email address according to GDPR (u***r@domain.com)
 */
function maskEmail(email) {
    if (!email || typeof email !== 'string') return email;
    return email.replace(/([a-zA-Z0-9_.+-]{1,64})@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, (match, user, domain) => {
        if (user.length <= 2) {
            return `${user[0]}***@${domain}`;
        }
        return `${user[0]}***${user[user.length - 1]}@${domain}`;
    });
}

/**
 * Mask an IP address according to GDPR (mask host identifier, retain network subnet)
 */
function maskIp(str) {
    if (!str || typeof str !== 'string') return str;
    // IPv4 masking: 123.45.67.89 -> 123.45.***.***
    let res = str.replace(/\b((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.)(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g, '$1***.***');
    // IPv6 masking: preserve first 2 groups
    res = res.replace(/\b([0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}):[0-9a-fA-F:]+\b/g, '$1:****:****');
    return res;
}

/**
 * Mask OTP / Verification codes
 */
function maskOtp(code) {
    if (!code || typeof code !== 'string') return code;
    const clean = code.trim();
    if (clean.length <= 3) return '***';
    return '***' + clean.slice(-3);
}

/**
 * List of sensitive key names for deep object traversal
 */
const SENSITIVE_OBJECT_KEYS = new Set([
    'password', 'pw', 'passwd', 'oldpassword', 'newpassword', 'userpassword',
    'secret', 'secretkey', 'privatekey', 'recoverycode', 'recovery',
    'token', 'accesstoken', 'refreshtoken', 'mctoken', 'xststoken', 'sessionid',
    'authorization', 'cookie', 'cookies', 'set-cookie', 'amrpssecauth', 'mspok',
    'msprequ', 'uaid', 'ppft', 'hostcookie', 'cvv', 'cvc', 'cardnumber', 'creditcard'
]);

/**
 * Main string sanitization engine
 */
function sanitizeString(raw) {
    if (!raw || typeof raw !== 'string') return raw;

    let text = raw;

    // 1. Emails (GDPR)
    text = maskEmail(text);

    // 2. IP Addresses (GDPR)
    text = maskIp(text);

    // 3. Microsoft Recovery Codes (25 alphanumeric: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)
    text = text.replace(/\b[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}\b/g, '[RECOVERY CODE REDACTED]');

    // 4. JWT & OAuth Bearer Tokens
    text = text.replace(/Bearer\s+[A-Za-z0-9-_=.]+/gi, 'Authorization=[REDACTED]');
    text = text.replace(/(["']?authorization["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^"',\r\n\s}\]]+(["']?)/gi, '$1[REDACTED]$2');
    text = text.replace(/\beyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]+\b/g, '[REDACTED]');

    // 5. Discord Bot Tokens & Config/Env Tokens
    text = text.replace(/\b(?:BOT_TOKEN|TOKEN)\s*=\s*[^\r\n\s]+/gi, 'BOT_TOKEN=[REDACTED]');
    text = text.replace(/\b[M-Z][A-Za-z0-9]{23,28}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27,38}\b/g, '[REDACTED]');

    // 6. Discord Webhook URLs (keep webhook ID, redact token)
    text = text.replace(/(https?:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/)([A-Za-z0-9-_]+)/gi, '$1[REDACTED]');
    text = text.replace(/\b(?:NOTIFIER_WEBHOOK|WEBHOOK)\s*=\s*[^\r\n\s]+/gi, 'NOTIFIER_WEBHOOK=[REDACTED]');

    // 7. JWT Secret in logs & environment variables
    text = text.replace(/\b(?:JWT_SECRET|jwtsecret)\s*=\s*[^\r\n\s]+/gi, 'JWT_SECRET=[REDACTED]');
    text = text.replace(/(["']?(?:jwtsecret|jwt_secret)["']?\s*[:=]\s*["']?)([^"',\r\n\s}\]]+)(["']?)/gi, '$1[REDACTED]$3');

    // 8. Passwords in labeled logs & JSON/Query strings
    // Matches: "password": "...", password: ..., Pw: ..., Mật khẩu mới : ...
    text = text.replace(/(["']?(?:password|passwd|pw|newpassword|oldpassword|mật\s*khẩu(?:\s*mới)?|userpassword)["']?\s*[:=]\s*["']?)([^"',\r\n\s}\]]+)(["']?)/gi, '$1[REDACTED]$3');

    // 9. OTP / Verification codes in labeled logs
    // Matches: "code": "...", Code: ..., Mã OTP : ..., otc: ..., OTP=...
    text = text.replace(/\bOTP\s*=\s*\d+/gi, 'OTP=[REDACTED]');
    text = text.replace(/(["']?(?:otp|otc|code|mã\s*otp|verification_code|security\s*code)["']?\s*[:=]\s*["']?)([0-9]{4,8})(["']?)/gi, '$1[REDACTED]$3');

    // 10. Sensitive Cookie names & values
    text = text.replace(/\b(AMRPSSecAuth|MSPOK|MSPRequ|uaid|ppft|HostCookie|RPSAuth|token|ssid)=([^;\r\n\s,]+)/gi, '$1=[REDACTED]');

    // 11. TOTP Secret Keys & rvtkn in labeled logs
    text = text.replace(/(["']?(?:secretkey|secret\s*key|rvtkn|proofid|authkey)["']?\s*[:=]\s*["']?)([A-Za-z0-9+/=_-]{10,})(["']?)/gi, '$1[REDACTED]$3');

    // 12. Proxy Credentials
    text = text.replace(/\b(?:PROXY_PASSWORD|PROXY_PASS)\s*=\s*[^\r\n\s]+/gi, 'PROXY_PASSWORD=[REDACTED]');
    text = text.replace(/\b(?:PROXY_\d+|SOCKS_PROXY_\d+)\s*=\s*([^:\r\n\s]+):(\d+):([^:\r\n\s]+):([^\r\n\s]+)/gi, '$1=$2:***:[REDACTED]');
    text = text.replace(/([a-zA-Z0-9_.+-]+):([^@\s:/?#]+)@([a-zA-Z0-9.-]+:\d+)/g, '$1:[REDACTED]@$3');

    // 13. Payment Card Numbers (PCI-DSS PAN with Luhn check)
    text = text.replace(/\b(?:\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}|\d{13,19})\b/g, (match) => {
        const cleaned = match.replace(/[\s-]/g, '');
        if (isValidLuhn(cleaned)) {
            const last4 = cleaned.slice(-4);
            return `****-****-****-${last4}`;
        }
        return match;
    });

    return text;
}

/**
 * Deep recursive object sanitizer
 */
function sanitizeObject(obj, seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'symbol') {
        return obj;
    }

    if (Buffer.isBuffer(obj)) {
        return obj;
    }

    if (typeof obj === 'object') {
        if (seen.has(obj)) {
            return '[Circular Reference]';
        }
        seen.add(obj);

        // Handle Error instances specially to preserve stack trace but sanitize message
        if (obj instanceof Error) {
            const sanitizedErr = new Error(sanitizeString(obj.message));
            sanitizedErr.name = obj.name;
            sanitizedErr.stack = sanitizeString(obj.stack || '');
            if (obj.code) sanitizedErr.code = obj.code;
            // Axios error properties cleanup
            if (obj.config) {
                sanitizedErr.config = {
                    url: sanitizeString(obj.config.url),
                    method: obj.config.method,
                    headers: sanitizeObject(obj.config.headers, seen),
                    data: sanitizeObject(obj.config.data, seen)
                };
            }
            if (obj.response) {
                sanitizedErr.response = {
                    status: obj.response.status,
                    statusText: obj.response.statusText,
                    headers: sanitizeObject(obj.response.headers, seen),
                    data: sanitizeObject(obj.response.data, seen)
                };
            }
            return sanitizedErr;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => sanitizeObject(item, seen));
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
            if (SENSITIVE_OBJECT_KEYS.has(lowerKey) || lowerKey.includes('pass') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('auth') || lowerKey.includes('cookie') || lowerKey.includes('webhook')) {
                sanitized[key] = '[REDACTED]';
            } else if (lowerKey.includes('email')) {
                sanitized[key] = typeof value === 'string' ? maskEmail(value) : sanitizeObject(value, seen);
            } else if (lowerKey.includes('ip') || lowerKey === 'remoteaddress') {
                sanitized[key] = typeof value === 'string' ? maskIp(value) : sanitizeObject(value, seen);
            } else if (lowerKey.includes('otp') || lowerKey === 'code' || lowerKey === 'otc') {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = sanitizeObject(value, seen);
            }
        }
        return sanitized;
    }

    return obj;
}

/**
 * Universal sanitize function for any argument
 */
function sanitize(arg) {
    if (typeof arg === 'string') {
        return sanitizeString(arg);
    }
    return sanitizeObject(arg);
}

module.exports = {
    sanitize,
    sanitizeString,
    sanitizeObject,
    maskEmail,
    maskIp,
    maskOtp
};
