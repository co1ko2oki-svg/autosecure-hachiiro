const getEmbed = require("../../utils/responses/getEmbed");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

let howtoauthbutton = {
  name: "howtoauthbutton",
  callback: async (client, interaction) => {
    try {
      const embed = await getEmbed(client, "howtoauth");
      const retryButton = new ButtonBuilder()
        .setCustomId("link account")
        .setEmoji("🔁")
        .setLabel("Retry")
        .setStyle(ButtonStyle.Success);

      await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(retryButton)],
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error sending embed:", error);
      await interaction.reply({
        content: "There was an error fetching the embed.",
        ephemeral: true,
      });
    }
  },
};

module.exports = howtoauthbutton;
