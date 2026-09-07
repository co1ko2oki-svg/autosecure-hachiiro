module.exports = {
    name: "changeskinautosecure",
    editautosecure: true,
    callback: async (client, interaction) => {
        return interaction.reply({
            content: "❌ Tính năng đổi skin đã bị tắt và gỡ bỏ.",
            ephemeral: true
        });
    }
};
