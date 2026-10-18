const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { bancheck } = require('./bancheck');
const { queryParams } = require('../../../db/database');
const generate = require('../generate');

function formatStatusField(result, serverName) {
  if (!result) {
    return {
      status: '⚪ **Not Checked**',
      details: 'Check was skipped.'
    };
  }

  if (result.banReason === 'invalid_token') {
    return {
      status: '❌ **Invalid SSID**',
      details: 'SSID is invalid or has expired.'
    };
  }

  if (result.status === 'ERROR' || result.status === 'UNKNOWN') {
    return {
      status: '🟡 **Check Failed**',
      details: `\`${result.banReason || 'Unable to check (connection/proxy error)'}\``
    };
  }

  if (typeof result.ban === 'string' && result.ban.startsWith("Couldn't check ban:")) {
    return {
      status: '🟡 **Check Failed**',
      details: `\`${result.banReason || 'Unknown error'}\``
    };
  }

  if (result.ban === true) {
    let details = `• **Reason:** \`${result.banReason || 'Unknown'}\``;
    if (result.banId) {
      details += `\n• **Ban ID:** \`${result.banId.toUpperCase()}\``;
    }
    if (result.unbanTime) {
      details += `\n• **Duration:** ${result.unbanTime === 'never' ? '🔒 **Permanent**' : `<t:${Math.floor(result.unbanTime)}:R>`}`;
    }
    return {
      status: '🔴 **Banned**',
      details
    };
  }

  if (result.ban === false) {
    return {
      status: '🟢 **Unbanned**',
      details: `Account can join ${serverName}`
    };
  }

  return {
    status: '🟡 **Unknown**',
    details: `\`${result.banReason || 'Unable to determine'}\``
  };
}

