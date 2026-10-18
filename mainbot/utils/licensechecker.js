const { queryParams } = require('../../db/database');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { sendFullConfigToUser } = require('../../autosecure/utils/bot/configutils'); 
const deleteuser = require('../../db/deleteuser');
const { tablesforuser } = require('../../db/gettablesarray');
const { autosecurelogs } = require('../../autosecure/utils/embeds/autosecurelogs');
const checkroles = require("../../mainbot/utils/checkroles.js")

const delay = "60"; // Fixed BUG #8: was "10" (every 10s) — too aggressive for full table scan + DM sends

const checkLicenses = async (client) => {
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
    const oneDayFromNow = now + 24 * 60 * 60 * 1000;
    const rows = await queryParams('SELECT * FROM usedLicenses', []);
    
    for (const row of rows) {
        const { license, user_id, expiry, one_day_warning_sent, seven_day_warning_sent, istrial } = row;
        const istrialflag = !!istrial;
        const expiryTime = parseInt(expiry, 10);

        // Security Fix: Validate expiry — NaN means never expires = skip to prevent bypass
        if (!Number.isFinite(expiryTime) || expiryTime <= 0) {
            console.error(`[LICENSE] Invalid expiry for license ${license}: "${expiry}" — skipping`);
            continue;
        }

        const time = `<t:${Math.floor(expiryTime / 1000)}:R>`;

        /// Already expired
        if (expiryTime <= now) {
            // Security Fix: Check if user has ANY other active license before deleting
            const activeRows = await queryParams(
                'SELECT 1 FROM usedLicenses WHERE user_id = ? AND CAST(expiry AS INTEGER) > ? AND license != ? LIMIT 1',
                [user_id, now, license]
            );

            if (activeRows && activeRows.length > 0) {
                // User still has active license(s) — only remove the expired one, do NOT delete user
                console.log(`[LICENSE] User ${user_id} has active license(s). Removing only expired license: ${license}`);
                await queryParams('DELETE FROM usedLicenses WHERE license = ?', [license]);
                continue;
            }

            // No active licenses — proceed with full user deletion
            try {
                await sendFullConfigToUser(user_id, client, istrialflag);
                await autosecurelogs(null, "config", user_id);
            } catch (error) {
                console.error(`Failed to send full config to user ${user_id} on expiry:`, error);
            }

            const expirationEmbed = new EmbedBuilder()
                .setTitle('Your subscription has expired!')
                .setDescription('Please renew your subscription to regain access.')
                .setColor('#5f9ea0');
            
            try {
                await sendMessageWithEmbed(client, user_id, expirationEmbed);
            } catch (error) {
                console.error(`Failed to send expiration embed to user ${user_id}:`, error);
            }
            
            try {
                await deleteuser(client, user_id);
            } catch (error) {
                console.error(`Failed to delete user ${user_id} after expiry:`, error);
            }

            // Security Fix: Delete expired license row immediately to prevent re-processing loop
            await queryParams('DELETE FROM usedLicenses WHERE license = ?', [license]).catch(() => {});

        /// One day left
        } else if (expiryTime <= oneDayFromNow && !one_day_warning_sent) {
            if (istrial) continue; 
            console.log('sending one-day warning!');
            await sendMessage(client, user_id, `Your license will expire ${time}. If you wish to extend your subscription, redeem another license key.`);
            await queryParams('UPDATE usedLicenses SET one_day_warning_sent = 1 WHERE license = ?', [license]);

        // Seven Day Left
        } else if (expiryTime <= sevenDaysFromNow && !seven_day_warning_sent && expiryTime > oneDayFromNow) {
            console.log('sending seven-day warning!');
            await sendMessage(client, user_id, `Your license will expire ${time}. If you wish to extend your subscription, redeem another license key.`);
            await queryParams('UPDATE usedLicenses SET seven_day_warning_sent = 1 WHERE license = ?', [license]);
        }
    }
};

const sendMessage = async (client, userId, message) => {
    try {
        const user = await client.users.fetch(userId);
        if (!user) console.log('User not found');
        await user.send(message);
    } catch (error) {
        console.error(`Failed to send message to user ${userId}:`, error);
    }
};

const sendMessageWithEmbed = async (client, userId, embed) => {
    try {
        const user = await client.users.fetch(userId);
        if (!user) console.log('User not found');
        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Failed to send message with embed to user ${userId}:`, error);
    }
};

/*
Checking user licenses & user and owner roles
*/

let isChecking = false;
const safeCheckLicenses = async (client) => {
    if (isChecking) return;
    isChecking = true;
    try {
        await checkLicenses(client);
    } catch (e) {
        console.error('[LICENSE] Error in checkLicenses loop:', e);
    } finally {
        isChecking = false;
    }
};

const startLicenseChecker = (client) => {
  safeCheckLicenses(client);

  setInterval(() => {
    safeCheckLicenses(client);
  }, parseInt(delay, 10) * 1000); 

  setInterval(() => {
    checkroles(client);
  }, 30 * 60 * 1000); // 30 minutes
};

module.exports = { startLicenseChecker };
