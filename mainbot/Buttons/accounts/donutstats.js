const { EmbedBuilder } = require("discord.js");
const getDonutStats = require("../../../autosecure/utils/donutapi/getDonutStats");

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
    name: "donutstats",
    callback: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });

            const parts = interaction.customId.split("|");
            const uid = parts[1];
            const username = parts[2];

            if (!username) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("DonutSMP Statistics")
                            .setDescription("No Minecraft username available for this account.")
                            .setColor("#E74C3C")
                    ]
                });
            }

            const donut = await getDonutStats(username);

            if (!donut || donut.hasData === false) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`DonutSMP Statistics: ${username}`)
                            .setDescription(`No DonutSMP records found for player **${username}** (never joined or no activity).`)
                            .setColor("#E74C3C")
                            .setThumbnail(`https://visage.surgeplay.com/bust/${encodeURIComponent(username)}.png?y=-40&quality=lossless`)
                    ]
                });
            }

            const bal = formatCompact(donut?.balance || donut?.money || 0);
            const shards = donut?.shards ? String(donut.shards) : '0';
            const kills = formatCompact(donut?.kills || 0);
            const deaths = donut?.deaths ? String(donut.deaths) : '0';
            const playtime = donut?.playtime || '0m';
            const placed = formatCompact(donut?.blocksPlaced || 0);
            const broken = formatCompact(donut?.blocksBroken || 0);
            const mobs = formatCompact(donut?.mobsKilled || 0);
            const spent = formatCompact(donut?.moneySpent || 0);
            const made = formatCompact(donut?.moneyMade || 0);

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

            const embed = new EmbedBuilder()
                .setAuthor({ name: `${username}'s Statistics` })
                .setDescription(output)
                .setColor("#E74C3C")
                .setThumbnail(`https://visage.surgeplay.com/bust/${encodeURIComponent(username)}.png?y=-40&quality=lossless`);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Error in donutstats button:", error);
            const errorEmbed = new EmbedBuilder()
                .setTitle("DonutSMP Statistics")
                .setDescription("Failed to fetch DonutSMP stats.")
                .setColor("#E74C3C");
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
