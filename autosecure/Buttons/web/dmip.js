module.exports = {
    name: "dmip",
    callback: async (client, interaction) => {
        try {
            const [action, targetIp] = interaction.customId.split("|");
            return interaction.reply({
                content: `💬 Người dùng này đang thao tác trên trình duyệt Web (\`${targetIp || 'Web'}\`), không có tài khoản Discord trong server nên không thể gửi DM trực tiếp.`,
                ephemeral: true
            });
        } catch (err) {
            console.error("[BUTTON dmip] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
