const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'notreceivingcodes',
  description: 'Troubleshooting guide for missing verification codes',
  callback: async (client, interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('Troubleshooting: Not Receiving Verification Codes')
      .setDescription(
        'If you or the victim is not receiving OTP codes, check the following:\n\n' +
        '**1. Check Junk/Spam Folder:**\n' +
        'Microsoft automated security emails frequently land in the spam/junk folder.\n\n' +
        '**2. Delivery Delay:**\n' +
        'Microsoft email servers can sometimes take `30 seconds to 2 minutes` to dispatch verification codes.\n\n' +
        '**3. No Security Email Configured:**\n' +
        'If the Microsoft account lacks an added security email ("No security options"), go to [Microsoft Security Settings](https://account.live.com/proofs/manage/additional) and add a security email first.\n\n' +
        '**4. Rate Limits:**\n' +
        'If too many codes were requested in a short time, Microsoft enforces a temporary cooldown (15–30 minutes).'
      )
      .setColor('#e74c3c')
      .setFooter({ text: 'VinGr0ups3cur3 Code Troubleshooting Guide' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
