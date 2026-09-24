const generateotp = require("../../utils/secure/codefromsecret");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "auth",
    description: "Button handler for generating 2FA codes",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            const parts = interaction.customId.split("|");
            let secretKey;
            let refreshCustomId;

            if (parts.length === 3) {
                const [, userId, uid] = parts;
                const isUserOwner = await isOwner(interaction.user.id);
                if (userId && interaction.user.id !== userId && !isUserOwner) {
                    return interaction.reply({
                        content: "You do not have permission to view 2FA codes for this account.",
                        ephemeral: true
                    });
                }

                const accountRows = await client.queryParams("SELECT secretkey FROM accounts WHERE uid = ?", [uid]);
                if (!accountRows || accountRows.length === 0) {
                    return interaction.reply({
                        content: "Account not found.",
                        ephemeral: true
                    });
                }
                secretKey = accountRows[0].secretkey;
                refreshCustomId = `tfa|${userId}|${uid}`;
            } else {
                secretKey = parts[1];
                refreshCustomId = `tfa|${secretKey}`;
            }


if (
    !secretKey ||
    secretKey === 'Disabled' ||
    secretKey === 'Option is disabled.' ||
    secretKey === 'Failed to add' ||
    secretKey.replace(/\s/g, '') === 'Optionisdisabled.' ||
    secretKey.replace(/\s/g, '') === 'Failedtoadd' ||
    secretKey.replace(/\s/g, '') === 'Disabled'
) {
    return interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("No secret key available for this account.")
                .setColor("#87CEEB")
        ],
        ephemeral: true
    });
}

            

            let data = await generateotp(secretKey);

            let code;
            
            if (data && data.otp) {
                code = data.otp;
            }

            if (!code) {
                return interaction.reply({
                    content: "Invalid secret key. Please provide a valid 2FA secret key.",
                    ephemeral: true
                });
            }

            const relativeTime = `<t:${data.nextResetEpoch}:R>`;
            
            const embed = new EmbedBuilder()
                .setTitle("Authenticator Code")
                .setDescription(`\`\`\`\n${code}\n\`\`\`\nExpires: ${relativeTime}`)
                .setColor("#808080");

            const refreshButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(refreshCustomId)
                    .setLabel("Refresh Code")
                    .setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({
                embeds: [embed],
                components: [refreshButton],
                ephemeral: true
            });

        } catch (error) {
            console.error("Error generating OTP:", error);
            return interaction.reply({
                content: "An error occurred while generating the authentication code.",
                ephemeral: true
            });
        }
    }
};