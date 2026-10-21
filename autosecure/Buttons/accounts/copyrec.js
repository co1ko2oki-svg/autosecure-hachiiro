const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { queryParams } = require("../../../db/database");

module.exports = {
    name: "copyrec",
    userOnly: true,
    callback: async (client, interaction) => {
        try {

            let [t, recsecId] = interaction.customId.split("|");
            const results = await queryParams("SELECT action FROM actions WHERE id = ?", [recsecId]);

            if (!results || results.length === 0) {
                return interaction.reply({
                    content: `No action found for ID: ${recsecId}`,
                    ephemeral: true,
                });
            }

            const parts = results[0].action.split("|");
            let ownerId, email, secEmail, password, recoveryCode;
            const isOwner = require("../../../db/isOwner");
            const isUserOwner = await isOwner(interaction.user.id);

            if (parts.length >= 6) {
                [, ownerId, email, secEmail, password, recoveryCode] = parts;
            } else {
                [, email, secEmail, password, recoveryCode] = parts;
            }

            const isChildBotOwner = client.username && client.username === interaction.user.id;
            let isAuthorized = isUserOwner || isChildBotOwner || (ownerId && interaction.user.id === ownerId);

            if (!isAuthorized) {
                const targetOwner = ownerId || client.username;
                if (targetOwner) {
                    const childPerm = await queryParams(
                        "SELECT viewaccounts, admin FROM users WHERE user_id = ? AND child = ?",
                        [targetOwner, interaction.user.id]
                    );
                    if (childPerm && childPerm.length > 0 && (childPerm[0].viewaccounts === 1 || childPerm[0].admin === 1)) {
                        isAuthorized = true;
                    }
                }
            }

            if (!isAuthorized) {
                return interaction.reply({
                    content: "You are not authorized to view these credentials.",
                    ephemeral: true,
                });
            }


            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`downloadrec|${recsecId}`) // Corrected `copyTextId` to `recsecId`
                    .setLabel("Download Account")
                    .setStyle(ButtonStyle.Secondary) // Correct enum for button style
            );


            return interaction.reply({
                content: `Email: ${email}\nSecurity Email: ${secEmail}\nPassword: ${password}\nRecovery Code: ${recoveryCode}`,
                components: [row],
                ephemeral: true, // Only visible to the user
            });
        } catch (error) {
            console.error("Error processing copy text:", error);
            return interaction.reply({
                content: "An error occurred while retrieving the action details.",
                ephemeral: true,
            });
        }
    },
};
