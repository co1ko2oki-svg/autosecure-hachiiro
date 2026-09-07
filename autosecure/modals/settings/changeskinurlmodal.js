module.exports = {
    name: "changeskinurlmodal",
    userOnly: true,
    callback: async (client, interaction) => {
        return interaction.reply({
            content: "❌ Tính năng đổi skin đã bị tắt và gỡ bỏ.",
            ephemeral: true
        });
    }
};
