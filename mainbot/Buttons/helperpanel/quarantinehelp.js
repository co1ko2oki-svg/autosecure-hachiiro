const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'quarantinehelp',
  description: 'Guide on Hypixel Auto-Quarantine',
  callback: async (client, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('Hypixel Auto-Quarantine Guide')
      .setDescription(
        'Auto-Quarantine automatically logs into Hypixel using configured SOCKS5 proxies to place secured accounts in the Hypixel login quarantine queue.\n\n' +
        '**How to use:**\n' +
        '1. Add valid SOCKS5 proxies using `/addproxy`.\n' +
        '2. Open `/settings` -> Features panel and toggle **"Auto-Quarantine"** to ON.\n' +
        '3. When an account is secured, the bot will automatically initiate the quarantine routine.'
      )
      .setColor('#c6d2dd')
      .setFooter({ text: 'VinGr0ups3cur3 Quarantine Guide' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
