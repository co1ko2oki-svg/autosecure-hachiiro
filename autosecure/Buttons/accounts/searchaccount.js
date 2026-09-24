const { TextInputBuilder, ActionRowBuilder, TextInputStyle } = require("discord.js");
const modalBuilder = require('../../utils/modalBuilder');

const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "search",
    callback: async (client, interaction) => {
        const [t, userId] = interaction.customId.split("|");
        const isUserOwner = await isOwner(interaction.user.id);
        if (userId && interaction.user.id !== userId && !isUserOwner) {
            return interaction.reply({ content: "You do not have permission to search these accounts.", ephemeral: true });
        }

        interaction.showModal(modalBuilder(`searchmodal`, 'Search Accounts', [
            {
                setCustomId: 'searchQuery',
                setMaxLength: 256,
                setMinLength: 1,
                setRequired: true,
                setLabel: "Search Query",
                setPlaceholder: "Enter username, email, or other details",
                setStyle: TextInputStyle.Short
            }
        ]));
    }
};