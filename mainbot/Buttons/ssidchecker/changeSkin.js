module.exports = {
    name: "changeskin",
    callback: async (client, interaction) => {
        return interaction.reply({
            content: "❌ Tính năng đổi skin đã bị tắt và gỡ bỏ.",
            ephemeral: true
        });
    }
};