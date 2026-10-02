const sendconfigmsg = require("../../../autosecure/utils/utils/sendconfigmsg");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "botsconfig",
    userOnly: true,
    callback: async (client, interaction) => {
        const parts = interaction.customId.split("|");
        const botnumber = parseInt(parts[1], 10);
        const ownerid = parts[2];

        if (!botnumber || !ownerid) {
            return await interaction.reply({ content: "Invalid request parameters.", ephemeral: true });
        }

        const isAuthorized = interaction.user.id === ownerid || await isOwner(interaction.user.id);
        if (!isAuthorized) {
            return await interaction.reply({
                content: "You are not authorized to view or download this bot's configuration.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        let msg = await sendconfigmsg(ownerid, botnumber);
        return await interaction.editReply(msg);
    }
};
