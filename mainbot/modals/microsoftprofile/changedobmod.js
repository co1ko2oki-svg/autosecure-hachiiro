module.exports = {
  name: "changedobmodal",
  editphisher: true,
  callback: async (client, interaction) => {
    try {
      await interaction.reply({ content: "Date of birth change handled.", ephemeral: true });
    } catch (error) {
    }
  }
};