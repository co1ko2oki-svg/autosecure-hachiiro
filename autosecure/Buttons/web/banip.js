const { queryParams } = require("../../../db/database");

module.exports = {
    name: "banip",
    callback: async (client, interaction) => {
        try {
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
