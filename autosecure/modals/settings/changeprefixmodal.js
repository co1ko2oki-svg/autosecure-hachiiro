const listSettings = require('../../utils/settings/listSettings');
const config = require('../../../config.json');

module.exports = {
    name: "changeprefixmodal",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            const rawPrefix = interaction.fields.getTextInputValue('prefix') || "";
            const cleanPrefix = rawPrefix.trim().replace(/[^a-zA-Z0-9_-]/g, "");
            const finalPrefix = cleanPrefix || config.prefix || "HachiiroMC";

            await client.queryParams(
                `UPDATE autosecure SET prefix = ? WHERE user_id = ?`,
                [finalPrefix, client.username]
            );

            const msg = await listSettings(client, client.username, true);
            msg.content = `✅ Email & Alias Prefix updated to: \`${finalPrefix}\``;

            return await interaction.update(msg);
        } catch (error) {
            console.error("[CHANGEPREFIX_MODAL] Error:", error);
            if (!interaction.replied && !interaction.deferred) {
                return await interaction.reply({
                    content: `❌ Error updating prefix: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
};
