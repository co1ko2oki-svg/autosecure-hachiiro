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

      const pageHtml = typeof getPage?.data === "string" ? getPage.data : JSON.stringify(getPage?.data || "");
      if (pageHtml) {
        // Extract form action URL if present
        const formActionMatch =
          pageHtml.match(/<form[^>]+action=["']([^"']+)["']/i) ||
          pageHtml.match(/action=["']([^"']*(?:AddAssocId|names\/Manage)[^"']*)["']/i);
        if (formActionMatch && formActionMatch[1]) {
          try {
            postActionUrl = new URL(formActionMatch[1], "https://account.live.com/AddAssocId").toString();
          } catch (e) {
            postActionUrl = "https://account.live.com/AddAssocId?ru=https%3a%2f%2faccount.live.com%2fnames%2fManage";
          }
        }

        // Extract all hidden inputs from the page to maintain session & telemetry context
        const inputRegex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
        let match;
        while ((match = inputRegex.exec(pageHtml)) !== null) {
          const tag = match[0];
          const nameMatch = tag.match(/name=["']([^"']+)["']/i);
          const valMatch = tag.match(/value=["']([^"']*)["']/i);
          if (nameMatch && nameMatch[1]) {
            hiddenInputs[nameMatch[1]] = valMatch ? valMatch[1] : "";
          }
        }

        // Extract fresh form canary
        const pageCanaryMatch =
          pageHtml.match(/<input[^>]+(?:name="canary"|id="canary")[^>]+value="([^"]+)"/i) ||
          pageHtml.match(/<input[^>]+value="([^"]+)"[^>]+(?:name="canary"|id="canary")/i) ||
          pageHtml.match(/name="canary"\s+value="([^"]+)"/i) ||
          pageHtml.match(/"apiCanary":\s*"([^"]+)"/i) ||
          pageHtml.match(/"sCanary":\s*"([^"]+)"/i) ||
          pageHtml.match(/"canary":\s*"([^"]+)"/i);

        if (pageCanaryMatch && pageCanaryMatch[1]) {
          formCanary = decode(pageCanaryMatch[1]);
        }

        // Detect default domain
        const domainMatch =
          pageHtml.match(/<option[^>]+value="([^"]*outlook[^"]*)"/i) ||
          pageHtml.match(/name="SingleDomain"[^>]+value="([^"]+)"/i) ||
          pageHtml.match(/value="([^"]+)"[^>]+name="SingleDomain"/i);
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
        formCanary = freshAliases?.formCanary || freshAliases?.canary;
      } catch (e) {}
    }

    if (!formCanary) {
      console.error(`[ADD_ALIAS][req=${reqId}] [X] No canary token available for addAlias`);
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
          Referer: "https://account.live.com/AddAssocId",
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
      } else if (locLower.includes("addassocid") || locLower.includes("error.aspx") || locLower.includes("err=")) {
        classification = MUTATION_RESULTS.MUTATION_REJECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] [!] Mutation possibly rejected by Microsoft: Redirected back to form (${location}). Verifying actual state...`);
        // Debug Log
        try {
            const debugDir = path.join(__dirname, "../../../../debug");
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, `add_alias_error_${reqId}.html`), rawData);
        } catch(e) {}
        // Fall through to Step 4 authoritative state check instead of returning false
      } else if (locLower.includes("proofs") || locLower.includes("challenge") || locLower.includes("consent")) {
        classification = MUTATION_RESULTS.MUTATION_CHALLENGED;
        console.log(`[ADD_ALIAS][req=${reqId}] [X] Mutation challenged by Microsoft security (${location}).`);
        // Debug Log
        try {
            const debugDir = path.join(__dirname, "../../../../debug");
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, `add_alias_challenge_${reqId}.html`), rawData);
        } catch(e) {}
        return false;
      } else {
        classification = MUTATION_RESULTS.MUTATION_REDIRECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] Redirected to ${location} - proceeding to authoritative state check.`);
      }
    } else if (status === 200) {
      // 200 OK without redirect usually means HTML error page re-displayed
      if (
        rawData.includes("error_") ||
        rawData.includes("already taken") ||
        rawData.includes("already in use") ||
        rawData.includes("Choose a different email") ||
        rawData.includes('code="1213"') ||
        rawData.includes('code="1282"')
      ) {
        classification = MUTATION_RESULTS.MUTATION_REJECTED;
        console.log(`[ADD_ALIAS][req=${reqId}] [!] Microsoft returned HTTP 200 logical error. Verifying actual state...`);
        // Debug Log
        try {
            const debugDir = path.join(__dirname, "../../../../debug");
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, `add_alias_error_200_${reqId}.html`), rawData);
        } catch(e) {}
        // Fall through to Step 4 instead of returning false - alias may still exist
      } else {
        classification = MUTATION_RESULTS.MUTATION_UNKNOWN;
      }
    }

    // ----------------------------------------------------
    // STEP 4: Authoritative State Verification
    // ----------------------------------------------------
    try {
      const checkState = await getAliases(axios);
      const matchedAlias = (checkState?.aliases || []).find((a) => isSameEmail(a, expectedCreatedEmail));

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
