const { codeblock } = require("../../utils/process/helpers");
const { queryParams } = require("../../../db/database");
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "copytokenbot",
    editbot: true,
    callback: async (client, interaction) => {
        return interaction.reply({
            content: "Viewing bot tokens via Discord is permanently disabled for security reasons.",
            ephemeral: true
        });
    }
};
