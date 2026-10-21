const emailMsg = require("../../utils/emails/emailMsg");
const isOwner = require("../../../db/isOwner");
const { queryParams } = require("../../../db/database");

module.exports = {
    name: "email",
    mail: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            const parts = interaction.customId.split("|");
            let email;

            if (parts.length === 3) {
                email = parts[2];
            } else {
                email = parts[1];
            }

            if (!email || email === "None" || email === "Invalid Login Cookie!") {
                return interaction.editReply({ content: "No email!", ephemeral: true });
            }

            const isUserOwner = await isOwner(interaction.user.id);
            const isBotOwner = client.username && client.username === interaction.user.id;
            let hasAccess = isUserOwner || isBotOwner;
            if (!hasAccess) {
                const ownAcc = await queryParams(
                    `SELECT 1 FROM accounts a JOIN accountsbyuser ab ON a.uid = ab.uid WHERE ab.user_id = ? AND (a.email = ? OR a.secemail = ?)`,
                    [interaction.user.id, email, email]
                );
                if (ownAcc && ownAcc.length > 0) {
                    hasAccess = true;
                } else if (client.username) {
                    const childPerm = await queryParams("SELECT viewemails, admin FROM users WHERE user_id = ? AND child = ?", [client.username, interaction.user.id]);
                    if (childPerm && childPerm.length > 0 && (childPerm[0].viewemails === 1 || childPerm[0].admin === 1)) {
                        const botAcc = await queryParams(
                            `SELECT 1 FROM accounts a JOIN accountsbyuser ab ON a.uid = ab.uid WHERE ab.user_id = ? AND (a.email = ? OR a.secemail = ?)`,
                            [client.username, email, email]
                        );
                        if (botAcc && botAcc.length > 0) hasAccess = true;
                    }
                }
            }

            if (!hasAccess) {
                return interaction.editReply({ content: "You do not have permission to view emails for this account.", ephemeral: true });
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