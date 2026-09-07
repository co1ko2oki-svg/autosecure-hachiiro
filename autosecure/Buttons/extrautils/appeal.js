const { ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const appealmsg2 = require('../../utils/bancheckappeal/appealmsg2');
const { queryParams } = require('../../../db/database');

module.exports = {
    name: "appeal",
    userOnly: true,
    callback: async (client, interaction) => {
        const [t, actionIdOrSsid] = (interaction.customId || "").split("|");
        
        let ssid = actionIdOrSsid;
        if (actionIdOrSsid && actionIdOrSsid.length === 32) {
            try {
                const actions = await queryParams('SELECT action FROM actions WHERE id = ?', [actionIdOrSsid]);
                if (actions && actions.length > 0) {
                    const parts = actions[0].action.split('|');
                    if (parts[0] === 'appeal' && parts[1]) {
                        ssid = parts[1];
                    }
                }
            } catch (dbErr) {
                console.error('[APPEAL] Error fetching action from DB:', dbErr.message);
            }
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
            const msg = await appealmsg2(interaction.user.id, ssid);
            await interaction.editReply(msg);
        } catch (err) {
            console.error(err);
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Error. Report this as ID: appeal1")
                        .setColor("Red")
                ],
                ephemeral: true
            });
        } 
    },
};