const { AttachmentBuilder } = require("discord.js");
const { queryParams } = require("../../../db/database");

module.exports = {
    name: "downloadrec",
    callback: async (client, interaction) => {
        try {
            let copyTextId = interaction.customId.split("|")[1];
            const results = await queryParams("SELECT action FROM actions WHERE id = ?", [copyTextId]);

            if (!results || results.length === 0) {
                return interaction.reply({
                    content: `No action found for ID: ${copyTextId}`,
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
                    content: "You are not authorized to download these credentials.",
                    ephemeral: true,
                });
            }


            const fileContent = `Email: ${email}
Security Email: ${secEmail}
Password: ${password}
Recovery Code: ${recoveryCode}`;
            

            const fileBuffer = Buffer.from(fileContent, "utf-8");


            const attachment = new AttachmentBuilder(fileBuffer, { name: `${copyTextId}.txt` });


            await interaction.reply({
                content: `Here's the download for your account:`,
                files: [attachment],
                ephemeral: true,
            });
        } catch (error) {
            console.error("Error downloading account details:", error);
            return interaction.reply({
                content: "An error occurred while creating the file.",
                ephemeral: true,
            });
        }
    },
};
