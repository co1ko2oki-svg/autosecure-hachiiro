const { AttachmentBuilder } = require("discord.js");
const { queryParams } = require("../../../db/database");

module.exports = {
    name: "downloadrec",
    callback: async (client, interaction) => {
        try {
            let copyTextId = interaction.customId.split("|")[1];
            const results = await client.queryParams("SELECT action FROM actions WHERE id = ?", [copyTextId]);

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
                if (ownerId && interaction.user.id !== ownerId && !isUserOwner) {
                    return interaction.reply({
                        content: "You are not authorized to download these credentials.",
                        ephemeral: true,
                    });
                }
            } else {
                [, email, secEmail, password, recoveryCode] = parts;
                const isChildBotOwner = client.username && client.username === interaction.user.id;
                if (!isUserOwner && !isChildBotOwner) {
                    return interaction.reply({
                        content: "You are not authorized to download these credentials.",
                        ephemeral: true,
                    });
                }
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
