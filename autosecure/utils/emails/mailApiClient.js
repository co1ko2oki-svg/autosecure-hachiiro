const config = require("../../../config.json");

const DEFAULT_DOMAINS = [
    "mail.hotwar.asia",
    "hotwar.top",
    "donuttsmp.store",
    "ryuuu.xyz"
];

const API_BASE_URL = (
    process.env.MAIL_API_URL || 
    config?.mailApi?.url || 
    "https://mail.hotwar.asia"
).replace(/\/+$/, "");

const API_KEY = (
    process.env.MAIL_API_KEY || 
    config?.mailApi?.apiKey || 
    "8853067346148af0c072071ddac92f63"
).trim();

let cachedDomains = null;
let lastDomainsFetch = 0;
const DOMAINS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch active domains from mail API with in-memory caching.
 * Falls back to DEFAULT_DOMAINS on any network or parsing error.
 */
async function getAvailableDomains() {
    const now = Date.now();
    if (cachedDomains && (now - lastDomainsFetch < DOMAINS_CACHE_TTL)) {
        return cachedDomains;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(`${API_BASE_URL}/api/domains`, {
            method: "POST",
            headers: {
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({}),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (data?.success && Array.isArray(data.domains) && data.domains.length > 0) {
                cachedDomains = data.domains.map(d => String(d).trim().toLowerCase());
                lastDomainsFetch = now;
                return cachedDomains;
            }
        }
    } catch (err) {
        // Silently fall back to predefined domains
    }

    cachedDomains = (config.domains && config.domains.length > 0) ? config.domains : DEFAULT_DOMAINS;
    lastDomainsFetch = now;
    return cachedDomains;
}

/**
 * Randomly select 1 domain out of the 4 active domains.
 */
async function getRandomDomain() {
    const domains = await getAvailableDomains();
    if (!domains || domains.length === 0) {
        return DEFAULT_DOMAINS[Math.floor(Math.random() * DEFAULT_DOMAINS.length)];
    }
    const idx = Math.floor(Math.random() * domains.length);
    return domains[idx];
}

/**
 * Create a new security mailbox on mail.hotwar.asia
 * @param {Object} options
 * @param {string} options.prefix - Prefix for the email address
 * @param {string} [options.domain] - Optional specific domain. If not specified, random 1 of 4 domains is picked.
 * @param {string} options.password - Password for the mailbox
 * @returns {Promise<{success: boolean, email: string, domain: string, password: string}>}
 */
async function createSecurityMailbox({ prefix, domain, password }) {
    const cleanPrefix = String(prefix || "user").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    const targetDomain = (domain ? String(domain).trim().toLowerCase() : await getRandomDomain());
    const pass = password || "pass" + Math.floor(100000 + Math.random() * 900000);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${API_BASE_URL}/api/mails/custom_create`, {
            method: "POST",
            headers: {
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prefix: cleanPrefix,
                domain: targetDomain,
                password: pass
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (data?.success && data.email) {
                return {
                    success: true,
                    email: data.email.toLowerCase().trim(),
                    domain: targetDomain,
                    password: pass,
                    fromApi: true
                };
            }
        }
    } catch (err) {
        console.warn(`[MAIL_API] custom_create request failed (${err.message}). Using fallback local address.`);
    }

    // Resilient fallback: Construct the email directly with the selected random domain
    return {
        success: true,
        email: `${cleanPrefix}@${targetDomain}`.toLowerCase(),
        domain: targetDomain,
        password: pass,
        fromApi: false
    };
}

/**
 * Fetch up to 50 latest emails for a specific mailbox from the web API.
 * @param {string} email
 * @returns {Promise<Array>}
 */
async function fetchEmails(email) {
    if (!email || typeof email !== "string") return [];
    const normalizedEmail = email.toLowerCase().trim();

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(`${API_BASE_URL}/api/mails/list`, {
            method: "POST",
            headers: {
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: normalizedEmail
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                return data;
            }
        }
    } catch (err) {
        console.warn(`[MAIL_API] fetchEmails error for ${email}:`, err.message);
    }

    return [];
}

/**
 * Fetch full details of an email by its ID (including HTML, body_text, and extracted OTP).
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
async function fetchEmailDetail(id) {
    if (!id) return null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(`${API_BASE_URL}/api/mails/detail`, {
            method: "POST",
            headers: {
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ id: Number(id) }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (data && data.id) {
                return data;
            }
        }
    } catch (err) {
        console.warn(`[MAIL_API] fetchEmailDetail error for ID ${id}:`, err.message);
    }

    return null;
}

module.exports = {
    DEFAULT_DOMAINS,
    API_BASE_URL,
    getAvailableDomains,
    getRandomDomain,
    createSecurityMailbox,
    fetchEmails,
    fetchEmailDetail
};
