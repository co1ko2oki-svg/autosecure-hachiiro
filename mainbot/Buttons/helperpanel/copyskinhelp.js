const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'copyskinhelp',
  description: 'Guide on how to copy or change skin',
  callback: async (client, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('How to Copy / Change Minecraft Skin')
      .setDescription(
        '### 1. Change Skin via SSID Checker\n' +
        '• In the SSID Checker panel, click the **"Change Skin"** button.\n' +
        '• Enter any Minecraft player\'s IGN (e.g. `Dream`, `Notch`) or a direct skin image URL.\n' +
        '• Choose the model type: `classic` (Steve 4px) or `slim` (Alex 3px).\n\n' +
        '### 2. Auto Change Skin in VinGr0ups3cur3\n' +
        '• Open `/settings` and toggle **"Change Skin"** to ON.\n' +
        '• Click **"Change Skin URL (set)"** to configure the skin IGN/URL applied automatically to secured accounts.'
      )
      .setColor('#c6d2dd')
      .setFooter({ text: 'VinGr0ups3cur3 Minecraft Skin Guide' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
