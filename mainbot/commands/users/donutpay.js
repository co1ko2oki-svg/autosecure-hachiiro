const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'donutpay',
  description: 'Command permanently removed per security policy',
  enabled: false,
  options: [],
  userOnly: true,
  callback: async (client, interaction) => {
    await interaction.reply({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Feature Removed')
          .setDescription('Automated DonutSMP login and payment have been completely removed from this system for security compliance.')
      ]
    });
  }
};
