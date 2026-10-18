module.exports = {
  name: "labymod",
  ownerOnly: true,
  callback: async (client, interaction) => {
    const method = (interaction.deferred || interaction.replied) ? 'editReply' : 'reply';
    return interaction[method]({
      content: "Tính năng kiểm tra LabyMod cosmetics đã được tắt.",
      ephemeral: true
    }).catch(() => {});
  }
};
