const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const isOwner = require('../../../db/isOwner');

module.exports = {
    name: "changetoken",
    editbot: true,
    callback: async (client, interaction) => {
        let id = interaction.customId.split('|')[1];
        let botnumber = interaction.customId.split('|')[2];

        const isAuthorized = interaction.user.id === id || await isOwner(interaction.user.id);
        if (!isAuthorized) {
            return await interaction.reply({
                content: "You are not authorized to modify this bot.",
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`tokenmodal|${id}|${botnumber}`)
            .setTitle('Set Bot Activity');

        const tokeninput = new TextInputBuilder()
            .setCustomId('token')
            .setLabel('Enter new bot token to transfer bot to!')
            .setPlaceholder('Discord Developer > Bot > Reset Token then copy it.')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(4000)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(tokeninput);

        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    }
};
