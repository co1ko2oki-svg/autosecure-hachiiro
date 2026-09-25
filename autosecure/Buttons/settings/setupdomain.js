const { getDnsRecordsEmbed } = require("../../utils/emails/dnsInstructions");

module.exports = {
    name: "setupdomain",
    callback: async (client, interaction) => {
        const embed = getDnsRecordsEmbed();
        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};
