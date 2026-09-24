const getLocalCmds = require('../../utils/utils/getLocalCmds');
const { join } = require('path');
const { queryParams } = require('../../../db/database');
const cliColor = require('cli-color');
const isblacklisted = require('../../../db/blacklist');
const isOwner = require("../../../db/isOwner");
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const userpermissions = require('../../utils/embeds/userpermissions');
const config = require('../../../config.json');
const access = require('../../../db/access');

let cachedCommands = null;
let cachedUserPerms = null;

module.exports = async (client, interaction) => {
    if (!cachedCommands) {
        cachedCommands = getLocalCmds(join(__dirname, "..", "..", "Commands"));
    }
    if (!cachedUserPerms) {
        const perms = await userpermissions();
        cachedUserPerms = perms[0];
    }
    
    const localCommands = cachedCommands;
    const userperms = cachedUserPerms;

    try {
        const cmdObj = localCommands.find((cmd) => cmd.name === interaction.commandName);
        if (!cmdObj) return;

        if (interaction.isAutocomplete()) {
            const blacklisted = await isblacklisted(interaction.user.id);
            if (blacklisted.blacklisted) {
                return interaction.respond([{ name: "You're blacklisted from VinGr0ups3cur3!", value: "blacklisted" }]);
            }
            if (cmdObj.ownerOnly && !(await isOwner(interaction.user.id))) {
                return interaction.respond([]);
            }
            if (cmdObj.autocomplete) {
                await cmdObj.autocomplete(client, interaction);
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            // Check if user is blacklisted
            const blacklisted = await checkBlacklist(interaction);
            if (blacklisted) return;

            // Check owner permissions
            if (cmdObj.ownerOnly) {
                if (!await isOwner(interaction.user.id)) {
                    return interaction.reply({
                        content: `Only owner access.`,
                        ephemeral: true
                    });
                }
            }

            // Evaluate user access once to save DB queries
            let userHasAccess = null;
            const checkAccess = async () => {
                if (interaction.user.id === client.username) return true;
                if (userHasAccess === null) userHasAccess = await access(interaction.user.id);
                return userHasAccess;
            };

            // Check user permissions from userperms
            for (const [cmdProp, { permission: dbPermission, description }] of Object.entries(userperms)) {
                if (cmdObj[cmdProp] && !(await checkAccess())) {
                    const button1 = new ButtonBuilder()
                        .setLabel('Buy license')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.shoplink);

                    const button2 = new ButtonBuilder()
                        .setLabel('Join Server')
                        .setCustomId('joinserver')
                        .setStyle(ButtonStyle.Primary);

                    const row = new ActionRowBuilder().addComponents(button1, button2);

                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("This command is only for managing your own bots, and you don't have access!\n(anymore)")
                                .setColor('#d22b2b')
                        ],
                        components: [row],
                        ephemeral: true
                    });
                }
            }

            // Check bot owner permissions
            if (cmdObj.botowneronly && !(await checkAccess())) {
                const button1 = new ButtonBuilder()
                    .setLabel('Buy license')
                    .setStyle(ButtonStyle.Link)
                    .setURL(config.shoplink);

                const button2 = new ButtonBuilder()
                    .setLabel('Join Server')
                    .setCustomId('joinserver')
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder().addComponents(button1, button2);

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("This command is only for managing your own bots, and you don't have access!")
                            .setColor('#d22b2b')
                    ],
                    components: [row],
                    ephemeral: true
                });
            }

            // Check mail permissions
            if (cmdObj.mail) {
                if (!(await checkAccess())) {
                    let users = await queryParams(`SELECT * FROM users WHERE child=?`, [interaction.user.id]);
                    if (users.length === 0) {
                        return interaction.reply({ 
                            content: `You don't have access to mails! (no license / user of a bot)`, 
                            ephemeral: true 
                        });
                    }
                }
            }

            // Check user-only permissions
            if (cmdObj.userOnly) {
                if (!(await checkAccess())) {
                    const embed = new EmbedBuilder()
                        .setColor('#d22b2b')
                        .setDescription(`### You do not have an active license\n\nIf you wish to purchase a subscription, you can purchase a 30d key from [here](${config.shoplink}) and use \`/redeem\` to redeem it.`);

                    const button1 = new ButtonBuilder()
                        .setLabel('Buy license')
                        .setStyle(ButtonStyle.Link)
                        .setURL(config.shoplink);
    
                    const button2 = new ButtonBuilder()
                        .setLabel('Join Server')
                        .setCustomId('joinserver')
                        .setStyle(ButtonStyle.Primary);
    
                    const row = new ActionRowBuilder().addComponents(button1, button2);

                    return interaction.reply({
                        embeds: [embed],
                        components: [row],
                        ephemeral: true
                    });
                }
            }

            console.log(`/${cliColor.yellow(cmdObj.name)} ${interaction.user.username} ${new Date().toISOString()}`);

            if (cmdObj.execute) {
                await cmdObj.execute(client, interaction);
            } else if (cmdObj.callback) {
                await cmdObj.callback(client, interaction);
            }
        }
    } catch (e) {
        console.error(`Error executing ${interaction.commandName}:`, e);
        if (e.code === 10062) return;
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                });
            }
        } catch (err) {}
    }
};

async function checkBlacklist(interaction) {
    const blacklisted = await isblacklisted(interaction.user.id);
    if (blacklisted.blacklisted) {
        const embed = new EmbedBuilder()
            .setColor('#d22b2b')
            .setDescription(`### You're blacklisted from using VinGr0ups3cur3\n\n Reason: ${blacklisted.reason}`);
        
        try {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {}
        return true;
    }
    return false;
}
