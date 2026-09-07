const getAliases = require("./getAliases");
const decode = require("./decode");
const {
  isSameEmail,
  normalizeEmail,
  generateCorrelationId,
  logAliasEvent,
  ALIAS_STATES,
  MUTATION_RESULTS,
  ERROR_CODES,
  AppError,
  classifyError,
  accountOperationLock,
  accountStateManager
} = require("./aliasHelper");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sets the specified alias as primary using the authoritative 4-phase state machine:
 * 1. BEFORE: Read all aliases, identify currentPrimary, secondaryAliases, targetAlias.
 * 2. VALIDATION: Confirm targetAlias exists and is eligible; idempotent if already primary.
 * 3. CHANGE PRIMARY: Request Microsoft MakePrimary with Canary token.
 * 4. AFTER: Refetch authoritative server state, compare expected vs actual primary.
 *    If mismatch -> FAILED.
 * 
 * Guarantees:
 * - Serialized per account via accountOperationLock.
 * - Server is the sole Source of Truth.
 * - Never assumes MakePrimary HTTP 200 == primary actually changed.
 * 
 * @param {object} axios - HttpClient instance
 * @param {string} alias - Alias email to set as primary
 * @param {string} [apicanary] - API canary token
 * @param {number} [maxRetries=2] - Max retries
 * @param {string} [correlationId] - Tracing ID
 * @param {boolean} [removeOldPrimary=false] - Request Microsoft to atomically remove old primary
 * @param {string} [accountId] - Unique identifier for the account
 * @returns {Promise<boolean>}
 */
