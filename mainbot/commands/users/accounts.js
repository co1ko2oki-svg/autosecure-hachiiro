const accountsmsg = require("../../../autosecure/utils/accounts/accountsmsg");
const isOwner = require("../../../db/isOwner");
const access = require("../../../db/access");

module.exports = {
    name: "accounts",
    description: 'List and manage all your accounts',
    userOnly: true,
    callback: async (client, interaction) => {
        const isAdmin = await isOwner(interaction.user.id);
        const hasLicense = await access(interaction.user.id);

        if (!isAdmin && !hasLicense) {
            return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
        }
        let id = interaction.user.id;
        await interaction.reply(await accountsmsg(id, "1"));
    }
};