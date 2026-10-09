module.exports = {
    name: "copycode",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            const parts = interaction.customId.split("|");
            const code = parts[1] || "";

            if (!code) {
                return interaction.reply({
                    content: "No 2FA code found to copy.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: code,
                ephemeral: true
            });
        } catch (error) {
            console.error("Error in copycode button:", error);
            return interaction.reply({
                content: "Failed to copy code.",
                ephemeral: true
            });
        }
    }
};
