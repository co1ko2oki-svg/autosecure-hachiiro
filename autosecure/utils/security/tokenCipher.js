const crypto = require('crypto');
const config = require('../../../configLoader');

// Derive 32-byte encryption key from environment or persistent secrets
function getEncryptionKey() {
    const rawSecret = process.env.TOKEN_ENCRYPTION_KEY || config.jwtsecret || process.env.JWT_SECRET || 'ats-fallback-secure-master-key-32b';
    return crypto.createHash('sha256').update(String(rawSecret)).digest();
}

/**
 * Encrypts a Discord bot token using AES-256-GCM.
 * If already encrypted, returns the token as-is.
 */
function encryptToken(token) {
    if (!token || typeof token !== 'string') return token;
    if (token.startsWith('enc:v1:')) return token;

    const iv = crypto.randomBytes(12);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(token, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:v1:${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts an encrypted token.
 * Provides backward compatibility: If the token is not encrypted (legacy plaintext),
 * it returns the token unchanged.
 */
function decryptToken(storedToken) {
    if (!storedToken || typeof storedToken !== 'string') return storedToken;
    if (!storedToken.startsWith('enc:v1:')) return storedToken;

    const parts = storedToken.split(':');
    if (parts.length !== 5) {
        throw new Error('Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const ciphertext = parts[4];
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Checks whether a token is already encrypted.
 */
function isEncryptedToken(token) {
    return typeof token === 'string' && token.startsWith('enc:v1:');
}

module.exports = {
    encryptToken,
    decryptToken,
    isEncryptedToken
};
