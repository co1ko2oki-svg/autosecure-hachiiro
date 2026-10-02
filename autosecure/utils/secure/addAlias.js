const getAliases = require("./getAliases");
const decode = require("./decode");
const fs = require("fs");
const path = require("path");
const {
  sanitizeAliasPrefix,
  normalizeEmail,
  isSameEmail,
  safeMetadata,
  generateCorrelationId,
  MUTATION_RESULTS
} = require("./aliasHelper");

/**
 * Adds a new Outlook alias to the Microsoft account.
 * Replicates complete browser flow:
 * 1. Fetches AddAssocId page to obtain session cookies, form canary, available domains, and hidden form fields
 * 2. Builds form payload matching Microsoft's exact form schema
 * 3. Classifies HTTP response & 302 redirect locations (dashboard vs error vs auth loss)
 * 4. Strictly verifies alias creation via authoritative state refresh in getAliases
 */
module.exports = async (axios, name, canary2, correlationId = null) => {
  const reqId = correlationId || generateCorrelationId();

  if (!axios || !name || typeof name !== "string") {
    console.error(`[ADD_ALIAS][req=${reqId}] Missing required parameters (axios, name)`);
    return false;
  }

  const cleanName = sanitizeAliasPrefix(name);
  if (!cleanName || cleanName.length < 3) {
    console.error(`[ADD_ALIAS][req=${reqId}] Alias name invalid or too short after sanitization: ${name}`);
    return false;
  }

  try {
    let formCanary = canary2 ? decode(canary2) : null;
    let chosenDomain = "outlook.com";
    const hiddenInputs = {};

    // Helper to bypass Microsoft's mandatory proof verification interrupt ("Call us overprotective...")
    const handleProofInterrupt = async (html) => {
      try {
        if (!html || typeof html !== "string") return false;
        if (!html.includes("frmVerifyProof") && !html.includes("Call us overprotective") && !html.includes("proofs/Verify")) {
          return false;
        }
        console.log(`[ADD_ALIAS][req=${reqId}] Detected 'Call us overprotective' proof interrupt. Attempting bypass...`);
        const cancelMatch = html.match(/urlCancel:\s*['"]([^'"]+)['"]/i);
        if (cancelMatch && cancelMatch[1]) {
          const rawUrl = cancelMatch[1].replace(/\\x3a/g, ":").replace(/\\x2f/g, "/");
          console.log(`[ADD_ALIAS][req=${reqId}] Bypassing interrupt via cancel URL...`);
          await axios.get(rawUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            },
            maxRedirects: 3,
            validateStatus: () => true
          });
          return true;
        }

        const formAction = html.match(/<form[^>]+id=["']frmVerifyProof["'][^>]+action=["']([^"']+)["']/i)?.[1];
        const canaryMatch = html.match(/id=["']canary["'][^>]+value=["']([^"']+)["']/i)?.[1] ||
                            html.match(/name=["']canary["'][^>]+value=["']([^"']+)["']/i)?.[1];
        if (formAction && canaryMatch) {
          console.log(`[ADD_ALIAS][req=${reqId}] Bypassing interrupt via Skip POST...`);
          await axios.post(decode(formAction), `action=Skip&canary=${encodeURIComponent(decode(canaryMatch))}`, {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            },
            maxRedirects: 3,
            validateStatus: () => true
          });
          return true;
        }
      } catch (err) {
        console.log(`[ADD_ALIAS][req=${reqId}] Warning during proof interrupt bypass:`, err.message);
      }
      return false;
    };

    // ----------------------------------------------------
    // STEP 1: GET AddAssocId page
    // ----------------------------------------------------
    let postActionUrl = "https://account.live.com/AddAssocId?ru=https%3a%2f%2faccount.live.com%2fnames%2fManage";
    try {
      const getPage = await axios.get("https://account.live.com/AddAssocId?ru=https%3a%2f%2faccount.live.com%2fnames%2fManage", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Referer: "https://account.live.com/names/Manage",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        },
        validateStatus: (status) => status >= 200 && status < 400
      });

      let pageHtml = typeof getPage?.data === "string" ? getPage.data : JSON.stringify(getPage?.data || "");
      if (pageHtml && (pageHtml.includes("frmVerifyProof") || pageHtml.includes("Call us overprotective"))) {
        const bypassed = await handleProofInterrupt(pageHtml);
        if (bypassed) {
          console.log(`[ADD_ALIAS][req=${reqId}] Bypassed proof interrupt on initial page load, refreshing AddAssocId...`);
          try {
            const refetched = await axios.get("https://account.live.com/AddAssocId?ru=https%3a%2f%2faccount.live.com%2fnames%2fManage", {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                Referer: "https://account.live.com/names/Manage",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
              },
              validateStatus: (s) => s >= 200 && s < 400
            });
            if (refetched?.data) {
              pageHtml = typeof refetched.data === "string" ? refetched.data : JSON.stringify(refetched.data);
            }
          } catch (e) {}
        }
      }

      if (pageHtml) {
        // Extract form action URL if present and decode HTML entities
        const formActionMatch =
          pageHtml.match(/<form[^>]+action=["']([^"']+)["']/i) ||
          pageHtml.match(/action=["']([^"']*(?:AddAssocId|names\/Manage)[^"']*)["']/i);
        if (formActionMatch && formActionMatch[1]) {
          try {
            const rawAction = decode(formActionMatch[1]);
            postActionUrl = new URL(rawAction, "https://account.live.com/AddAssocId").toString();
          } catch (e) {
            postActionUrl = "https://account.live.com/AddAssocId?ru=https%3a%2f%2faccount.live.com%2fnames%2fManage";
          }
        }

        // Extract all hidden inputs from the page to maintain session & telemetry context
        const inputRegex = /<input\b[^>]*\btype=["']?hidden["']?[^>]*>/gi;
        let match;
        while ((match = inputRegex.exec(pageHtml)) !== null) {
          const tag = match[0];
          const nameMatch = tag.match(/name=["']?([^"' >]+)["']?/i);
          const valMatch = tag.match(/value=["']?([^"'>]*)["']?/i);
          if (nameMatch && nameMatch[1]) {
            hiddenInputs[nameMatch[1]] = valMatch ? decode(valMatch[1]) : "";
          }
        }

        // Extract fresh form canary
        // NOTE: Form canary must NOT match apiCanary!
        // apiCanary is strictly for REST API JSON endpoints (like MakePrimary).
        // For HTML forms like AddAssocId, only the form canary (canary, sCanary) is valid.
        let extractedCanary = null;
        if (hiddenInputs["canary"]) {
          extractedCanary = hiddenInputs["canary"];
        } else {
          const pageCanaryMatch =
            pageHtml.match(/<input\b[^>]*\b(?:name|id)=["']?canary["']?[^>]*\bvalue=["']([^"']+)["']/i) ||
            pageHtml.match(/<input\b[^>]*\bvalue=["']([^"']+)["'][^>]*\b(?:name|id)=["']?canary["']?/i) ||
            pageHtml.match(/name=["']?canary["']?\s+value=["']([^"']+)["']/i) ||
            pageHtml.match(/"sCanary":\s*"([^"]+)"/i) ||
            pageHtml.match(/sCanary:\s*"([^"]+)"/i) ||
            pageHtml.match(/"canary":\s*"([^"]+)"/i);

          if (pageCanaryMatch && pageCanaryMatch[1]) {
            extractedCanary = decode(pageCanaryMatch[1]);
          }
        }

        if (extractedCanary) {
          formCanary = extractedCanary;
        }

        // Detect default domain
        const domainMatch =
          pageHtml.match(/<option[^>]+value=["']([^"']*outlook[^"']*)["']/i) ||
          pageHtml.match(/name="SingleDomain"[^>]+value=["']([^"']+)["']/i) ||
          pageHtml.match(/value=["']([^"']+)["'][^>]+name="SingleDomain"/i);
        if (domainMatch && domainMatch[1]) {
          chosenDomain = domainMatch[1].trim().toLowerCase();
        }
      }
    } catch (getPageErr) {
      console.log(`[ADD_ALIAS][req=${reqId}] Warning on GET AddAssocId (${getPageErr.message}), proceeding with fallback token...`);
    }

    if (!formCanary) {
      try {
        const freshAliases = await getAliases(axios);
        // Only use formCanary from getAliases, NOT apiCanary!
        formCanary = freshAliases?.formCanary || null;
      } catch (e) {}
    }

    if (!formCanary) {
      console.error(`[ADD_ALIAS][req=${reqId}] [X] No valid form canary token available for addAlias`);
      return false;
    }

    const expectedCreatedEmail = `${cleanName}@${chosenDomain}`.toLowerCase();
    console.log(`[ADD_ALIAS][req=${reqId}] Preparing alias creation request for ${expectedCreatedEmail} (token: ${safeMetadata(formCanary)})...`);

    // ----------------------------------------------------
    // STEP 2: POST AddAssocId with comprehensive form body
    // ----------------------------------------------------
    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(hiddenInputs)) {
      formData.set(k, v);
    }
    formData.set("canary", formCanary);
    formData.set("action", "AddAssocId");
    formData.set("PostOption", "AddAssocId");
    formData.set("SubmitYes", "Add alias");
    formData.set("AddAssocIdOptions", "LIVE");
    formData.set("SingleDomain", chosenDomain);
    formData.set("AssociatedIdLive", cleanName);
    formData.set("AssociatedIdLiveDomain", chosenDomain);
    formData.set("AssociatedIdOther", "");
    formData.set("UpSell", "");
    formData.set("ru", "https://account.live.com/names/Manage");

    const postData = formData.toString();

    const response = await axios.post(
      postActionUrl,
      postData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Origin: "https://account.live.com",
          Referer: postActionUrl,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      }
    );

    const status = response?.status;
    const location = response?.headers?.location || "";
    const rawData = typeof response?.data === "string" ? response.data : JSON.stringify(response?.data || "");

    // Helper to write debug file to project's debug directory
    const debugDir = path.resolve(__dirname, "../../../debug");
    const saveDebugFile = (filename, content) => {
      try {
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, filename), content, "utf8");
      } catch (err) {
        console.error(`[ADD_ALIAS][req=${reqId}] Failed to save debug file ${filename}:`, err.message);
      }
    };

    // Helper to fetch the actual HTML error page when redirected
    const fetchRedirectPage = async (redirectLoc) => {
      try {
        const fullUrl = new URL(redirectLoc, "https://account.live.com").toString();
        const pageRes = await axios.get(fullUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Referer: postActionUrl,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
          },
          validateStatus: () => true
        });
        return typeof pageRes?.data === "string" ? pageRes.data : JSON.stringify(pageRes?.data || "");
      } catch (e) {
        return `<!-- Failed to fetch redirect page ${redirectLoc}: ${e.message} -->`;
      }
    };

    // ----------------------------------------------------
    // STEP 3: Classify Response & 302 Redirect Location
    // ----------------------------------------------------
    let classification = MUTATION_RESULTS.MUTATION_UNKNOWN;

    if (status === 302) {
      const locLower = location.toLowerCase();

      if (locLower.includes("/names/manage") || locLower.includes("names/manage")) {
        classification = MUTATION_RESULTS.MUTATION_REDIRECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] Redirected to alias dashboard (${location}) - checking state...`);
      } else if (locLower.includes("login.live.com") || locLower.includes("/login.srf")) {
        classification = MUTATION_RESULTS.MUTATION_AUTH_REQUIRED;
        console.log(`[ADD_ALIAS][req=${reqId}] [X] Mutation failed: Redirected to login page (session lost or unauthenticated).`);
        return false;
      } else if (locLower.includes("addassocid") || locLower.includes("error.aspx") || locLower.includes("err=") || locLower.includes("error=")) {
        classification = MUTATION_RESULTS.MUTATION_REJECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] [!] Mutation possibly rejected by Microsoft: Redirected back to form (${location}). Fetching error details...`);
        
        // Fetch the actual error page from the redirect destination so debug log is not 0 bytes
        const errorHtml = await fetchRedirectPage(location);
        saveDebugFile(`add_alias_error_${reqId}.html`, `<!-- Redirect Location: ${location} -->\n${errorHtml}`);

        // Parse human-readable error from errorHtml
        const errorMsgMatch =
          errorHtml.match(/<div[^>]+id=["']c_error["'][^>]*>([^<]+)<\/div>/i) ||
          errorHtml.match(/<div[^>]+class=["'][^"']*alert-error[^"']*["'][^>]*>([^<]+)<\/div>/i) ||
          errorHtml.match(/<span[^>]+class=["'][^"']*error[^"']*["'][^>]*>([^<]+)<\/span>/i);

        if (errorMsgMatch && errorMsgMatch[1]) {
          console.log(`[ADD_ALIAS][req=${reqId}] [!] Microsoft error message: ${errorMsgMatch[1].trim()}`);
        } else if (errorHtml.includes("already taken") || errorHtml.includes("already in use")) {
          console.log(`[ADD_ALIAS][req=${reqId}] [!] Microsoft error: Email address is already taken.`);
        } else if (errorHtml.includes("1282") || errorHtml.includes("limit") || errorHtml.includes("frequently")) {
          console.log(`[ADD_ALIAS][req=${reqId}] [!] Microsoft error: Limit on alias operations reached (rate limit/code 1282).`);
        } else if (errorHtml.includes("InvalidCanary") || errorHtml.includes("error_InvalidCanary")) {
          console.log(`[ADD_ALIAS][req=${reqId}] [!] Microsoft error: Invalid canary token.`);
        }
        // Fall through to Step 4 authoritative state check
      } else if (locLower.includes("proofs") || locLower.includes("challenge") || locLower.includes("consent")) {
        classification = MUTATION_RESULTS.MUTATION_CHALLENGED;
        console.log(`[ADD_ALIAS][req=${reqId}] [!] Mutation redirected to Microsoft security (${location}). Attempting bypass...`);
        const challengeHtml = await fetchRedirectPage(location);
        saveDebugFile(`add_alias_challenge_${reqId}.html`, `<!-- Challenge Location: ${location} -->\n${challengeHtml}`);
        const bypassed = await handleProofInterrupt(challengeHtml);
        if (bypassed) {
          console.log(`[ADD_ALIAS][req=${reqId}] Proof interrupt bypassed, checking authoritative state...`);
        } else {
          return false;
        }
      } else {
        classification = MUTATION_RESULTS.MUTATION_REDIRECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] Redirected to ${location} - proceeding to authoritative state check.`);
      }
    } else if (status === 200) {
      if (rawData.includes("frmVerifyProof") || rawData.includes("Call us overprotective") || rawData.includes("proofs/Verify")) {
        console.log(`[ADD_ALIAS][req=${reqId}] Microsoft returned HTTP 200 proof verification challenge. Attempting bypass...`);
        saveDebugFile(`add_alias_error_200_${reqId}.html`, rawData);
        await handleProofInterrupt(rawData);
      } else if (
        rawData.includes("error_") ||
        rawData.includes("already taken") ||
        rawData.includes("already in use") ||
        rawData.includes("Choose a different email") ||
        rawData.includes('code="1213"') ||
        rawData.includes('code="1282"')
      ) {
        classification = MUTATION_RESULTS.MUTATION_REJECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] [!] Microsoft returned HTTP 200 logical error. Verifying actual state...`);
        saveDebugFile(`add_alias_error_200_${reqId}.html`, rawData);
        // Fall through to Step 4 instead of returning false - alias may still exist
      } else {
        classification = MUTATION_RESULTS.MUTATION_UNKNOWN;
      }
    }

    // ----------------------------------------------------
    // STEP 4: Authoritative State Verification
    // ----------------------------------------------------
    try {
      let checkState = await getAliases(axios);
      let matchedAlias = (checkState?.aliases || []).find((a) => isSameEmail(a, expectedCreatedEmail));

      // Idempotent retry for eventual consistency (sometimes MS takes 1.5s)
      if (!matchedAlias && classification !== MUTATION_RESULTS.MUTATION_REJECTED) {
        console.log(`[ADD_ALIAS][req=${reqId}] Alias not immediately found, retrying state verification in 1.5s...`);
        await new Promise((r) => setTimeout(r, 1500));
        checkState = await getAliases(axios);
        matchedAlias = (checkState?.aliases || []).find((a) => isSameEmail(a, expectedCreatedEmail));
      }

      if (matchedAlias) {
        classification = MUTATION_RESULTS.MUTATION_CONFIRMED;
        console.log(`[ADD_ALIAS][req=${reqId}] [✔] [${classification}] Alias ${matchedAlias} confirmed present in authoritative account state.`);
        return matchedAlias;
      }
    } catch (e) {
      console.error(`[ADD_ALIAS][req=${reqId}] Error during state verification:`, e.message);
    }

    console.log(`[ADD_ALIAS][req=${reqId}] [X] [${MUTATION_RESULTS.STATE_MISMATCH}] Alias ${expectedCreatedEmail} not present in account state.`);
    return false;
  } catch (error) {
    console.error(`[ADD_ALIAS][req=${reqId}] Error during addAlias request:`, error.message);
    return false;
  }
};
