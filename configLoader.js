/**
 * Centralized Secure Configuration Loader
 * - Enforces immediate global log interception & redaction.
 * - Sets writable PM2_HOME across platforms.
 * - Sets IPv4-first DNS resolution to eliminate IPv6 lookup stalls.
 * - Centralizes loading and strict validation of secrets from .env & config.json.
 * - Enforces minimum entropy for JWT_SECRET without silent random rotation.
 */

const path = require('path');
const fs = require('fs');
const dns = require('dns');

// 1. Attach Global Logger Guard immediately before any logs can output credentials
try {
    const { attachGlobalLoggerGuard } = require('./autosecure/utils/logging/interceptLogger');
    if (attachGlobalLoggerGuard) attachGlobalLoggerGuard();
} catch (e) {}

// 2. Configure IPv4-first DNS result order to resolve Node.js 18+ verbatim stalls
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

// 3. Configure Writable PM2_HOME
if (!process.env.PM2_HOME) {
    process.env.PM2_HOME = path.join(__dirname, '.pm2');
}
try {
    fs.mkdirSync(path.join(process.env.PM2_HOME, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(process.env.PM2_HOME, 'pids'), { recursive: true });
} catch (e) {}

// 4. Load Environment Variables
require('dotenv').config();

// 5. Load base config.json
const config = require('./config.json');

function loadConfig() {
    // Discord Bot Tokens
    if (process.env.BOT_TOKEN) {
        config.tokens = [process.env.BOT_TOKEN];
    } else if (Array.isArray(config.tokens)) {
        config.tokens = config.tokens.filter(t => t && t !== 'LOAD_FROM_ENV');
    }

    // Webhook
    if (process.env.NOTIFIER_WEBHOOK) {
        config.notifierWebhook = process.env.NOTIFIER_WEBHOOK;
    } else if (config.notifierWebhook === 'LOAD_FROM_ENV') {
        config.notifierWebhook = '';
    }

    // HTTP Proxies
    const loadedProxies = [];
    if (process.env.PROXY_1) loadedProxies.push(process.env.PROXY_1);
    if (process.env.PROXY_2) loadedProxies.push(process.env.PROXY_2);
    if (process.env.PROXY_3) loadedProxies.push(process.env.PROXY_3);

    if (loadedProxies.length > 0) {
        config.proxy = loadedProxies;
    } else if (Array.isArray(config.proxy)) {
        config.proxy = config.proxy.filter(p => p && p !== 'LOAD_FROM_ENV');
    }

    // SOCKS Proxies
    const loadedSocks = [];
    if (process.env.SOCKS_PROXY_1) loadedSocks.push(process.env.SOCKS_PROXY_1);
    if (process.env.SOCKS_PROXY_2) loadedSocks.push(process.env.SOCKS_PROXY_2);
    if (process.env.SOCKS_PROXY_3) loadedSocks.push(process.env.SOCKS_PROXY_3);

    if (loadedSocks.length > 0) {
        config.socksproxy = loadedSocks;
    } else if (Array.isArray(config.socksproxy)) {
        config.socksproxy = config.socksproxy.filter(p => p && p !== 'LOAD_FROM_ENV');
    }

    // VPS IP
    if (process.env.VPS_IP) {
        config.vpsip = process.env.VPS_IP;
        config.ip4 = process.env.VPS_IP;
    } else {
        if (config.vpsip === 'LOAD_FROM_ENV') config.vpsip = '';
        if (config.ip4 === 'LOAD_FROM_ENV') config.ip4 = '';
    }

    // Auth Key — Enforce minimum entropy (32 characters)
    const rawAuthKey = process.env.AUTH_KEY || config.authkey;
    const insecureDefaults = ['vinGr0up', 'LOAD_FROM_ENV', 'changeme', 'default', 'password', 'secret'];
    if (rawAuthKey && typeof rawAuthKey === 'string' && rawAuthKey.trim().length >= 32 && !insecureDefaults.includes(rawAuthKey.trim())) {
        config.authkey = rawAuthKey.trim();
    } else {
        if (rawAuthKey && insecureDefaults.includes(rawAuthKey.trim())) {
            console.warn(`[SECURITY WARNING] Insecure default AUTH_KEY rejected. Set a unique, secure AUTH_KEY (≥32 chars) in .env.`);
        } else if (rawAuthKey && rawAuthKey.trim().length > 0 && rawAuthKey.trim().length < 32) {
            console.warn(`[SECURITY WARNING] AUTH_KEY too short (${rawAuthKey.trim().length} chars). Minimum 32 characters required.`);
        }
        config.authkey = '';
    }

    // Captcha Key
    if (process.env.CAPTCHA_KEY) {
        config.captchakey = process.env.CAPTCHA_KEY;
    }

    // JWT Secret Validation & Strict Entropy Enforcement
    const rawJwtSecret = process.env.JWT_SECRET || config.jwtsecret;
    const isProd = process.env.NODE_ENV === 'production';

    if (!rawJwtSecret || typeof rawJwtSecret !== 'string' || rawJwtSecret.trim().length < 32) {
        if (isProd) {
            throw new Error('[FATAL SECURITY ERROR] JWT_SECRET must be configured in persistent .env with at least 32 characters in production.');
        }
        console.warn('[SECURITY WARNING] JWT_SECRET is missing or has insufficient entropy (<32 characters). Valid sessions require a persistent JWT_SECRET in .env.');
    } else {
        config.jwtsecret = rawJwtSecret.trim();
    }

    // Database Encryption Key (SQLCipher AES-256)
    const rawDbKey = process.env.DB_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
    if (rawDbKey && typeof rawDbKey === 'string' && rawDbKey.trim().length > 0) {
        config.dbEncryptionKey = rawDbKey.trim();
    } else {
        config.dbEncryptionKey = '';
    }

    // Mail Web API (mail.hotwar.asia)
    config.mailApi = {
        url: (process.env.MAIL_API_URL || config.mailApi?.url || "https://mail.hotwar.asia").trim(),
        apiKey: (process.env.MAIL_API_KEY || config.mailApi?.apiKey || "8853067346148af0c072071ddac92f63").trim()
    };

    return config;
}

// Auto-load configuration on require
loadConfig();

module.exports = config;
