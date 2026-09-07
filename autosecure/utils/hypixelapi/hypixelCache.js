const http = require('http');
const https = require('https');

// Shared HTTP / HTTPS keep-alive agents to reuse TCP/TLS connections
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 15000
});

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 15000
});

// Fast In-Memory TTL Cache Storage
const uuidMap = new Map(); // username -> { uuid, expiresAt }
const statsMap = new Map(); // ign -> { data, expiresAt }
const inFlightPromises = new Map(); // key -> Promise

// Cache TTL configuration (in milliseconds)
const TTL_UUID = 60 * 60 * 1000;       // 1 hour
const TTL_STATS = 10 * 60 * 1000;      // 10 minutes
const TTL_API_KEY = 60 * 1000;         // 1 minute

let cachedApiKey = { key: null, expiresAt: 0 };

/**
 * Get cached UUID by username
 */
function getCachedUUID(username) {
    if (!username) return null;
    const key = username.toLowerCase().trim();
    const entry = uuidMap.get(key);
    if (entry && entry.expiresAt > Date.now()) {
        return entry.uuid;
    }
    if (entry) uuidMap.delete(key);
    return null;
}

/**
 * Set cached UUID for username
 */
function setCachedUUID(username, uuid, ttl = TTL_UUID) {
    if (!username || !uuid) return;
    const key = username.toLowerCase().trim();
    
    // Prevent memory leaks: limit cache size to 5,000 entries
    if (uuidMap.size > 5000) {
        const oldestKey = uuidMap.keys().next().value;
        uuidMap.delete(oldestKey);
    }
    
    uuidMap.set(key, {
        uuid,
        expiresAt: Date.now() + ttl
    });
}

/**
 * Get cached Hypixel stats by username/IGN
 */
function getCachedStats(ign) {
    if (!ign) return null;
    const key = ign.toLowerCase().trim();
    const entry = statsMap.get(key);
    if (entry && entry.expiresAt > Date.now()) {
        return entry.data;
    }
    if (entry) statsMap.delete(key);
    return null;
}

/**
 * Set cached Hypixel stats for username/IGN
 */
function setCachedStats(ign, data, ttl = TTL_STATS) {
    if (!ign || !data) return;
    const key = ign.toLowerCase().trim();
    
    // Limit cache size to 1,000 player stats
    if (statsMap.size > 1000) {
        const oldestKey = statsMap.keys().next().value;
        statsMap.delete(oldestKey);
    }
    
    statsMap.set(key, {
        data,
        expiresAt: Date.now() + ttl
    });
}

/**
 * In-flight request coalescing / deduplication
 * If multiple requests for the same operation arrive simultaneously,
 * they will all await the exact same Promise instead of firing duplicate HTTP calls.
 */
async function deduplicateRequest(cacheKey, fetchFunction) {
    if (inFlightPromises.has(cacheKey)) {
        return inFlightPromises.get(cacheKey);
    }

    const promise = (async () => {
        try {
            return await fetchFunction();
        } finally {
            inFlightPromises.delete(cacheKey);
        }
    })();

    inFlightPromises.set(cacheKey, promise);
    return promise;
}

/**
 * API Key cache helpers
 */
function getCachedApiKey() {
    if (cachedApiKey.key && cachedApiKey.expiresAt > Date.now()) {
        return cachedApiKey.key;
    }
    return null;
}

function setCachedApiKey(key, ttl = TTL_API_KEY) {
    cachedApiKey = {
        key,
        expiresAt: Date.now() + ttl
    };
}

function invalidateApiKeyCache() {
    cachedApiKey = { key: null, expiresAt: 0 };
}

module.exports = {
    httpAgent,
    httpsAgent,
    getCachedUUID,
    setCachedUUID,
    getCachedStats,
    setCachedStats,
    deduplicateRequest,
    getCachedApiKey,
    setCachedApiKey,
    invalidateApiKeyCache,
    TTL_UUID,
    TTL_STATS,
    TTL_API_KEY
};
