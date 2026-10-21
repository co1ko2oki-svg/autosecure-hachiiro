const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");
const usersMsg = require("../../utils/embeds/usersMsg");

module.exports = {
    name: "removeuser",
    editclaiming: true,
    callback: async (client, interaction) => {
        const [, page, userId, ownerid, botnumber] = interaction.customId.split("|");
        const isUserOwner = await isOwner(interaction.user.id);
        if (interaction.user.id !== ownerid && !isUserOwner) {
            const permissionCheck = await queryParams(
                `SELECT editclaiming, admin FROM users WHERE user_id=? AND child=? AND botnumber=?`,
                [ownerid, interaction.user.id, botnumber]
            );
            if (permissionCheck.length === 0 || (!permissionCheck[0].editclaiming && !permissionCheck[0].admin)) {
                return interaction.reply({ content: "You do not have permission to remove users from this bot.", ephemeral: true });
            }
        }
        

        await client.queryParams(
            `DELETE FROM users WHERE user_id=? AND child=? AND botnumber=?`, 
            [ownerid, userId, botnumber]
        );
        

        return interaction.update(
            await usersMsg(ownerid, parseInt(page), interaction.user.id, botnumber)
        );
    }
};