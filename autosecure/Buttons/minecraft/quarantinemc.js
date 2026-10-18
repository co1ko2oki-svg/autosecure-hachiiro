const { quarantinemsg } = require('../../utils/bancheckappeal/quarantinemsg');


module.exports = {
  name: "quarantinemc",
  ownerOnly: true,
  callback: async (client, interaction) => {
    try {
      await interaction.deferReply({ ephemeral: true });
      const [t, ssid] = interaction.customId.split("|");
      const result = await quarantinemsg(interaction.user.id, ssid);
      await interaction.editReply(result);
    } catch (err) {
      console.error("[QUARANTINEMC] Error:", err.message || err);
      const method = (interaction.deferred || interaction.replied) ? 'editReply' : 'reply';
      await interaction[method]({ content: "An error occurred while adding to quarantine.", ephemeral: true }).catch(() => {});
    }
  }
};
