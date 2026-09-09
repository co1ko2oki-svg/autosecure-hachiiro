const { queryParams } = require("../../../db/database");
const config = require("../../../config.json");
const generate = require("../generate");

/**
 * Check if a user has active Web Access rights.
 * @param {string} userId - Discord User ID of the bot owner
 * @returns {Promise<{ hasAccess: boolean, expiry: number|null, daysLeft: number, isOwner: boolean, lastLicense: string|null }>}
 */
async function checkWebAccess(userId) {
    if (!userId) {
        return { hasAccess: false, expiry: null, daysLeft: 0, isOwner: false, lastLicense: null };
    }

    const cleanId = String(userId).trim();

    // 1. Check Owner bypass
    const owners = (config.owners || []).map(o => String(o).trim());
    if (owners.includes(cleanId)) {
        return {
            hasAccess: true,
            expiry: null,
            daysLeft: 99999,
            isOwner: true,
            lastLicense: "OWNER_LIFETIME"
        };
    }

    // 2. Query web_access table
    try {
        const rows = await queryParams('SELECT * FROM web_access WHERE user_id = ?', [cleanId]);
        if (!rows || rows.length === 0) {
            return { hasAccess: false, expiry: null, daysLeft: 0, isOwner: false, lastLicense: null };
        }

        const data = rows[0];
        const expiryMs = parseInt(data.expiry, 10);
        const now = Date.now();

        if (isNaN(expiryMs) || now >= expiryMs) {
            return {
                hasAccess: false,
                expiry: isNaN(expiryMs) ? null : expiryMs,
                daysLeft: 0,
                isOwner: false,
                lastLicense: data.last_license || null
            };
        }

        const remainingMs = expiryMs - now;
        const daysLeft = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

        return {
            hasAccess: true,
            expiry: expiryMs,
            daysLeft,
            isOwner: false,
            lastLicense: data.last_license || null
        };
    } catch (err) {
        console.error("[WEB ACCESS] Error checking web access:", err.message);
        return { hasAccess: false, expiry: null, daysLeft: 0, isOwner: false, lastLicense: null };
    }
}

/**
 * Grant or extend Web Access for a user.
 * @param {string} userId - Discord User ID
 * @param {number} days - Duration in days (e.g., 30)
 * @param {string} licenseKey - License key used or "ADMIN_GRANT"
 * @returns {Promise<{ success: boolean, expiry: number, isExtension: boolean, daysAdded: number }>}
 */
async function grantWebAccess(userId, days = 30, licenseKey = "MANUAL_GRANT") {
    const cleanId = String(userId).trim();
    const daysNum = Math.max(1, parseFloat(days) || 30);
    const durationMs = daysNum * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
        const existing = await queryParams('SELECT * FROM web_access WHERE user_id = ?', [cleanId]);
        let newExpiry = now + durationMs;
        let isExtension = false;

        if (existing && existing.length > 0) {
            const curExp = parseInt(existing[0].expiry, 10);
            if (!isNaN(curExp) && curExp > now) {
                // Stack on top of remaining time
                newExpiry = curExp + durationMs;
                isExtension = true;
            }
            await queryParams(
                'UPDATE web_access SET expiry = ?, last_license = ?, updated_at = ? WHERE user_id = ?',
                [newExpiry.toString(), licenseKey, now, cleanId]
            );
        } else {
            await queryParams(
                'INSERT INTO web_access (user_id, expiry, last_license, updated_at) VALUES (?, ?, ?, ?)',
                [cleanId, newExpiry.toString(), licenseKey, now]
            );
        }

        return {
            success: true,
            expiry: newExpiry,
            isExtension,
            daysAdded: daysNum
        };
    } catch (err) {
        console.error("[WEB ACCESS] Error granting web access:", err.message);
        throw err;
    }
}

/**
 * Remove web access for a user.
 * @param {string} userId
 */
async function removeWebAccess(userId) {
    const cleanId = String(userId).trim();
    return queryParams('DELETE FROM web_access WHERE user_id = ?', [cleanId]);
}

/**
 * Generate monthly web license keys for Admin.
 * Format: WEB-<days>D-<random12>
 * @param {number} durationDays - Duration in days (default 30)
 * @param {number} amount - Number of keys to create (default 1)
 * @param {string} createdBy - Admin User ID
 * @returns {Promise<string[]>}
 */
async function createWebLicenses(durationDays = 30, amount = 1, createdBy = "admin") {
    const daysNum = Math.max(1, parseFloat(durationDays) || 30);
    const keys = [];
    const now = Date.now();

    for (let i = 0; i < amount; i++) {
        // e.g. WEB-30D-A8K2M9P4Z1Q7
        const randCode = generate(12).toUpperCase();
        const key = `WEB-${daysNum}D-${randCode}`;

        await queryParams(
            'INSERT INTO web_licenses (license, duration, created_at, created_by) VALUES (?, ?, ?, ?)',
            [key, daysNum.toString(), now, createdBy]
        );
        keys.push(key);
    }

    return keys;
}

/**
 * Redeem a web license key.
 * @param {string} userId - User redeeming the key
 * @param {string} licenseKey - Web license key
 * @returns {Promise<{ success: boolean, message: string, expiry?: number, daysAdded?: number, isExtension?: boolean }>}
 */
async function redeemWebLicense(userId, licenseKey) {
    const cleanKey = String(licenseKey).trim();
    const cleanUser = String(userId).trim();

    try {
        const rows = await queryParams('SELECT * FROM web_licenses WHERE license = ?', [cleanKey]);
        if (!rows || rows.length === 0) {
            return {
                success: false,
                message: "Mã Key Web không tồn tại hoặc đã được sử dụng!"
            };
        }

        const licenseData = rows[0];
        const days = parseFloat(licenseData.duration) || 30;

        // Grant access
        const grantResult = await grantWebAccess(cleanUser, days, cleanKey);

        // Delete used license from web_licenses table
        await queryParams('DELETE FROM web_licenses WHERE license = ?', [cleanKey]);

        return {
            success: true,
            message: "Kích hoạt bản quyền Web thành công!",
            expiry: grantResult.expiry,
            daysAdded: grantResult.daysAdded,
            isExtension: grantResult.isExtension
        };
    } catch (err) {
        console.error("[WEB ACCESS] Error redeeming web license:", err.message);
        return {
            success: false,
            message: "Đã xảy ra lỗi khi kích hoạt Key Web: " + err.message
        };
    }
}

/**
 * List all unredeemed web licenses.
 */
async function listWebLicenses() {
    return queryParams('SELECT * FROM web_licenses ORDER BY created_at DESC');
}

/**
 * Delete a specific unredeemed web license key.
 */
async function deleteWebLicense(licenseKey) {
    return queryParams('DELETE FROM web_licenses WHERE license = ?', [String(licenseKey).trim()]);
}

module.exports = {
    checkWebAccess,
    grantWebAccess,
    removeWebAccess,
    createWebLicenses,
    redeemWebLicense,
    listWebLicenses,
    deleteWebLicense
};
