const { queryParams } = require("../../../db/database");

module.exports = {
    name: "unblacklistip",
    callback: async (client, interaction) => {
        try {
            const [action, targetIp] = interaction.customId.split("|");
            if (!targetIp) {
                return interaction.reply({ content: "❌ Không tìm thấy địa chỉ IP cần gỡ Blacklist.", ephemeral: true });
            }

            await queryParams(
                `DELETE FROM banned_ips WHERE ip = ?`,
                [targetIp]
            );

            return interaction.reply({
                content: `🔓 **Đã gỡ IP \`${targetIp}\` khỏi Blacklist thành công!**`,
                ephemeral: true
            });
        } catch (err) {
            console.error("[BUTTON unblacklistip] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi khi gỡ blacklist IP: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
