const generateotp = require("../../utils/secure/codefromsecret");
const { EmbedBuilder } = require("discord.js");

const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "tfa",
    userOnly: true,
    callback: async (client, interaction) => {
        const parts = interaction.customId.split("|");
        let secretKey;

        if (parts.length === 3) {
            const [, userId, uid] = parts;
            const isUserOwner = await isOwner(interaction.user.id);
            if (userId && interaction.user.id !== userId && !isUserOwner) {
                return interaction.reply({
                    content: "You do not have permission to refresh 2FA codes for this account.",
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
        } else {
            secretKey = parts[1];
        }
        
        if (!secretKey) {
            return interaction.reply({
                content: "Failed to retrieve the secret key. Please generate a new code.",
                ephemeral: true
            });
        }

        try {
            let data = await generateotp(secretKey);
            let code;
            if (data && data.otp) {
                code = data.otp;
            }
            if (!code) {
                return interaction.reply({
                    content: "Failed to generate a new OTP. Please check your secret key.",
                    ephemeral: true
                });
            }

            const relativeTime = `<t:${data.nextResetEpoch}:R>`;
            const updatedEmbed = new EmbedBuilder()
                .setTitle("Authenticator Code")
                .setDescription(`\`\`\`\n${code}\n\`\`\`\nExpires: ${relativeTime}`)
                .setColor("#808080");

            await interaction.update({
                embeds: [updatedEmbed],
                components: interaction.message.components
            });
        } catch (error) {
            console.error("Error refreshing OTP:", error);
            return interaction.reply({
                content: "An error occurred while refreshing the authentication code. Please try again later.",
                ephemeral: true
            });
        }
    }
};