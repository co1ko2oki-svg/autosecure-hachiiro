const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function createhelppanel() {
  const embed = new EmbedBuilder()
    .setTitle('Autosecure info')
    .setDescription("Select a button below to get more information on Autosecure. If you're still unsure, make a ticket\nCredit: HachiiroMC_O")
    .setColor(13158600);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('starting_bot').setLabel('Autosecure Full Setup Guide').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('securing').setLabel('Securing').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('responses').setLabel('Bot responses').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('emails').setLabel('Emails').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ssidhelp').setLabel('Login with SSID').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('login_msauth').setLabel('Login with MSAUTH').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('secret_key').setLabel('Login with Secret key').setStyle(ButtonStyle.Primary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('seeclaiming2').setLabel('Claiming & users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('soon_guide').setLabel('Soon').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('configbutton').setLabel('Config').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('copyskinhelp').setLabel('Copy Skin').setStyle(ButtonStyle.Primary)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('oauthhelp').setLabel('OAuth').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quarantinehelp').setLabel('Quarantine').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('notreceivingcodes').setLabel('Not Receiving codes').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('multiplayerhelp').setLabel("Couldn't login: null.").setStyle(ButtonStyle.Danger)
  );

  const msg = { embeds: [embed], components: [row1, row2, row3, row4] };
  return msg;
}

module.exports = { createhelppanel };
