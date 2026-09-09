const { queryParams } = require("../../../db/database");

module.exports = {
    name: "unbanip",
    callback: async (client, interaction) => {
        try {
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
