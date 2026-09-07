const listExtraOptions = require("../../utils/settings/listExtraOptions");

module.exports = {
    name: "moreoptions",
    callback: async (client, interaction) => {
        const ownerId = client.username;
        const userId = interaction.user.id;

        const users = await client.queryParams(
            `SELECT * FROM users WHERE user_id=? AND child=?`,
            [ownerId, userId]
        );

        if (userId !== ownerId && (users.length === 0 || users[0].editfeatures !== 1)) {
            return interaction.reply({
                content: "You don't have permission to edit features!",
                ephemeral: true
            });
        }

        const msg = await listExtraOptions(client, ownerId);
        return interaction.update(msg);
    }
};
