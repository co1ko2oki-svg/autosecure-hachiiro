const editautosecuremsg = require("../../../autosecure/utils/embeds/editautosecuremsg");
const { queryParams } = require("../../../db/database");
const config = require("../../../config.json");

module.exports = {
    name: "modalchangeprefix",
    editautosecure: true,
    callback: async (client, interaction) => {
        try {
            const rawPrefix = interaction.fields.getTextInputValue("prefix") || "";
            const cleanPrefix = rawPrefix.trim().replace(/[^a-zA-Z0-9_-]/g, "");
            const finalPrefix = cleanPrefix || config.prefix || "HachiiroMC";
            const [t, botnumber, ownerid] = interaction.customId.split("|");

            await queryParams(
                "UPDATE autosecure SET prefix = ? WHERE user_id = ? AND botnumber = ?",
                [finalPrefix, ownerid, botnumber]
            );

            const msg = await editautosecuremsg(botnumber, ownerid);
            msg.content = `✅ Email & Alias Prefix updated to: \`${finalPrefix}\``;

            return await interaction.update(msg);
        } catch (error) {
            console.error("Error in modalchangeprefix command:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "An error occurred while saving prefix.",
                    ephemeral: true
                });
            }
        }
    }
};