async function makePrimary(
  axios,
  alias,
  apicanary = null,
  maxRetries = 2,
  correlationId = null,
  removeOldPrimary = false,
  accountId = null
) {
  const reqId = correlationId || generateCorrelationId();
  const targetAlias = normalizeEmail(alias);
  const lockKey = accountId || targetAlias || "global_account";

  if (!axios || !targetAlias) {
    logAliasEvent("MAKE_PRIMARY", { requestId: reqId, status: "INVALID_ARGUMENTS" });
    return false;
  }

  return await accountOperationLock.withLock(lockKey, async () => {
    logAliasEvent("MAKE_PRIMARY", {
      requestId: reqId,
      step: "BEFORE_READ",
      status: "STARTED",
      targetAlias
    });

    // -------------------------------------------------------------
    // PHASE 1: BEFORE - Authoritative State Read
    // -------------------------------------------------------------
    accountStateManager.takeSnapshot(lockKey);
    let beforeState = await getAliases(axios);

    const currentPrimary = normalizeEmail(beforeState?.primary);
    const allAliases = (beforeState?.aliases || []).map(normalizeEmail);

    // Prefer the freshly-fetched authoritative canary (already decoded by getAliases)
    // over the caller-supplied token, which may be STALE after a prior mutation
    // (e.g. addAlias) rotated the server token. Caller tokens are decoded exactly
    // once and used only as a last-resort fallback.
    let currentCanary =
      beforeState?.apiCanary ||
      beforeState?.canary ||
      (apicanary ? decode(apicanary) : null);

    logAliasEvent("MAKE_PRIMARY", {
      requestId: reqId,
      step: "BEFORE_READ",
      status: "COMPLETED",
      currentPrimary,
      totalAliases: allAliases.length
    });

    // -------------------------------------------------------------
    // PHASE 2: VALIDATION
    // -------------------------------------------------------------
    // Idempotent: If target is ALREADY primary on server, immediate confirmed success
    if (currentPrimary && isSameEmail(currentPrimary, targetAlias)) {
      logAliasEvent("MAKE_PRIMARY", {
        requestId: reqId,
        step: "VALIDATION",
        status: "IDEMPOTENT_SUCCESS",
        targetAlias
      });
      accountStateManager.applyVerifiedState(lockKey, {
        primaryEmail: targetAlias,
        aliases: allAliases
      });
      accountStateManager.commit(lockKey);
      return true;
    }

    // Target must exist on account
    const targetExists = allAliases.some((a) => isSameEmail(a, targetAlias));
    if (!targetExists) {
      logAliasEvent("MAKE_PRIMARY", {
        requestId: reqId,
        step: "VALIDATION",
        status: "FAILED",
        errorCode: ERROR_CODES.NOT_FOUND,
        message: `Target alias ${targetAlias} not found on account`
      });
      accountStateManager.rollback(lockKey);
      return false;
    }

    // -------------------------------------------------------------
    // PHASE 3: CHANGE PRIMARY - Request Mutation with Bounded Retries
    // -------------------------------------------------------------
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      logAliasEvent("MAKE_PRIMARY", {
        requestId: reqId,
        step: "CHANGE_PRIMARY_REQUEST",
        status: "REQUEST_ACCEPTED",
        attempt: attempt + 1,
        targetAlias
      });

      try {
        const response = await axios.post(
          "https://account.live.com/API/MakePrimary",
          {
            aliasName: targetAlias,
            emailChecked: true,
            removeOldPrimary: !!removeOldPrimary
          },
          {
            headers: {
              canary: currentCanary || "",
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              Referer: "https://account.live.com/names/Manage",
              Origin: "https://account.live.com",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "application/json, text/plain, */*"
            },
            validateStatus: (status) => status >= 200 && status < 500
          }
        );

        const resData = response?.data;
        const msErrorCode = resData?.error?.code || resData?.errorCode;

        if (msErrorCode === "1282") {
          logAliasEvent("MAKE_PRIMARY", {
            requestId: reqId,
            step: "CHANGE_PRIMARY_REQUEST",
            status: "FAILED",
            errorCode: ERROR_CODES.RATE_LIMITED
          });
          accountStateManager.rollback(lockKey);
          return false;
        }

        // Target missing on server (or otherwise ineligible) -> abort immediately
        if (
          msErrorCode === "AliasNotFound" ||
          msErrorCode === "AliasNotExists" ||
          msErrorCode === "CannotRemovePrimary"
        ) {
          logAliasEvent("MAKE_PRIMARY", {
            requestId: reqId,
            step: "CHANGE_PRIMARY_REQUEST",
            status: "FAILED",
            errorCode: ERROR_CODES.NOT_FOUND,
            message: `Microsoft rejected MakePrimary: ${msErrorCode}`
          });
          accountStateManager.rollback(lockKey);
          return false;
        }

        // Stale/invalid canary, session loss, or explicit logical failure ->
        // refresh the authoritative state and retry on a later attempt.
        if (
          msErrorCode === "InvalidCanary" ||
          msErrorCode === "Unauthorized" ||
          msErrorCode === "SessionExpired" ||
          msErrorCode === "AuthenticationFailure" ||
          (resData && resData.success === false)
        ) {
          logAliasEvent("MAKE_PRIMARY", {
            requestId: reqId,
            step: "CHANGE_PRIMARY_REQUEST",
            status: "NEEDS_RETRY",
            errorCode: ERROR_CODES.AUTH_REQUIRED,
            message: `Retrying with refreshed canary (${msErrorCode || "logical failure"})`
          });

          try {
            const freshState = await getAliases(axios);
            if (freshState?.apiCanary) currentCanary = freshState.apiCanary;
            else if (freshState?.canary) currentCanary = freshState.canary;
            else if (freshState?.formCanary) currentCanary = freshState.formCanary;
          } catch (_) {}

          if (attempt < maxRetries) {
            await sleep(600 * (attempt + 1));
            continue;
          }
        }

        // -------------------------------------------------------------
        // PHASE 4: AFTER - Authoritative Server Verification
        // -------------------------------------------------------------
        const checkResult = await getAliases(axios);
        const verifiedPrimary = normalizeEmail(checkResult?.primary);

        if (verifiedPrimary && isSameEmail(verifiedPrimary, targetAlias)) {
          logAliasEvent("MAKE_PRIMARY", {
            requestId: reqId,
            step: "AFTER_VERIFY",
            status: "STATE_VERIFIED",
            message: `Primary alias successfully verified on server: ${targetAlias}`
          });
          accountStateManager.applyVerifiedState(lockKey, {
            primaryEmail: targetAlias,
            aliases: checkResult.aliases
          });
          accountStateManager.commit(lockKey);
          return true;
        }

        // Update canary from refresh if available
        if (checkResult?.apiCanary || checkResult?.canary) {
          currentCanary = checkResult.apiCanary || checkResult.canary;
        }

        // Fallback form-based MakePrimary
        const formCanary = checkResult?.formCanary || checkResult?.canary || currentCanary;
        if (formCanary) {
          try {
            logAliasEvent("MAKE_PRIMARY", {
              requestId: reqId,
              step: "CHANGE_PRIMARY_FALLBACK",
              status: "REQUEST_ACCEPTED"
            });
            const fallbackPost = `canary=${encodeURIComponent(formCanary)}&action=MakePrimary&PostOption=MakePrimary&aliasName=${encodeURIComponent(targetAlias)}&displayName=${encodeURIComponent(targetAlias)}`;
            await axios.post("https://account.live.com/names/Manage", fallbackPost, {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://account.live.com/names/Manage",
                Origin: "https://account.live.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
              },
              maxRedirects: 0,
              validateStatus: (status) => status >= 200 && status < 400
            });

            const fallbackCheck = await getAliases(axios);
            const fallbackPrimary = normalizeEmail(fallbackCheck?.primary);

            if (fallbackPrimary && isSameEmail(fallbackPrimary, targetAlias)) {
              logAliasEvent("MAKE_PRIMARY", {
                requestId: reqId,
                step: "AFTER_VERIFY",
                status: "STATE_VERIFIED",
                message: `Verified via fallback form: ${targetAlias} is primary.`
              });
              accountStateManager.applyVerifiedState(lockKey, {
                primaryEmail: targetAlias,
                aliases: fallbackCheck.aliases
              });
              accountStateManager.commit(lockKey);
              return true;
            }
          } catch (_) {}
        }
      } catch (err) {
        logAliasEvent("MAKE_PRIMARY", {
          requestId: reqId,
          step: "CHANGE_PRIMARY_REQUEST",
          status: "ERROR",
          message: err.message
        });

        if (attempt < maxRetries) {
          await sleep(600 * (attempt + 1));
        }
      }
    }

    // Final Authoritative State Check
    try {
      const finalCheck = await getAliases(axios);
      const finalPrimary = normalizeEmail(finalCheck?.primary);
      if (finalPrimary && isSameEmail(finalPrimary, targetAlias)) {
        accountStateManager.applyVerifiedState(lockKey, {
          primaryEmail: targetAlias,
          aliases: finalCheck.aliases
        });
        accountStateManager.commit(lockKey);
        return true;
      }
    } catch (_) {}

    logAliasEvent("MAKE_PRIMARY", {
      requestId: reqId,
      step: "AFTER_VERIFY",
      status: "FAILED",
      errorCode: ERROR_CODES.STATE_MISMATCH,
      message: `Failed to verify ${targetAlias} as primary on server after all retries.`
    });

    accountStateManager.rollback(lockKey);
    return false;
  });
}

