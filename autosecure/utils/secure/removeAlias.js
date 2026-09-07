const getAliases = require("./getAliases");
const decode = require("./decode");
const {
  isSameEmail,
  normalizeEmail,
  safeMetadata,
  generateCorrelationId,
  ALIAS_STATES,
  MUTATION_RESULTS,
  ALIAS_ERROR_CODES,
  AliasOperationError,
  maskEmail,
  isAliasOpPending,
  setAliasOpPending,
  clearAliasOpPending,
  logAliasEvent
} = require("./aliasHelper");

/**
 * Removes a secondary alias from the Microsoft account.
 * 
 * Flow & Guarantees:
 * 1. Concurrency Guard: Prevents duplicate/double-click operations on the same alias.
 * 2. Safety Rule: Refuses to remove the primary alias directly (throws ALIAS_IS_PRIMARY).
 * 3. Idempotency: If alias is already absent, returns confirmed success immediately.
 * 4. Strategy 1: Dynamic HTML parsing -> GET confirmation page -> parse hidden inputs + canary -> POST confirmation form.
 * 5. Strategy 2: Modern JSON API (/API/RemoveAlias & /API/DeleteAlias) with business error inspection.
 * 6. Strategy 3: Multi-flavor direct form POST fallback (action=Remove & action=RemoveAlias).
 * 7. Verification: Authoritative server state check via getAliases to guarantee alias is gone.
 * 
 * @param {object} axios - HttpClient instance
 * @param {string} name - Email of alias to remove
 * @param {string} canary - Optional canary token
 * @param {string} amrp - Optional AMRPSSecAuth cookie value
 * @param {string} amsc - Optional amsc cookie value
 * @param {string} correlationId - Optional correlation ID for tracing
 * @returns {Promise<boolean>} - true if alias is confirmed removed / absent, false otherwise
 */
