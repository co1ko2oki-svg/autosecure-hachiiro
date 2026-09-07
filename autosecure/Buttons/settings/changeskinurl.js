module.exports = {
    name: "changeskinurl",
    editsettings: true,
    callback: async (client, interaction) => {
        return interaction.reply({
            content: "❌ Tính năng đổi skin đã bị tắt và gỡ bỏ.",
            ephemeral: true
        });
    }
};
