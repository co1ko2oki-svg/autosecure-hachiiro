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

async function generateLeaderboardComponentsV2(client) {
    try {
        const config = require("../../config.json");
        
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
        const dataNetworth = await processData(dataNetworthRaw);
        
        const img1 = await generateLeaderboardImage("Accounts Leaderboard", dataAccounts, client);
        const img2 = await generateLeaderboardImage("Networth Leaderboard", dataNetworth, client);
        
        let url1 = "", url2 = "";
        if (config.log && client) {
            try {
                const logChannel = await client.channels.fetch(config.log);
                const { AttachmentBuilder } = require('discord.js');
                const att1 = new AttachmentBuilder(img1, { name: 'acc.png' });
                const att2 = new AttachmentBuilder(img2, { name: 'net.png' });
                const msg = await logChannel.send({ files: [att1, att2] });
                url1 = msg.attachments.first().url;
                url2 = msg.attachments.last().url;
            } catch(e) {
                console.error("Failed to upload LB images to log channel:", e.message);
            }
        }
        
        const nowOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' };
        const dateStr = new Date().toLocaleDateString('en-US', nowOptions);
        
        const containerComponents = [];
        
        containerComponents.push({
            type: 9, // SECTION
            components: [
                {
                    type: 10, // TEXT_DISPLAY
                    content: `Last Updated: \`${dateStr}\``
                }
            ]
        });

        // Add the anonymity button
        containerComponents.push({
            type: 1, // ACTION_ROW
            components: [
                {
                    type: 2, // BUTTON
                    custom_id: "hideleaderboard",
                    label: "Anonymity",
                    style: 1
                }
            ]
        });
        
        containerComponents.push({ type: 14, divider: true, spacing: 1 });
        
        if (url1) {
            containerComponents.push({
                type: 9,
                components: [
                    { type: 10, content: `**__Account Leaderboard__**` },
                    { type: 12, items: [ { media: { url: url1 } } ] }
                ]
            });
            containerComponents.push({ type: 14, divider: true, spacing: 1 });
        }
        
        if (url2) {
            containerComponents.push({
                type: 9,
                components: [
                    { type: 10, content: `**__Networth Leaderboard__**` },
                    { type: 12, items: [ { media: { url: url2 } } ] }
                ]
            });
        }
        
        return {
            flags: IS_COMPONENTS_V2,
            components: [
                {
                    type: 17, // CONTAINER
                    accent_color: 0x2B2D31,
                    components: containerComponents
                }
            ]
        };
    } catch (error) {
        console.error(`Error generating leaderboard Components V2: ${error.message}`);
        return { content: "Failed to generate leaderboard" };
    }
}

async function updateLeaderboardMessage(client) {
    try {
        const rawId = await getMessageId();
        const payload = await generateLeaderboardComponentsV2(client);
        const config = require("../../config.json");
        const channelId = config.leaderboard;

        if (rawId) {
            const [messageId, chId] = rawId.split("|");
            try {
                await editComponentsV2(client, chId, messageId, payload);
                return;
            } catch (err) {
                console.log("[LEADERBOARD] Could not edit old message, will try posting new one...");
            }
        }

        if (channelId) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const botMessage = messages.find(m => m.author.id === client.user.id);
                    if (botMessage) {
                        await editComponentsV2(client, channelId, botMessage.id, payload);
                        await updatemessageid(botMessage.id, channelId);
                        console.log(`[LEADERBOARD] Updated existing message (${botMessage.id}) to Components V2`);
                    } else {
                        const sent = await sendComponentsV2(client, channelId, payload);
                        const sentId = sent?.id || sent;
                        if (sentId) {
                            await updatemessageid(sentId, channelId);
                            console.log(`[LEADERBOARD] Posted Components V2 leaderboard (${sentId}) to channel ${channelId}`);
                        }
                    }
                }
            } catch (err) {
                console.error(`[LEADERBOARD] Error auto-posting Components V2 to channel ${channelId}:`, err.message);
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

module.exports = { startLeaderboardUpdater, getMessageId, generateLeaderboardComponentsV2, updatemessageid, updateLeaderboardMessage };
