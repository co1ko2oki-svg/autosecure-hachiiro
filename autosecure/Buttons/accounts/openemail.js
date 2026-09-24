const emailMsg = require("../../utils/emails/emailMsg");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "email",
    mail: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            const parts = interaction.customId.split("|");
            let email;

            if (parts.length === 3) {
                const [, userId, secEmail] = parts;
                const isUserOwner = await isOwner(interaction.user.id);
                if (userId && interaction.user.id !== userId && !isUserOwner) {
                    return interaction.editReply({ content: "You do not have permission to view emails for this account.", ephemeral: true });
                }
                email = secEmail;
            } else {
                email = parts[1];
            }

            if (!email || email === "None" || email === "Invalid Login Cookie!") {
                return interaction.editReply({ content: "No email!", ephemeral: true });
            }

            const message = await emailMsg(email, interaction.user.id, 1);
            return interaction.editReply(message);
        } catch (error) {
            console.error("Error in openemail callback:", error);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content: "An error occurred while processing your request.", ephemeral: true });
            } else {
                return interaction.reply({ content: "An error occurred while processing your request.", ephemeral: true });
            }
        }
    }
};