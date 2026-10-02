const { tablesforuser, tablesfortransfer, tablestheycanhave } = require('../../../db/gettablesarray');
const { queryParams } = require("../../../db/database");
const crypto = require('crypto');

async function transferLicense(oldLicenseKey, userId, interactionUserId) {
    if (!oldLicenseKey || !userId || !interactionUserId || userId === interactionUserId) {
        return null;
    }

    // Verify that the license exists and is strictly owned by userId
    const checkLicense = await queryParams(
        `SELECT license, user_id FROM usedLicenses WHERE license=? AND user_id=?`,
        [oldLicenseKey, userId]
    );

    if (!checkLicense || checkLicense.length === 0) {
        console.warn(`[transferLicense] No active license found matching key ${oldLicenseKey} for user ${userId}`);
        return null;
    }

    const generateRandomString = (length) => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const bytes = crypto.randomBytes(length);
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(bytes[i] % characters.length);
        }
        return result;
    };

    let newLicenseKey = oldLicenseKey.slice(0, -6) + generateRandomString(6);

    const tables = tablesforuser();
    const tablesrecover = tablesfortransfer();
    const specialTables = tablestheycanhave();

    try {
        for (const table of tables) {
            if (!/^[a-zA-Z0-9_]+$/.test(table)) continue;
            let column = (table === "blacklisted" || table === "blacklistedemails") ? "client_id" : "user_id";
            await queryParams(`UPDATE \`${table}\` SET \`${column}\`=? WHERE \`${column}\`=?`, [interactionUserId, userId]);
        }

        for (const table of tablesrecover) {
            if (!/^[a-zA-Z0-9_]+$/.test(table)) continue;
            if (specialTables.includes(table)) {
                await queryParams(`DELETE FROM \`${table}\` WHERE user_id=?`, [interactionUserId]);

                const oldRecords = await queryParams(`SELECT * FROM \`${table}\` WHERE user_id=?`, [userId]);

                for (const record of oldRecords) {
                    const safeColumns = Object.keys(record).filter(col => /^[a-zA-Z0-9_]+$/.test(col));
                    if (safeColumns.length === 0) continue;
                    const quotedCols = safeColumns.map(col => `\`${col}\``).join(',');
                    const placeholders = safeColumns.map(() => '?').join(',');
                    const values = safeColumns.map(col => col === 'user_id' ? interactionUserId : record[col]);
                    await queryParams(
                        `INSERT INTO \`${table}\` (${quotedCols}) VALUES (${placeholders})`,
                        values
                    );
                }

                await queryParams(`DELETE FROM \`${table}\` WHERE user_id=?`, [userId]);
            } else {
                await queryParams(`UPDATE \`${table}\` SET user_id=? WHERE user_id=?`, [interactionUserId, userId]);
            }
        }

        const updateRes = await queryParams(
            `UPDATE usedLicenses SET license=?, user_id=? WHERE license=? AND user_id=?`,
            [newLicenseKey, interactionUserId, oldLicenseKey, userId],
            'run'
        );

        if (!updateRes || updateRes.changes === 0) {
            console.error(`[transferLicense] Failed to update usedLicenses row for ${oldLicenseKey}`);
            return null;
        }

        return newLicenseKey;
    } catch (error) {
        console.error('Error in transferLicense:', error);
        throw error;
    }
}

module.exports = {
    transferLicense
};
