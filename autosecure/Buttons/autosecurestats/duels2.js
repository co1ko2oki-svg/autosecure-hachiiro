const short = require("short-number");
const getUUID = require("../../utils/hypixelapi/getUUID");
const getStats = require('../../utils/hypixelapi/getStats');
const { EmbedBuilder } = require("discord.js");
const { getSkinAttachment } = require("../../utils/imageHandler");

module.exports = {
  name: "duels2",
  usestatsbutton: true,
  callback: async (client, interaction) => {
    let mcname = interaction.customId.split("|")[1];
    if (!mcname) {
      return interaction.reply({ content: "None", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const stats = await getStats(mcname);
      if (!stats || stats.hasapi === false) {
        const desc = (stats && stats.hasapi === false)
            ? '⚠️ Hypixel API key is missing or expired. Set key in config.json (`hypixelApiKey`) or via `/admin config enterapi`.'
            : 'No Duels stats found for this player.';
        const errEmbed = new EmbedBuilder()
            .setTitle("Duels stats")
            .setDescription(desc)
            .setColor("#E74C3C");
        return interaction.editReply({ embeds: [errEmbed] });
      }
      const duelsStats = stats?.duels || {};

      const calculatedStats = {
        nwl: stats.nwl || 0,
        rank: stats.rank || "None",
        wins: duelsStats.wins || 0,
        losses: duelsStats.losses || 0,
        kills: duelsStats.kills || 0,
        deaths: duelsStats.deaths || 0,
        coins: duelsStats.coins || 0,
        gamesPlayed: duelsStats.totalGamesPlayed || 0,
        title: duelsStats.title || "No Rank",
        wlr: duelsStats.WLRatio || "0.00",
        klr: duelsStats.KLRatio || "0.00",
      };

      const description =
        `NWL: \`${calculatedStats.nwl}\`\n` +
        `Division: [\`${calculatedStats.title}\`] | [\`${calculatedStats.rank}\`]\n` +
        `\`•\` WLR: \`${calculatedStats.wlr}\` (Wins: \`${calculatedStats.wins}\`, Losses: \`${calculatedStats.losses}\`)\n` +
        `\`•\` KDR: \`${calculatedStats.klr}\` (Kills: \`${calculatedStats.kills}\`, Deaths: \`${calculatedStats.deaths}\`)\n` +
        `\`•\` Coins: \`${short(calculatedStats.coins)}\` (Games Played: \`${calculatedStats.gamesPlayed}\`)`;

      const embed = new EmbedBuilder()
        .setTitle("Duels stats")
        .setDescription(description)
        .setColor("#E74C3C");

      const skinAttachment = await getSkinAttachment(mcname);
      if (skinAttachment && skinAttachment.name) {
        embed.setThumbnail("attachment://" + skinAttachment.name);
      }

      const replyOptions = { embeds: [embed] };
      if (skinAttachment) {
        replyOptions.files = [skinAttachment];
      }

      await interaction.editReply(replyOptions);
    } catch (e) {
      console.error("Error in duels2 command:", e);
      return interaction.editReply({ content: "None" });
    }
  },
};
