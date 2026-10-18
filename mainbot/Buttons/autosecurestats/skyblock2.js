const shorten = require("short-number");
const getUUID = require("../../../autosecure/utils/hypixelapi/getUUID");
const getStats = require('../../../autosecure/utils/hypixelapi/getStats');
const { EmbedBuilder } = require('discord.js');
const { formatDistanceToNow } = require('date-fns');

const safeShort = (n) => {
  const num = typeof n === "number" ? n : Number(n);
  if (isNaN(num)) return "0";
  return shorten(num);
};

module.exports = {
    name: "skyblock2",
    usestatsbutton: true,
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            let mcname = interaction.customId.split("|")[1];
            let uuid = await getUUID(mcname);
            if (!uuid) {
                await sendNone(interaction);
                return;
            }

            const stats = await getStats(mcname);
            console.log(`Stats from skyblock2: ${JSON.stringify(stats)}`)
            if (!stats?.skyblock || stats.hasapi === false) {
                const desc = (stats && stats.hasapi === false)
                    ? '⚠️ Hypixel API key is missing or expired. Set key in config.json (`hypixelApiKey`) or via `/admin config enterapi`.'
                    : 'No SkyBlock data found for this player.';
                const errEmbed = new EmbedBuilder()
                    .setTitle('Skyblock Stats')
                    .setDescription(desc)
                    .setColor('#FF0000');
                await interaction.editReply({ embeds: [errEmbed], ephemeral: true });
                return;
            }

            const skyblockProfile = stats.skyblock.find(prof => prof.current === true);
            if (!skyblockProfile) {
                const errEmbed = new EmbedBuilder()
                    .setTitle('Skyblock Stats')
                    .setDescription('No active SkyBlock profile found for this player.')
                    .setColor('#FF0000');
                await interaction.editReply({ embeds: [errEmbed], ephemeral: true });
                return;
            }

            // Format all the data
            const profileName = skyblockProfile.name || "Unknown";
            const gameMode = skyblockProfile.gameMode || "Standard";
            const memberCount = skyblockProfile.members?.length || 1;
            const profileType = memberCount === 1 ? "Solo profile" : `Coop (${memberCount} members)`;
            const networth = safeShort(skyblockProfile.networth || 0);
            const unsoulbound = safeShort(skyblockProfile.unsoulboundNetworth || 0);
            const liquid = safeShort(skyblockProfile.liquid || 0);
            const soulbound = safeShort((skyblockProfile.networth || 0) - (skyblockProfile.unsoulboundNetworth || 0));
            const cataLevel = skyblockProfile.catacombs?.level || "Not entered";
            const hotmLevel = skyblockProfile.mining?.hotm?.level || 0;
            const mithril = safeShort(skyblockProfile.mining?.mithrilPowder || 0);
            const gemstone = safeShort(skyblockProfile.mining?.gemstonePowder || 0);
            const minionSlots = skyblockProfile.minionSlots || 5;
            let craftedMinions = skyblockProfile.craftedMinions || 0;
            if (craftedMinions >= 686) craftedMinions = 686;
            const uniqueMinions = `${craftedMinions}/686`;
            const sbLevel = skyblockProfile.levels || "0";
            const glacitepowder = safeShort(skyblockProfile?.mining?.glacite || 0);
            
            // Handle skill average safely
            let skillAverage = "0.0";
            if (typeof skyblockProfile.skill_average === 'number') {
                skillAverage = skyblockProfile.skill_average.toFixed(1);
            } else if (typeof skyblockProfile.skill_average === 'string') {
                const parsed = parseFloat(skyblockProfile.skill_average);
                skillAverage = !isNaN(parsed) ? parsed.toFixed(1) : "0.0";
            }
            
            // Format last save time safely
            let lastSave = "Never";
            if (skyblockProfile.last_save) {
                try {
                    lastSave = formatDistanceToNow(new Date(skyblockProfile.last_save), { addSuffix: true });
                } catch (e) {
                    lastSave = "Unknown";
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`SkyBlock: ${mcname} - ${profileName} (${gameMode})`)
                .setColor('#2E8B57')
                .addFields(
                    {
                        name: 'Profile Information',
                        value: `Type: \`${profileType}\`\nLast Active: \`${lastSave}\``,
                        inline: true
                    },
                    {
                        name: 'Progression',
                        value: `SB Level: \`${sbLevel}\`\nSkill Avg: \`${skillAverage}\`\nCatacombs: \`${cataLevel}\``,
                        inline: true
                    },
                    {
                        name: 'Networth Overview',
                        value: `Total: \`${networth}\`\nUnsoulbound: \`${unsoulbound}\`\nLiquid (Purse+Bank): \`${liquid}\`\nSoulbound: \`${soulbound}\``,
                        inline: false
                    },
                    {
                        name: 'Mining & HotM',
                        value: `HotM: \`Level ${hotmLevel}\`\nMithril Powder: \`${mithril}\`\nGemstone Powder: \`${gemstone}\`\nGlacite Powder: \`${glacitepowder}\``,
                        inline: true
                    },
                    {
                        name: 'Minions',
                        value: `Slots: \`${minionSlots}\`\nUniques: \`${uniqueMinions}\``,
                        inline: true
                    }
                );

            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error("Error updating message:", error);
            await sendNone(interaction);
        }
    }
};

async function sendNone(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('Skyblock Stats')
        .setDescription('No SkyBlock data found')
        .setColor('#FF0000');

    try {
        await interaction.editReply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error("Error sending 'None' message:", error);
        await interaction.followUp({ content: "Error retrieving SkyBlock data.", ephemeral: true });
    }
}
