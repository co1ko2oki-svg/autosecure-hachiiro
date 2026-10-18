module.exports = {
  name: "lunarcosmetics",
  ownerOnly: true,
  callback: async (client, interaction) => {
    const method = (interaction.deferred || interaction.replied) ? 'editReply' : 'reply';
    return interaction[method]({
      content: "Tính năng kiểm tra Lunar cosmetics đã được tắt.",
      ephemeral: true
    }).catch(() => {});
  }
};
