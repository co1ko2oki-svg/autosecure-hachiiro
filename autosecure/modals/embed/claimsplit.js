module.exports = {
    name: "claimsplitmodal",
    callback: async (client, interaction) => {
        try {
            await interaction.reply({ content: "Claim handled.", ephemeral: true });
        } catch (error) {
        }
    }
};