const { queryParams } = require("../../../db/database");
const accountsmsg = require('../../utils/accounts/accountsmsg');
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "deletefinal",
    callback: async (client, interaction) => {
        let [t, id, current, uid] = interaction.customId.split("|"); // Extract UID from customId
        current = parseInt(current) || 1;

        const isUserOwner = await isOwner(interaction.user.id);
        if (id && interaction.user.id !== id && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to delete this account.", ephemeral: true });
        }

        const effectiveUserId = isUserOwner ? id : interaction.user.id;
        await client.queryParams(`DELETE FROM accountsbyuser WHERE user_id=? AND uid=?`, [effectiveUserId, uid]);

        const remainingAccounts = await client.queryParams(`SELECT * FROM accountsbyuser WHERE user_id=?`, [effectiveUserId]);

        if (remainingAccounts.length === 0) {
            current = 1;
        } else if (current > remainingAccounts.length) {
            current = remainingAccounts.length;
        }

        return interaction.update(await accountsmsg(effectiveUserId, current));
    }
};