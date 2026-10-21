const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");
const usersMsg = require("../../utils/embeds/usersMsg");
const { addnotification } = require("../../../mainbot/utils/usernotifications");

module.exports = {
    name: "bettersplit",
    editclaiming: true,
    callback: async (client, interaction) => {
        try {
            let [t, child, current, split, claiming, ownerid, botnumber] = interaction.customId.split("|");
        const isUserOwner = await isOwner(interaction.user.id);
        if (interaction.user.id !== ownerid && !isUserOwner) {
            const permissionCheck = await queryParams(
                `SELECT editclaiming, admin FROM users WHERE user_id=? AND child=? AND botnumber=?`,
                [ownerid, interaction.user.id, botnumber]
            );
            if (permissionCheck.length === 0 || (!permissionCheck[0].editclaiming && !permissionCheck[0].admin)) {
                return interaction.reply({ content: "You do not have permission to manage users for this bot.", ephemeral: true });
            }
        }
            let newsplit = Number(split) - 1;

            if (newsplit > 0.1) {
                await queryParams(
                    `UPDATE users SET split=? WHERE user_id=? AND child=? AND botnumber=?`,
                    [newsplit, ownerid, child, botnumber]
                );
            }

            await addnotification(client, child);

            return interaction.update(await usersMsg(ownerid, current, interaction.user.id, botnumber));
        } catch (error) {
            console.error("Error in bettersplit command:", error);
        }
    },
};
