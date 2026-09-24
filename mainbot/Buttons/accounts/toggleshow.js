const accountsmsg = require("../../../autosecure/utils/accounts/accountsmsg");
const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "togglenonmc",
    callback: async (client, interaction) => {
        const [t, userId] = interaction.customId.split("|");
        const isUserOwner = await isOwner(interaction.user.id);
        if (userId && interaction.user.id !== userId && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to toggle settings for this user.", ephemeral: true });
        }
        const effectiveUserId = interaction.user.id;

        const settingsQuery = await client.queryParams(
            `SELECT hidenonmc FROM settings WHERE user_id=?`, 
            [effectiveUserId]
        );

        const currentSetting = settingsQuery[0]?.hidenonmc === 1;
        const newSetting = !currentSetting;

        await client.queryParams(
            `UPDATE settings SET hidenonmc=? WHERE user_id=?`,
            [newSetting ? 1 : 0, effectiveUserId]
        );

        return interaction.update(await accountsmsg(effectiveUserId, 1));
    }
};