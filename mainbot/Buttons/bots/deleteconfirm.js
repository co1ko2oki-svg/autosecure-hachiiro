const { saveBotConfig, clearBotConfig, sendBotConfigToUser } = require("../../../autosecure/utils/bot/configutils");
const { EmbedBuilder, ActionRowBuilder } = require("discord.js");
const { autosecureMap } = require("../../handlers/botHandler");
const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "deletebotconfirm",
    editbot: true,
    callback: async (client, interaction) => {
        const [_, targetUserId, botnumber] = interaction.customId.split('|');

        try {
            // Determine real owner from database
            const botRecords = await queryParams(
                'SELECT user_id FROM autosecure WHERE user_id = ? AND botnumber = ?',
                [targetUserId, botnumber]
            );

            if (!botRecords || botRecords.length === 0) {
                return await interaction.reply({
                    content: "Bot not found or already deleted.",
                    ephemeral: true
                });
            }

            const realOwnerId = botRecords[0].user_id;
            const isAuthorized = interaction.user.id === realOwnerId || await isOwner(interaction.user.id);
            if (!isAuthorized) {
                return await interaction.reply({
                    content: "You are not authorized to delete this bot.",
                    ephemeral: true
                });
            }

            // Secure backup delivered only to owner's private DMs without secrets
            await sendBotConfigToUser(realOwnerId, botnumber, client);

            await clearBotConfig(realOwnerId, botnumber);

            const autosecureKey = `${realOwnerId}|${botnumber}`;
            const botClient = autosecureMap.get(autosecureKey);
            if (botClient) {
                botClient.destroy();
            }
            autosecureMap.delete(autosecureKey);

            // Double delete isnt cool
            const components = interaction.message.components.map(row => {
                const newRow = ActionRowBuilder.from(row);
                newRow.components.forEach(component => component.setDisabled(true));
                return newRow;
            });

            const embed = new EmbedBuilder()
                .setTitle(`Bot #${botnumber} Deleted`)
                .setDescription(`Bot #${botnumber} has been deleted successfully. A backup copy of your configuration has been sent to your DMs.`)
                .setColor(0xADD8E6);

            await interaction.update({
                embeds: [embed],
                components: components,
            });

        } catch (error) {
            console.error('Error deleting bot:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: `An error occurred while deleting bot #${botnumber}: ${error.message}`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `An error occurred while deleting bot #${botnumber}: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
};
