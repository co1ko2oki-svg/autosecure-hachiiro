const bancheckmsg = require('../../utils/bancheckappeal/bancheckmsg');
const { queryParams } = require('../../../db/database');

module.exports = {
  name: "checkbanmc",
  ownerOnly: true,
  callback: async (client, interaction) => {
    try {
      const [, actionIdOrSsid, server = 'both'] = interaction.customId.split("|");
      let ssid = actionIdOrSsid;

      if (ssid?.length === 32) {
        const rows = await queryParams('SELECT action FROM actions WHERE id = ?', [ssid]).catch(() => []);
        const actionPart = rows?.[0]?.action?.split('|');
        if (actionPart?.[0] === 'checkbanmc' && actionPart[1]) ssid = actionPart[1];
      }

      const isBanMsg = interaction.message?.embeds?.some(e => /ban/i.test(e.title || ''));
      if (isBanMsg) {
        await interaction.deferUpdate().catch(() => {});
      } else if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }

      const result = await bancheckmsg(ssid, server);
      await interaction.editReply(result).catch(() => {});
    } catch (err) {
      console.error("[CHECKBANMC] Error:", err.message);
    }
  }
};
