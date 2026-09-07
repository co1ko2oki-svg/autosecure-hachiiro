const { TextInputStyle } = require("discord.js");
const modalBuilder = require("../../utils/modalBuilder");
const config = require("../../../config.json");

module.exports = {
    name: "changeprefix",
    editsettings: true,
    callback: async (client, interaction) => {
        try {
            const settings = await client.queryParams(
                `SELECT prefix FROM autosecure WHERE user_id=?`,
                [client.username]
            );

            const currentPrefix = settings[0]?.prefix || config.prefix || "HachiiroMC";

            return interaction.showModal(
                modalBuilder("changeprefixmodal", "Change Email & Alias Prefix", [
                    {
                        setCustomId: "prefix",
                        setMaxLength: 30,
                        setMinLength: 1,
                        setRequired: true,
                        setLabel: "Security Email & Alias Prefix",
                        setPlaceholder: "Ex: HachiiroMC, VinGroup, etc.",
                        setStyle: TextInputStyle.Short,
                        setValue: currentPrefix
                    }
                ])
            );
        } catch (err) {
            console.error("[CHANGEPREFIX_BUTTON] Error:", err);
            return interaction.reply({ content: `❌ Error: ${err.message}`, ephemeral: true });
        }
    }
};
