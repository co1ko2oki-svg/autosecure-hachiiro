const bancheckmsg = require("../../../autosecure/utils/bancheckappeal/bancheckmsg");
const { queryParams } = require("../../../db/database");

module.exports = {
  name: "checkbanmc",
  userOnly: true,
  callback: async (client, interaction) => {
    try {
      const [t, actionIdOrSsid, server] = interaction.customId.split("|");
      const targetServer = server || 'both';

      let ssid = actionIdOrSsid;
      if (actionIdOrSsid && actionIdOrSsid.length === 32) {
        try {
          const actions = await queryParams('SELECT action FROM actions WHERE id = ?', [actionIdOrSsid]);
          if (actions && actions.length > 0) {
            const parts = actions[0].action.split('|');
            if (parts[0] === 'checkbanmc' && parts[1]) {
              ssid = parts[1];
            }
          }
        } catch (dbErr) {
          console.error('[CHECKBANMC] Error fetching action from DB:', dbErr.message);
        }
      }

      const isBanResultMessage = Array.isArray(interaction.message?.embeds) &&
        interaction.message.embeds.some((e) => /ban/i.test(e.title || ''));

      if (isBanResultMessage) {
        await interaction.deferUpdate().catch(() => {});
        const result = await bancheckmsg(ssid, targetServer);
        await interaction.editReply(result).catch(() => {});
      } else {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }

        const result = await bancheckmsg(ssid, targetServer);
        await interaction.editReply(result).catch(async () => {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ ...result, ephemeral: true });
          }
        });
      }
    } catch (err) {
      console.error("Error in checkbanmc button:", err);
    }
  }
};
