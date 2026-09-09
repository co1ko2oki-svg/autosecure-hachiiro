const { queryParams } = require("../../../db/database");

module.exports = {
    name: "blacklistip",
    callback: async (client, interaction) => {
        try {
            const [action, targetIp] = interaction.customId.split("|");
            if (!targetIp) {
                return interaction.reply({ content: "❌ Không tìm thấy địa chỉ IP cần Blacklist.", ephemeral: true });
            }

            const blacklister = `${interaction.user.tag} (${interaction.user.id})`;
            await queryParams(
                `INSERT OR REPLACE INTO banned_ips (ip, reason, banned_by, banned_at) VALUES (?, ?, ?, ?)`,
                [targetIp, "Blacklisted via Discord Button", blacklister, Date.now()]
            );

            return interaction.reply({
                content: `⛔ **Đã đưa IP \`${targetIp}\` vào Blacklist (Danh sách đen)!**`,
                ephemeral: true
            });
        } catch (err) {
            console.error("[BUTTON blacklistip] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi khi blacklist IP: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
