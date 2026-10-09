const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");
const { PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "unbanip",
    callback: async (client, interaction) => {
        try {
            const isUserOwner = await isOwner(interaction.user.id);
            const hasAdminPerm = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isUserOwner && !hasAdminPerm) {
                return interaction.reply({
                    content: "❌ Bạn không có quyền quản trị để thực hiện thao tác gỡ cấm IP này.",
                    ephemeral: true
                });
            }

            const [action, targetIp] = interaction.customId.split("|");
            if (!targetIp) {
                return interaction.reply({ content: "❌ Không tìm thấy địa chỉ IP cần gỡ cấm.", ephemeral: true });
            }

            await queryParams(
                `DELETE FROM banned_ips WHERE ip = ?`,
                [targetIp]
            );

            return interaction.reply({
                content: `✅ **Đã gỡ cấm IP \`${targetIp}\` thành công! Người này đã có thể vào lại web.**`,
                ephemeral: true
            });
        } catch (err) {
            console.error("[BUTTON unbanip] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi khi gỡ cấm IP: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