module.exports = async function removeAlias(axios, name, canary = null, amrp = null, amsc = null, correlationId = null) {
  const reqId = correlationId || generateCorrelationId();

  if (!axios || !name || typeof name !== "string") {
    logAliasEvent("ALIAS_REMOVE", {
      requestId: reqId,
      error: "INVALID_ARGUMENTS",
      message: "Missing required axios instance or target alias name"
    });
    return false;
  }

  const targetAlias = normalizeEmail(name);
  if (!targetAlias) {
    logAliasEvent("ALIAS_REMOVE", {
      requestId: reqId,
      error: "INVALID_EMAIL",
      targetAlias: name
    });
    return false;
  }

  // Anti-double-click concurrency mutex
  if (!setAliasOpPending(targetAlias)) {
    logAliasEvent("ALIAS_REMOVE", {
      requestId: reqId,
      targetAlias,
      action: "BLOCKED",
      reason: "Concurrent operation already in progress for this alias"
    });
    return false;
  }

  try {
    if (amrp && amsc && typeof axios.setCookie === "function") {
      axios.setCookie(`AMRPSSecAuth=${amrp}`);
      axios.setCookie(`amsc=${amsc}`);
    }

    // Step 1: Initial authoritative state check
    let aliasInfo = null;
    try {
      aliasInfo = await getAliases(axios);
    } catch (fetchErr) {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        error: "FETCH_STATE_ERROR",
        message: fetchErr.message
      });
      return false;
    }

    // Check for valid authenticated session state
    if (!aliasInfo || (!aliasInfo.primary && (!aliasInfo.aliases || aliasInfo.aliases.length === 0))) {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        error: ALIAS_ERROR_CODES.SESSION_EXPIRED,
        message: "Failed to read authoritative account state (session expired or unreachable)"
      });
      return false;
    }

    const currentPrimary = aliasInfo.primary;
    let currentFormCanary = aliasInfo.formCanary || canary || null;
    let currentApiCanary = aliasInfo.apiCanary || canary || null;

    // Safety Rule: Never remove primary alias directly
    if (currentPrimary && isSameEmail(currentPrimary, targetAlias)) {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        isPrimary: true,
        action: "BLOCKED",
        errorCode: ALIAS_ERROR_CODES.ALIAS_IS_PRIMARY
      });
      throw new AliasOperationError(
        ALIAS_ERROR_CODES.ALIAS_IS_PRIMARY,
        "Cannot remove the current primary alias. Make another alias primary first.",
        { operation: "REMOVE_ALIAS", targetAlias }
      );
    }

    // Idempotency: If alias is already absent, return confirmed success immediately
    const knownAliases = aliasInfo.aliases || [];
    const isPresent = knownAliases.some((a) => isSameEmail(a, targetAlias));
    if (!isPresent && knownAliases.length > 0) {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        accountStateFetched: true,
        isPrimary: false,
        verificationResult: "ALREADY_ABSENT",
        finalAliasCount: knownAliases.length
      });
      return true;
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Referer: "https://account.live.com/names/Manage",
      Origin: "https://account.live.com",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    // Helper to strictly verify if target is absent in fresh, valid authoritative state
    const checkRemoved = async () => {
      try {
        const verifyState = await getAliases(axios);
        // An unauthenticated/error response returns empty aliases and null primary: cannot confirm removal!
        if (!verifyState || !Array.isArray(verifyState.aliases)) return false;
        if (verifyState.aliases.length === 0 && !verifyState.primary) return false;
        const stillPresent = verifyState.aliases.some((a) => isSameEmail(a, targetAlias));
        return !stillPresent;
      } catch (e) {
        return false;
      }
    };

    // ---------------------------------------------------------------------------------
    // STRATEGY 1: Two-Step Interactive Confirmation Page Flow (Live Browser Behavior)
    // ---------------------------------------------------------------------------------
    try {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        strategy: "STRATEGY_1_CONFIRM_PAGE",
        status: "STARTED"
      });

      // Fetch /names/Manage HTML to parse dynamic action link or use canonical URL
      let confirmUrl = `https://account.live.com/names/Manage?action=Remove&aliasName=${encodeURIComponent(targetAlias)}`;
      try {
        const managePage = await axios.get("https://account.live.com/names/Manage", {
          headers,
          validateStatus: (status) => status >= 200 && status < 400
        });

        const manageHtml = typeof managePage?.data === "string" ? managePage.data : "";
        if (manageHtml) {
          // Dynamic link extraction matching target alias
          const escapedAlias = targetAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const linkPattern = new RegExp(
            `href=["']([^"']*(?:action=(?:Remove|RemoveAlias)&(?:amp;)?aliasName=${escapedAlias}|aliasName=${escapedAlias}&(?:amp;)?action=(?:Remove|RemoveAlias))[^"']*)["']`,
            "i"
          );
          const linkMatch = manageHtml.match(linkPattern);
          if (linkMatch && linkMatch[1]) {
            const rawHref = linkMatch[1].replace(/&amp;/g, "&");
            confirmUrl = rawHref.startsWith("http")
              ? rawHref
              : `https://account.live.com${rawHref.startsWith("/") ? "" : "/"}${rawHref}`;
          }
        }
      } catch (e) {}

      const confirmPageRes = await axios.get(confirmUrl, {
        headers,
        validateStatus: (status) => status >= 200 && status < 400
      });

      const html = typeof confirmPageRes?.data === "string" ? confirmPageRes.data : "";
      if (html && html.includes("<form")) {
        // Extract confirmation canary from form or HTML
        let confirmCanary = currentFormCanary;
        const canaryMatch =
          html.match(/<input[^>]+(?:name="canary"|id="canary")[^>]+value="([^"]+)"/i) ||
          html.match(/name="canary"\s+value="([^"]+)"/i) ||
          html.match(/"sCanary":\s*"([^"]+)"/i) ||
          html.match(/"apiCanary":\s*"([^"]+)"/i);
        if (canaryMatch && canaryMatch[1]) {
          confirmCanary = decode(canaryMatch[1]);
        }

        // Collect all hidden input fields from the confirmation page
        const formParams = new URLSearchParams();
        const inputRegex = /<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi;
        let match;
        while ((match = inputRegex.exec(html)) !== null) {
          formParams.set(match[1], match[2]);
        }

        // Set authoritative fields for removal
        formParams.set("canary", confirmCanary || currentFormCanary || "");
        formParams.set("aliasName", targetAlias);
        formParams.set("action", "Remove");
        formParams.set("PostOption", "Remove");
        formParams.set("confirm", "true");
        formParams.set("ConfirmRemove", "1");
        formParams.set("showWarning", "true");

        // Parse form action URL if specified
        let formActionUrl = "https://account.live.com/names/Manage";
        const formActionMatch = html.match(/<form[^>]+action=["']([^"']+)["']/i);
        if (formActionMatch && formActionMatch[1]) {
          try {
            formActionUrl = new URL(formActionMatch[1], "https://account.live.com/names/Manage").toString();
          } catch (e) {}
        }

        const postConfirmRes = await axios.post(formActionUrl, formParams.toString(), {
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400
        });

        // Check for inline error markers on 200 responses
        const postData = typeof postConfirmRes?.data === "string" ? postConfirmRes.data : "";
        const hasLogicalError =
          postData.includes("c_error") ||
          postData.includes("error_InvalidCanary") ||
          postData.includes("Cannot remove primary alias");

        if (!hasLogicalError && (await checkRemoved())) {
          logAliasEvent("ALIAS_REMOVE", {
            requestId: reqId,
            targetAlias,
            strategy: "STRATEGY_1",
            httpStatus: postConfirmRes?.status || 200,
            verificationResult: "SUCCESS",
            mutationResult: MUTATION_RESULTS.MUTATION_CONFIRMED
          });
          return true;
        }
      }
    } catch (strat1Err) {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        strategy: "STRATEGY_1",
        error: "STRATEGY_1_FAILED",
        message: strat1Err.message
      });
    }

    // ---------------------------------------------------------------------------------
    // STRATEGY 2: JSON API Endpoints (/API/RemoveAlias & /API/DeleteAlias)
    // ---------------------------------------------------------------------------------
    const tokenToUse = currentApiCanary || currentFormCanary;
    if (tokenToUse) {
      const endpoints = [
        "https://account.live.com/API/RemoveAlias",
        "https://account.live.com/API/DeleteAlias"
      ];

      for (const endpoint of endpoints) {
        try {
          logAliasEvent("ALIAS_REMOVE", {
            requestId: reqId,
            targetAlias,
            strategy: "STRATEGY_2_JSON_API",
            endpoint
          });

          const apiRes = await axios.post(
            endpoint,
            {
              aliasName: targetAlias,
              emailChecked: true
            },
            {
              headers: {
                canary: tokenToUse,
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/json, text/plain, */*",
                ...headers
              },
              validateStatus: (status) => status >= 200 && status < 500
            }
          );

          const resData = apiRes?.data;
          const errorCode = resData?.error?.code || resData?.errorCode;

          if (errorCode) {
            logAliasEvent("ALIAS_REMOVE", {
              requestId: reqId,
              targetAlias,
              endpoint,
              httpStatus: apiRes?.status,
              apiErrorCode: errorCode
            });
            if (errorCode === "1282") {
              logAliasEvent("ALIAS_REMOVE", { requestId: reqId, error: ALIAS_ERROR_CODES.RATE_LIMITED });
            }
          }

          if (!errorCode && (await checkRemoved())) {
            logAliasEvent("ALIAS_REMOVE", {
              requestId: reqId,
              targetAlias,
              strategy: "STRATEGY_2",
              endpoint,
              verificationResult: "SUCCESS",
              mutationResult: MUTATION_RESULTS.MUTATION_CONFIRMED
            });
            return true;
          }
        } catch (strat2Err) {
          logAliasEvent("ALIAS_REMOVE", {
            requestId: reqId,
            targetAlias,
            strategy: "STRATEGY_2",
            error: strat2Err.message
          });
        }
      }
    }

    // ---------------------------------------------------------------------------------
    // STRATEGY 3: Direct Multi-Flavor Form POST Fallback
    // ---------------------------------------------------------------------------------
    const effectiveFormCanary = currentFormCanary || currentApiCanary || "";
    const formPayloads = [
      `canary=${encodeURIComponent(effectiveFormCanary)}&action=Remove&PostOption=Remove&aliasName=${encodeURIComponent(targetAlias)}&confirm=true&ConfirmRemove=1`,
      `canary=${encodeURIComponent(effectiveFormCanary)}&action=RemoveAlias&PostOption=RemoveAlias&aliasName=${encodeURIComponent(targetAlias)}&displayName=${encodeURIComponent(targetAlias)}&confirm=true&ConfirmRemove=1&Confirm=1`,
      `canary=${encodeURIComponent(effectiveFormCanary)}&action=RemoveAlias&PostOption=Remove&aliasName=${encodeURIComponent(targetAlias)}&confirm=true&showWarning=true`,
      `canary=${encodeURIComponent(effectiveFormCanary)}&action=Remove&aliasName=${encodeURIComponent(targetAlias)}&confirm=true`
    ];

    for (let i = 0; i < formPayloads.length; i++) {
      try {
        const postRes = await axios.post("https://account.live.com/names/Manage", formPayloads[i], {
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400
        });

        const postData = typeof postRes?.data === "string" ? postRes.data : "";
        const hasError =
          postData.includes("c_error") ||
          postData.includes("error_InvalidCanary") ||
          postData.includes("Cannot remove primary alias");

        if (!hasError && (await checkRemoved())) {
          logAliasEvent("ALIAS_REMOVE", {
            requestId: reqId,
            targetAlias,
            strategy: "STRATEGY_3",
            payloadIndex: i + 1,
            verificationResult: "SUCCESS",
            mutationResult: MUTATION_RESULTS.MUTATION_CONFIRMED
          });
          return true;
        }
      } catch (strat3Err) {
        logAliasEvent("ALIAS_REMOVE", {
          requestId: reqId,
          targetAlias,
          strategy: "STRATEGY_3",
          payloadIndex: i + 1,
          error: strat3Err.message
        });
      }
    }

    // Final authoritative state verification
    const finalVerification = await checkRemoved();
    if (finalVerification) {
      logAliasEvent("ALIAS_REMOVE", {
        requestId: reqId,
        targetAlias,
        verificationResult: "SUCCESS_FINAL_SWEEP",
        mutationResult: MUTATION_RESULTS.MUTATION_CONFIRMED
      });
      return true;
    }

    logAliasEvent("ALIAS_REMOVE", {
      requestId: reqId,
      targetAlias,
      verificationResult: "FAILED",
      mutationResult: MUTATION_RESULTS.STATE_MISMATCH,
      message: "Alias remains present in authoritative state after all removal strategies"
    });
    return false;
  } finally {
    clearAliasOpPending(targetAlias);
  }
};