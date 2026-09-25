const { getDnsRecordsEmbed } = require("../../utils/emails/dnsInstructions");

module.exports = {
    name: "dns_records",
    callback: async (client, interaction) => {
        const embed = getDnsRecordsEmbed();
        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};
