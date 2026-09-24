const accountsmsg = require('../../utils/accounts/accountsmsg');
const isOwner = require('../../../db/isOwner');
const access = require('../../../db/access');

module.exports = {
    name: "accounts",
    userOnly: true,
    description: 'List all your accounts',
    callback: async (client, interaction) => {
        const isBotOwner = client.username === interaction.user.id;
        const isAdmin = await isOwner(interaction.user.id);
        const hasLicense = await access(interaction.user.id);

        if (!isBotOwner && !isAdmin && !hasLicense) {
            return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
        }
        let id = interaction.user.id;
        await interaction.reply(await accountsmsg(id, "1"));
    }
};