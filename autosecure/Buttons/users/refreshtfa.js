const generateotp = require("../../utils/secure/codefromsecret");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
            const isBotOwner = client.username && client.username === interaction.user.id;

            let hasAccess = isUserOwner || isBotOwner;
            if (!hasAccess) {
                const ownRows = await client.queryParams("SELECT 1 FROM accountsbyuser WHERE uid = ? AND user_id = ?", [uid, interaction.user.id]);
                if (ownRows && ownRows.length > 0) {
                    hasAccess = true;
                } else if (client.username) {
                    const childPerm = await client.queryParams("SELECT viewaccounts, admin FROM users WHERE user_id = ? AND child = ?", [client.username, interaction.user.id]);
                    if (childPerm && childPerm.length > 0 && (childPerm[0].viewaccounts === 1 || childPerm[0].admin === 1)) {
                        const botOwnRows = await client.queryParams("SELECT 1 FROM accountsbyuser WHERE uid = ? AND user_id = ?", [uid, client.username]);
                        if (botOwnRows && botOwnRows.length > 0) hasAccess = true;
                    }
                }
            }

            if (!hasAccess) {
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

            const buttonsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(interaction.customId)
                    .setLabel("Refresh Code")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`copycode|${code}`)
                    .setLabel("Copy Code")
                    .setEmoji("📋")
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({
                embeds: [updatedEmbed],
                components: [buttonsRow]
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
