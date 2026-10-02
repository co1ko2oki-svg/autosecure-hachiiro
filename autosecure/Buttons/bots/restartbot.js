const { autosecureMap } = require("../../../mainbot/handlers/botHandler");
const autosecure = require("../../autosecure");
const { queryParams } = require("../../../db/database");
const checkToken = require("../../utils/utils/checkToken");
const showbotmsg = require("../../utils/bot/showbotmsg");
const isOwner = require("../../../db/isOwner");
const { decryptToken } = require("../../utils/security/tokenCipher");

module.exports = {
    name: "restart",
    editbot: true,
    callback: async (client, interaction) => {
        let userId = interaction.customId.split('|')[1] || interaction.user.id;
        let botnumber = interaction.customId.split('|')[2];

        const isAuthorized = interaction.user.id === userId || await isOwner(interaction.user.id);
        if (!isAuthorized) {
            return await interaction.reply({
                content: "You are not authorized to restart this bot.",
                ephemeral: true
            });
        }

        await interaction.update({ content: `Restarting bot...`, embeds: [], components: [] });
        
        let result = await queryParams(`SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?`, [userId, botnumber]);
        
        if (!result || result.length === 0) {
            return interaction.editReply({
                content: `No token found for this bot, you likely deleted this bot.`
            });
        }

        let token = decryptToken(result[0].token);
        
        let checked = await checkToken(token);
        if (!checked) {
            return interaction.editReply({
                content: `Invalid discord token! Please use the change token button first then restart.`
            });
        }

        let d = `${userId}|${botnumber}`;
        let c = autosecureMap.get(d);
        
        if (c) {
            autosecureMap.delete(d);
            try { c.destroy(); } catch (e) {}
        }

        let as = await autosecure(token, userId, botnumber);
        autosecureMap.set(d, as);

        let msg = await showbotmsg(userId, botnumber, interaction.user.id, client);

        const inviteLink = `https://discord.com/oauth2/authorize?client_id=${as.user.id}&permissions=8&scope=bot+applications.commands`;
        const content = `[Restarted bot! [Click to Invite]](${inviteLink})`;

        msg.content = content;
        await interaction.editReply(msg);
    }
};

