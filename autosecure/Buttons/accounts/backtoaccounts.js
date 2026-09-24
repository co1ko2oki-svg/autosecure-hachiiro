const accountsmsg = require('../../utils/accounts/accountsmsg');
const isOwner = require('../../../db/isOwner');

module.exports = {
    name: "backtoaccounts",
    callback: async (client, interaction) => {
        let [t, id, current] = interaction.customId.split("|");
        const isUserOwner = await isOwner(interaction.user.id);
        if (id && interaction.user.id !== id && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to view these accounts.", ephemeral: true });
        }
        return interaction.update(await accountsmsg(interaction.user.id, current));
    }
};