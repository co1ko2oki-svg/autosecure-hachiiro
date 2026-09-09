const { queryParams } = require("../../../db/database");

module.exports = {
    name: "kickip",
    callback: async (client, interaction) => {
        try {
            const [action, targetIp] = interaction.customId.split("|");
            if (!targetIp) {
                return interaction.reply({ content: "❌ Không tìm thấy địa chỉ IP cần Kick.", ephemeral: true });
            }

            const kicker = `${interaction.user.tag} (${interaction.user.id})`;
            await queryParams(
                `INSERT OR REPLACE INTO banned_ips (ip, reason, banned_by, banned_at) VALUES (?, ?, ?, ?)`,
                [targetIp, "Kicked/Blocked via Discord Button", kicker, Date.now()]
            );

            return interaction.reply({
                content: `👢 **Đã ngắt kết nối (Kick) IP \`${targetIp}\` khỏi phiên thanh toán!**`,
                ephemeral: true
            });
        } catch (err) {
            console.error("[BUTTON kickip] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi khi kick IP: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
