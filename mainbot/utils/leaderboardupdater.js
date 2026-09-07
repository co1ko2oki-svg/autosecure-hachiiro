const { queryParams } = require("../../db/database");
const { setTimeout } = require("timers/promises");
const shorten = require("../../autosecure/utils/utils/shorten");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

async function checkhidden(userid) {
    const entry = await queryParams(`SELECT showleaderboard FROM settings WHERE user_id = ?`, [userid]);
    if (entry.length === 0) {
        return false;
    }
    return entry[0].showleaderboard === 0 || entry[0].showleaderboard === "0";
}

const embedColor = 0xB8D2F0;

async function updatemessageid(id, channelId) {
    const set = `${id}|${channelId}`;
    const existing = await queryParams(`SELECT * FROM controlbot WHERE id = ?`, [1]);

    if (existing.length > 0) {
        try {
            await queryParams(`UPDATE controlbot SET leaderboardid = ? WHERE id = ?`, [set, 1]);
        } catch (error) {
                    }
    } else {
        try {
            await queryParams(`INSERT INTO controlbot (id, leaderboardid) VALUES (?, ?)`, [1, set]);
        } catch (error) {
                    }
    }
}

const { sendComponentsV2, editComponentsV2, IS_COMPONENTS_V2 } = require("./componentsV2");

async function generateLeaderboardComponentsV2() {
    try {
        const config = require("../../config.json");
        const leaderboardData = await queryParams(
            'SELECT user_id, amount, networth FROM leaderboard ORDER BY amount DESC LIMIT 10'
        );

        let rankingText = '';

        if (leaderboardData.length === 0) {
            rankingText = '> *No members on the leaderboard yet.*';
        } else {
            for (let index = 0; index < leaderboardData.length; index++) {
                const entry = leaderboardData[index];
                const isHidden = await checkhidden(entry.user_id);
                const userTag = isHidden ? '`Anonymous`' : `<@${entry.user_id}>`;
                const actualnetworth = shorten(entry.networth || 0);
                const amountText = (entry.amount || 0).toLocaleString();

                if (index === 0) {
                    rankingText += `> 👑 **TOP 1:** ${userTag}\n> └ 💳 Secured: \`${amountText}\` accounts | Networth: \`${actualnetworth}\`\n\n`;
                } else if (index === 1) {
                    rankingText += `> 🥈 **TOP 2:** ${userTag}\n> └ 💳 Secured: \`${amountText}\` accounts | Networth: \`${actualnetworth}\`\n\n`;
                } else if (index === 2) {
                    rankingText += `> 🥉 **TOP 3:** ${userTag}\n> └ 💳 Secured: \`${amountText}\` accounts | Networth: \`${actualnetworth}\`\n\n`;
                } else {
                    rankingText += `> 🏅 **TOP ${index + 1}:** ${userTag}\n> └ 💳 Secured: \`${amountText}\` accounts | Networth: \`${actualnetworth}\`\n\n`;
                }
            }
        }

        const bannerUrl = config.leaderboardbanner || "https://images.squarespace-cdn.com/content/v1/5bdae2425ffd20ce19a4c5c1/a0effae1-e3ae-4e30-9cc4-0f406d002dc5/Lyric_01.gif?format=1000w";
        const thumbUrl = config.defaultpfp || config.footer?.icon_url;

        const containerComponents = [];

        // 1. Media Gallery (Banner)
        if (bannerUrl) {
            containerComponents.push({
                type: 12, // MEDIA_GALLERY
                items: [
                    {
                        media: {
                            url: bannerUrl
                        },
                        description: "Leaderboard Banner"
                    }
                ]
            });
        }

        // 2. Section (Header & Rankings & Thumbnail)
        const section = {
            type: 9, // SECTION
            components: [
                {
                    type: 10, // TEXT_DISPLAY
                    content: `# 🏆 CUSTOMER LEADERBOARD & ACHIEVEMENTS 🏆\n\n> ✒️ **Here is the list of top users who secured the most accounts in our store!**\n> A sincere thank you to all our customers.\n\n${rankingText}`
                }
            ]
        };

        if (thumbUrl) {
            section.accessory = {
                type: 11, // THUMBNAIL
                media: {
                    url: thumbUrl
                },
                description: "Store Logo"
            };
        }

        containerComponents.push(section);

        // 3. Separator
        containerComponents.push({
            type: 14, // SEPARATOR
            divider: true,
            spacing: 1
        });

        // 4. Footer Note
        containerComponents.push({
            type: 10, // TEXT_DISPLAY
            content: "-# ⌛ *The leaderboard is automatically updated by the system!*"
        });

        // 5. Action Row with Button
        containerComponents.push({
            type: 1, // ACTION_ROW
            components: [
                {
                    type: 2, // BUTTON
                    custom_id: "hideleaderboard",
                    label: "Hide / Show me on Leaderboard",
                    style: 1,
                    emoji: {
                        name: "👁️"
                    }
                }
            ]
        });

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
        return { content: "❌ Failed to generate leaderboard" };
    }
}

async function getMessageId() {
    try {
        const data = await queryParams('SELECT leaderboardid FROM controlbot WHERE id = 1');
        const raw = data[0]?.leaderboardid || null;
        return raw;
    } catch (error) {
        console.error(`Error getting message ID from DB: ${error.message}`);
        return null;
    }
}

async function updateLeaderboardMessage(client) {
    try {
        const rawId = await getMessageId();
        const payload = await generateLeaderboardComponentsV2();
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
        // Fixed: removed recursive call that caused infinite recursion on persistent errors.
        // The setInterval in startLeaderboardUpdater will retry automatically.
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
