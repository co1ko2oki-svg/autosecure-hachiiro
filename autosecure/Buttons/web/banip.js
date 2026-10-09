const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");
const { PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "banip",
    callback: async (client, interaction) => {
        try {
            const isUserOwner = await isOwner(interaction.user.id);
            const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isUserOwner && !hasAdminPerm) {
                return interaction.reply({
                    content: "❌ Bạn không có quyền quản trị để thực hiện thao tác cấm IP này.",
                    ephemeral: true
                });
            }

            const [action, targetIp] = interaction.customId.split("|");
            if (!targetIp) {
                return interaction.reply({ content: "❌ Không tìm thấy địa chỉ IP cần cấm.", ephemeral: true });
            }

            const banner = `${interaction.user.tag} (${interaction.user.id})`;
            await queryParams(
                `INSERT OR REPLACE INTO banned_ips (ip, reason, banned_by, banned_at) VALUES (?, ?, ?, ?)`,
                [targetIp, "Banned via Discord Button", banner, Date.now()]
            );

            return interaction.reply({
                content: `🚫 **Đã cấm IP \`${targetIp}\` truy cập website checkout!**`,
                ephemeral: true
            });
        } catch (err) {
            console.error("[BUTTON banip] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi khi cấm IP: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
