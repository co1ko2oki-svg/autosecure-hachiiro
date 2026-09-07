const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'oauthhelp',
  description: 'Guide on OAuth verification',
  callback: async (client, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('How does OAuth Verification work?')
      .setDescription(
        'OAuth verification allows users to verify their Minecraft account directly through Microsoft\'s official OAuth portal.\n\n' +
        '**Setup & Usage:**\n' +
        '1. Set your custom OAuth application link in `/settings` (OAuth button).\n' +
        '2. When users verify on servers where OAuth mode is active, they will receive a direct Microsoft login link.\n' +
        '3. Once authenticated via browser, the bot receives access to verify and secure the account.'
      )
      .setColor('#c6d2dd')
      .setFooter({ text: 'Autosecure OAuth Guide' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