/**
 * Structured setPrimaryAlias returning standard result object:
 * { success, state, primary, previousPrimary, error? }
 */
async function setPrimaryAlias(axios, alias, options = {}) {
  const correlationId = options.correlationId || generateCorrelationId();
  const targetAlias = normalizeEmail(alias);
  const accountId = options.accountId || targetAlias || "unknown_account";
  const canary = options.canary || null;
  const removeOldPrimary = !!options.removeOldPrimary;

  const beforeState = await getAliases(axios);
  const currentPrimary = normalizeEmail(beforeState?.primary);
  const allAliases = (beforeState?.aliases || []).map(normalizeEmail);

  if (currentPrimary && isSameEmail(currentPrimary, targetAlias)) {
    return {
      success: true,
      state: ALIAS_STATES.STATE_VERIFIED || "STATE_VERIFIED",
      primary: targetAlias,
      previousPrimary: currentPrimary
    };
  }

  const targetExists = allAliases.some((a) => isSameEmail(a, targetAlias));
  if (!targetExists) {
    return {
      success: false,
      state: ALIAS_STATES.FAILED || "FAILED",
      primary: currentPrimary,
      previousPrimary: currentPrimary,
      error: "TARGET_ALIAS_NOT_FOUND"
    };
  }

  const ok = await makePrimary(
    axios,
    targetAlias,
    canary || beforeState?.apiCanary,
    2,
    correlationId,
    removeOldPrimary,
    accountId
  );

  const afterState = await getAliases(axios);
  const verifiedPrimary = normalizeEmail(afterState?.primary);

  if (ok && verifiedPrimary && isSameEmail(verifiedPrimary, targetAlias)) {
    return {
      success: true,
      state: ALIAS_STATES.STATE_VERIFIED || "STATE_VERIFIED",
      primary: targetAlias,
      previousPrimary: currentPrimary
    };
  }

  return {
    success: false,
    state: ALIAS_STATES.FAILED || "FAILED",
    primary: verifiedPrimary || currentPrimary,
    previousPrimary: currentPrimary,
    error: ERROR_CODES.STATE_MISMATCH
  };
}

const aliasService = {
  setPrimaryAlias
};

makePrimary.makePrimary = makePrimary;
makePrimary.setPrimaryAlias = setPrimaryAlias;
makePrimary.aliasService = aliasService;

module.exports = makePrimary;
module.exports.makePrimary = makePrimary;
module.exports.setPrimaryAlias = setPrimaryAlias;
module.exports.aliasService = aliasService;