module.exports = async function bancheckmsg(ssid, targetServer = 'both') {
  if (!ssid || ssid.length < 8) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌ Invalid Input')
          .setDescription('Please provide a valid SSID (minimum 8 characters).')
          .setFooter({ text: 'Ban Checker • VinGr0ups3cur3' })
          .setTimestamp()
      ],
      components: []
    };
  }

  const result = await bancheck(ssid, targetServer);
  const username = result.username || 'Unknown Account';
  const avatarUrl = username !== 'Unknown Account' 
    ? `https://visage.surgeplay.com/bust/${encodeURIComponent(username)}.png?y=-40`
    : null;

  if (result.banReason === 'invalid_token') {
    const invalidEmbed = new EmbedBuilder()
      .setColor(0xff4757)
      .setTitle('❌ Invalid SSID')
      .setDescription('The provided SSID is invalid or has expired.')
      .addFields({
        name: '💡 What to do?',
        value: '• Make sure the SSID is correct\n• Check if the SSID is still valid\n• Try generating a new SSID',
        inline: false
      })
      .setFooter({ text: 'Ban Checker • VinGr0ups3cur3' })
      .setTimestamp();

    if (avatarUrl) invalidEmbed.setThumbnail(avatarUrl);

    return {
      embeds: [invalidEmbed],
      components: []
    };
  }

  let components = [];
  const actionRow = new ActionRowBuilder();

  if (targetServer === 'both' || targetServer === 'all') {
    const hpx = result.hypixel;
    const donut = result.donut;
    const mcpvp = result.mcpvp;

    const isAnyBanned = hpx?.ban === true || donut?.ban === true || mcpvp?.ban === true;
    const isAllClean = hpx?.ban === false && donut?.ban === false && mcpvp?.ban === false;

    const embedColor = isAnyBanned ? 0xff4757 : (isAllClean ? 0x2ed573 : 0xffa502);

    const hpxFormatted = formatStatusField(hpx, 'Hypixel');
    const donutFormatted = formatStatusField(donut, 'DonutSMP');
    const mcpvpFormatted = formatStatusField(mcpvp, 'MCPVP');

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Ban Status Check • ${username}`)
      .setColor(embedColor)
      .setDescription(`Detailed ban check results across **Hypixel**, **DonutSMP**, and **MCPVP**.`)
      .addFields(
        {
          name: `👤 Account`,
          value: `**Username:** \`${username}\`\n**UUID:** \`${result.uuid || 'Unknown'}\``,
          inline: false
        },
        {
          name: `⚔️ Hypixel (${hpxFormatted.status})`,
          value: hpxFormatted.details,
          inline: true
        },
        {
          name: `🍩 DonutSMP (${donutFormatted.status})`,
          value: donutFormatted.details,
          inline: true
        },
        {
          name: `🛡️ MCPVP (${mcpvpFormatted.status})`,
          value: mcpvpFormatted.details,
          inline: true
        }
      )
      .setFooter({ text: `Checked for ${username} • VinGr0ups3cur3 Bancheck` })
      .setTimestamp();

    if (avatarUrl) embed.setThumbnail(avatarUrl);

    const actionId = generate(32);
    try {
      await queryParams(
        `INSERT INTO actions (id, action) VALUES (?, ?)`,
        [actionId, `checkbanmc|${ssid}`]
      );
    } catch (e) {
      console.error('[BANCHECK_MSG] Error storing checkban action:', e.message);
    }

    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`checkbanmc|${actionId}|both`)
        .setLabel('Refresh All')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`checkbanmc|${actionId}|hypixel`)
        .setLabel('Hypixel')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`checkbanmc|${actionId}|donut`)
        .setLabel('DonutSMP')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`checkbanmc|${actionId}|mcpvp`)
        .setLabel('MCPVP')
        .setStyle(ButtonStyle.Primary)
    );

    // If Hypixel perm banned, add appeal button
    if (hpx?.ban === true && hpx?.unbanTime === 'never') {
      try {
        const id = generate(32);
        await queryParams(
          `INSERT INTO actions (id, action) VALUES (?, ?)`,
          [id, `appeal|${ssid}`]
        );

        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal|${id}`)
            .setLabel('Appeal Hypixel Ban')
            .setStyle(ButtonStyle.Danger)
        );
      } catch (e) {
        console.error('[BANCHECK_MSG] Error generating appeal action:', e.message);
      }
    }

    components = [actionRow];

    return {
      embeds: [embed],
      components
    };
  }

  // Single server check (hypixel, donut, or mcpvp)
  let serverName = 'Hypixel';
  let serverEmoji = '⚔️';
  if (targetServer === 'donut') {
    serverName = 'DonutSMP';
    serverEmoji = '🍩';
  } else if (targetServer === 'mcpvp') {
    serverName = 'MCPVP';
    serverEmoji = '🛡️';
  }

  const embed = new EmbedBuilder()
    .setTitle(`${serverEmoji} ${serverName} Ban Status • ${username}`)
    .setFooter({ text: `Checked for ${username} • VinGr0ups3cur3` })
    .setTimestamp();

  if (avatarUrl) embed.setThumbnail(avatarUrl);

  if (result.status === 'ERROR' || result.status === 'UNKNOWN') {
    embed.setColor(0xffa502)
      .setTitle(`⚠️ ${serverName} Check Failed`)
      .setDescription(`Unable to check ban status on **${serverName}**: \`${result.banReason || 'Unknown error'}\``)
      .addFields({
        name: '🔄 Try Again',
        value: 'The server or proxy might be temporarily unavailable. Please try again in a few moments.',
        inline: false
      });
  } else if (typeof result.ban === 'string' && result.ban.startsWith("Couldn't check ban:")) {
    embed.setColor(0xffa502)
      .setTitle(`⚠️ ${serverName} Check Failed`)
      .setDescription(`Unable to check ban status on **${serverName}**: \`${result.banReason || 'Unknown error'}\``)
      .addFields({
        name: '🔄 Try Again',
        value: 'The server or proxy might be temporarily unavailable. Please try again in a few moments.',
        inline: false
      });
  } else if (result.ban === true) {
    embed.setColor(0xff4757)
      .setTitle(`🚫 Account Banned on ${serverName}`)
      .setDescription(`**${username}** is currently banned on **${serverName}**`)
      .addFields(
        {
          name: '👤 Username',
          value: `\`${username}\``,
          inline: true
        },
        {
          name: '📊 Status',
          value: '🔴 **Banned**',
          inline: true
        },
        {
          name: '📝 Reason',
          value: `\`${result.banReason || 'Unknown'}\``,
          inline: true
        }
      );

    if (result.banId) {
      embed.addFields({
        name: '🆔 Ban ID',
        value: `\`${result.banId.toUpperCase()}\``,
        inline: true
      });
    }

    if (result.unbanTime) {
      embed.addFields({
        name: '⏰ Unban Time',
        value: result.unbanTime === 'never' ? '🔒 **Permanent**' : `<t:${Math.floor(result.unbanTime)}:R>`,
        inline: true
      });
    }

    embed.addFields({
      name: 'ℹ️ Additional Info',
      value: `This account cannot join ${serverName} until the ban expires or is appealed.`,
      inline: false
    });

    if (targetServer === 'hypixel' && result.unbanTime === 'never') {
      try {
        const id = generate(32);
        await queryParams(
          `INSERT INTO actions (id, action) VALUES (?, ?)`,
          [id, `appeal|${ssid}`]
        );

        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal|${id}`)
            .setLabel('📝 Appeal Ban')
            .setStyle(ButtonStyle.Danger)
        );
      } catch (e) {
        console.error('[BANCHECK_MSG] Error generating appeal action:', e.message);
      }
    }
  } else if (result.ban === false) {
    embed.setColor(0x2ed573)
      .setTitle(`✅ Account Clean on ${serverName}`)
      .setDescription(`**${username}** is not banned on **${serverName}**`)
      .addFields(
        {
          name: '👤 Username',
          value: `\`${username}\``,
          inline: true
        },
        {
          name: '📊 Status',
          value: '🟢 **Unbanned**',
          inline: true
        },
        {
          name: '🎮 Access',
          value: `This account can join ${serverName}`,
          inline: true
        }
      );
  } else {
    embed.setColor(0x747d8c)
      .setTitle(`❓ Status Unknown on ${serverName}`)
      .setDescription(`Unable to determine the ban status for **${username}** on **${serverName}**`)
      .addFields(
        {
          name: '👤 Username',
          value: `\`${username}\``,
          inline: true
        },
        {
          name: '📊 Status',
          value: '🟡 **Unknown**',
          inline: true
        }
      );
  }

  const singleActionId = generate(32);
  try {
    await queryParams(
      `INSERT INTO actions (id, action) VALUES (?, ?)`,
      [singleActionId, `checkbanmc|${ssid}`]
    );
  } catch (e) {
    console.error('[BANCHECK_MSG] Error storing checkban action:', e.message);
  }

  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`checkbanmc|${singleActionId}|both`)
      .setLabel('Check All Servers')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`checkbanmc|${singleActionId}|hypixel`)
      .setLabel('Hypixel')
      .setStyle(targetServer === 'hypixel' ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`checkbanmc|${singleActionId}|donut`)
      .setLabel('DonutSMP')
      .setStyle(targetServer === 'donut' ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`checkbanmc|${singleActionId}|mcpvp`)
      .setLabel('MCPVP')
      .setStyle(targetServer === 'mcpvp' ? ButtonStyle.Secondary : ButtonStyle.Primary)
  );

  components = [actionRow];

  return {
    embeds: [embed],
    components
  };
};
