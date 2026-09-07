const { queryParams } = require('../../../db/database');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const clicolor = require("cli-color");
const isblacklisted = require('../../../db/blacklist');
const access = require('../../../db/access');
const isOwner = require('../../../db/isOwner');
const userpermissions = require('../../../autosecure/utils/embeds/userpermissions');
const config = require('../../../config.json');

let cachedUserPerms = null;

module.exports = async (client, interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  // Check blacklist first
  if (await checkBlacklist(interaction)) return;

  try {
    if (!cachedUserPerms) {
      const perms = await userpermissions();
      cachedUserPerms = perms[0];
    }
    const userperms = cachedUserPerms;

    let modal = client.modals.find((m) => m.name === interaction.customId.split("|")[0]);
    
    // Handle action modals
    if (interaction.customId.split("|")[0] === "action") {
      let action = await queryParams(`SELECT * FROM actions WHERE id=?`, [
        interaction.customId.split("|")[1],
      ]);
      
      if (action.length === 0) {
        return interaction.reply({
          embeds: [
            {
              title: `Error :x:`,
              description: `Please try again later!`,
              color: 0xff0000,
            },
          ],
          ephemeral: true,
        });
      }
      
      interaction.customId = action[0].action;
      modal = client.modals.find((m) => m.name === interaction.customId.split("|")[0]);
    }

    if (!modal) return;

    // Owner-only check
    if (modal.ownerOnly) {
      const isUserOwner = await isOwner(interaction.user.id);
      if (!isUserOwner) {
        return interaction.reply({ 
          content: "Invalid permissions!", 
          ephemeral: true 
        });
      }
    }

    // Evaluate user access once to save DB queries
    let userHasAccess = null;
    const checkAccess = async () => {
      if (userHasAccess === null) userHasAccess = await access(interaction.user.id);
      return userHasAccess;
    };

    // User-only check
    if (modal.userOnly) {
      if (!(await checkAccess())) {
        const embed = new EmbedBuilder()
          .setColor('#d22b2b')
          .setDescription(`### You do not have an active license\n\nIf you wish to purchase a subscription, you can purchase a 30d key from [here](${config.shoplink}) and use \`/redeem\` to redeem it.`);

        const button = new ButtonBuilder()
          .setLabel('Buy license')
          .setStyle(ButtonStyle.Link)
          .setURL(config.shoplink);

        const button2 = new ButtonBuilder()
          .setLabel('Join Server')
          .setCustomId('joinserver')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button, button2);

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }
    }

    // Permission checks
    for (const [permKey, { permission: dbColumn, description }] of Object.entries(userperms)) {
      if (modal[permKey] && !(await checkAccess())) {
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
              .setTitle("This modal is only for managing your own bots, and you don't have access!\n(anymore)")
              .setColor('#d22b2b')
          ],
          components: [row],
          ephemeral: true
        });
      }
    }

    // Log and execute modal
    console.log(`${modal.name}|${interaction.user.username}|Modal|${interaction.customId}|${new Date().toISOString()}`);
    
    // EXECUTE MODAL CALLBACK
    await modal.callback(client, interaction);

  } catch (e) {
    console.error('Error in modal handler:', e);
    if (e.code === 10062) return;
    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('Failed to send error response to user:', err.message);
    }
  }
};

async function checkBlacklist(interaction) {
  const blacklisted = await isblacklisted(interaction.user.id);
  
  if (blacklisted.blacklisted) {
    const embed = new EmbedBuilder()
      .setColor('#d22b2b')
      .setDescription(`### You're blacklisted from using Autosecure\n\n Reason: ${blacklisted.reason}`);
    
    try {
      await interaction.reply({ 
        embeds: [embed], 
        ephemeral: true 
      });
    } catch (err) {}
    return true;
  }
  return false;
}