const { ApplicationCommandOptionType } = require('discord.js');
const bancheckmsg = require('../../utils/bancheckappeal/bancheckmsg');

module.exports = {
  name: 'checkban',
  description: 'Check if a Minecraft account is banned on Hypixel, DonutSMP, and/or MCPVP',
  enabled: true,
  options: [
    {
      name: 'ssid',
      description: 'The Minecraft SSID session to check',
      type: ApplicationCommandOptionType.String,
      required: true
    },
    {
      name: 'server',
      description: 'The server to check ban status on (Default: All Servers)',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: '🌐 All (Hypixel, DonutSMP, MCPVP)', value: 'both' },
        { name: '⚔️ Hypixel Only', value: 'hypixel' },
        { name: '🍩 DonutSMP Only', value: 'donut' },
        { name: '🛡️ MCPVP Only', value: 'mcpvp' }
      ]
    }
  ],
  userOnly: true,
  callback: async (client, interaction) => {
    await interaction.deferReply({ ephemeral: true });

    try {
      const ssid = interaction.options.getString('ssid');
      const server = interaction.options.getString('server') || 'both';
      const result = await bancheckmsg(ssid, server);
      await interaction.editReply(result);
    } catch (error) {
      console.error('Ban check error:', error);
      await interaction.editReply({
        embeds: [
          {
            color: 0xff0000,
            title: 'Error',
            description: 'Failed to check ban, dm me with this ty.'
          }
        ]
      });
    }
  }
};
