const { queryParams } = require("../../db/database");
const shorten = require("../../autosecure/utils/utils/shorten");
const { sendComponentsV2, editComponentsV2, IS_COMPONENTS_V2 } = require("./componentsV2");
const { generateLeaderboardImage } = require("./drawLeaderboard");

async function checkhidden(userid) {
    const entry = await queryParams(`SELECT showleaderboard FROM settings WHERE user_id = ?`, [userid]);
    if (entry.length === 0) {
        return false;
    }
    return entry[0].showleaderboard === 0 || entry[0].showleaderboard === "0";
}

async function updatemessageid(id, channelId) {
    const set = `${id}|${channelId}`;
    const existing = await queryParams(`SELECT * FROM controlbot WHERE id = ?`, [1]);

    if (existing.length > 0) {
        try {
            await queryParams(`UPDATE controlbot SET leaderboardid = ? WHERE id = ?`, [set, 1]);
        } catch (error) {}
    } else {
        try {
            await queryParams(`INSERT INTO controlbot (id, leaderboardid) VALUES (?, ?)`, [1, set]);
        } catch (error) {}
    }
}

async function getMessageId() {
    try {
        const data = await queryParams('SELECT leaderboardid FROM controlbot WHERE id = 1');
        return data[0]?.leaderboardid || null;
    } catch (error) {
        return null;
    }
}

async function generateLeaderboardPayload(client) {
    try {
        const dataAccountsRaw = await queryParams('SELECT user_id, amount, networth FROM leaderboard ORDER BY amount DESC LIMIT 10');
        const dataNetworthRaw = await queryParams('SELECT user_id, amount, networth FROM leaderboard ORDER BY networth DESC LIMIT 10');
        
        const processData = async (raw) => {
            const out = [];
            for (let row of raw) {
                const hidden = await checkhidden(row.user_id);
                out.push({
                    user_id: row.user_id,
                    amount: row.amount || 0,
                    networth: row.networth || 0,
                    networthStr: shorten(row.networth || 0),
                    hidden: hidden
                });
            }
            return out;
        };
        
        const dataAccounts = await processData(dataAccountsRaw);
        
        // Vẽ duy nhất bảng Accounts Leaderboard
        const singleImageBuffer = await generateLeaderboardImage(dataAccounts, client);
        
        const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const attachment = new AttachmentBuilder(singleImageBuffer, { name: 'leaderboard.png' });
        
        const nowOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' };
        const dateStr = new Date().toLocaleDateString('en-US', nowOptions);
        
        const embed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setDescription(`Last Updated: \`${dateStr}\``)
            .setImage('attachment://leaderboard.png');
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('hideleaderboard')
                .setLabel('Anonymity')
                .setStyle(ButtonStyle.Primary)
        );
        
        return {
            embeds: [embed],
            components: [row],
            files: [attachment]
        };
    } catch (error) {
        console.error(`Error generating leaderboard embed: ${error.message}`);
        return null;
    }
}

async function updateLeaderboardMessage(client) {
    try {
        const rawId = await getMessageId();
        const payload = await generateLeaderboardPayload(client);
        if (!payload) return;
        
        const config = require("../../config.json");
        const channelId = config.leaderboard;

        if (rawId) {
            const [messageId, chId] = rawId.split("|");
            try {
                const channel = await client.channels.fetch(chId);
                const message = await channel.messages.fetch(messageId);
                payload.attachments = [];
                await message.edit({ ...payload, flags: 0 });
                return;
            } catch (err) {
                console.log("[LEADERBOARD] Could not edit old message, attempting to delete it and post a new one...");
                try {
                    const channel = await client.channels.fetch(chId);
                    const message = await channel.messages.fetch(messageId);
                    await message.delete().catch(() => null);
                } catch(e) {}
            }
        }

        if (channelId) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const botMessage = messages.find(m => m.author.id === client.user.id);
                    if (botMessage) {
                        payload.attachments = [];
                        try {
                            await botMessage.edit({ ...payload, flags: 0 });
                            await updatemessageid(botMessage.id, channelId);
                            console.log(`[LEADERBOARD] Updated existing message (${botMessage.id}) with Embeds`);
                        } catch (editErr) {
                            console.log(`[LEADERBOARD] Edit failed (${editErr.message}), replacing message...`);
                            await botMessage.delete().catch(() => null);
                            const sent = await channel.send(payload);
                            await updatemessageid(sent.id, channelId);
                            console.log(`[LEADERBOARD] Replaced leaderboard (${sent.id}) in channel ${channelId}`);
                        }
                    } else {
                        const sent = await channel.send(payload);
                        await updatemessageid(sent.id, channelId);
                        console.log(`[LEADERBOARD] Posted leaderboard (${sent.id}) to channel ${channelId}`);
                    }
                }
            } catch (err) {
                console.error(`[LEADERBOARD] Error auto-posting leaderboard to channel ${channelId}:`, err.message);
            }
        }
    } catch (error) {
        console.error(`Leaderboard update failed: ${error.message}`);
    }
}

async function startLeaderboardUpdater(client) {
    let updateInterval = null;
    await updateLeaderboardMessage(client);
    updateInterval = setInterval(() => updateLeaderboardMessage(client), 60000);

    return async () => {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
    };
}

module.exports = { startLeaderboardUpdater, getMessageId, generateLeaderboardPayload, updatemessageid, updateLeaderboardMessage };
