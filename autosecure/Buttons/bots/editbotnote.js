const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { queryParams } = require('../../../db/database');

module.exports = {
    name: "editbotnote",
    editbot: true,
    callback: async (client, interaction) => {
        let id = interaction.customId.split('|')[1];
        let botnumber = interaction.customId.split('|')[2];

        let existingNote = '';
        try {
            const botData = await queryParams(
                "SELECT note FROM autosecure WHERE user_id = ? AND botnumber = ? LIMIT 1",
                [id, botnumber],
                "get"
            );
            if (botData && botData.note) {
                existingNote = botData.note;
            }
        } catch (e) {
            console.error("Error fetching note for modal prefill:", e);
        }

        const modal = new ModalBuilder()
            .setCustomId(`botnotemodal|${id}|${botnumber}`)
            .setTitle('Set Bot Note');

        const noteInput = new TextInputBuilder()
            .setCustomId('bot_note_input')
            .setLabel('Ghi chú (Note)')
            .setPlaceholder('Enter your note here...')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false);

        if (existingNote) {
            noteInput.setValue(existingNote);
        }

        const firstActionRow = new ActionRowBuilder().addComponents(noteInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    }
};
