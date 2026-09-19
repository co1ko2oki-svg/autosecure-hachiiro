const decode = require("./decode");
const { normalizeEmail } = require("./aliasHelper");

/**
 * Extracts the substring of a balanced `{...}` object starting at `startIdx`
 * (which must point at the opening brace). Correctly skips braces that appear
 * inside single/double/backtick string literals and honours backslash escapes,
 * so it returns the WHOLE embedded object even when it contains nested objects
 * or `function(){...}` bodies. Returns null if no balanced match is found.
 */
function extractBalancedObject(str, startIdx) {
  if (startIdx < 0 || str[startIdx] !== "{") return null;

  let depth = 0;
  let inString = false;
  let quote = "";

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped char
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return str.substring(startIdx, i + 1);
      }
    }
  }

  return null;
}

function isValidAlias(str) {
  if (!str) return false;
  if (str.includes("@")) return true;
  // Match phone numbers: optional +, followed by digits, spaces, parens, hyphens. At least 7 digits.
  const digits = str.replace(/[^\d]/g, "");
  return digits.length >= 7 && /^[\+\d\s\(\)-]+$/.test(str);
}

/**
 * Fetches and parses all aliases, canary tokens (apiCanary & formCanary),
 * and the verified primary alias for the Microsoft account.
 * 
 * Supports multi-language accounts (English, German, French, Spanish, Portuguese, Vietnamese)
 * and extracts isPrimary/fPrimary directly from mxAliases objects in JSON blocks.
 */
async function getAliases(axios) {
  const emptyResult = {
    aliases: [],
    canary: null,
    formCanary: null,
    apiCanary: null,
    primary: null,
    [Symbol.iterator]: function* () {
      yield this.aliases;
      yield this.canary;
      yield this.primary;
    }
  };

  if (!axios) return emptyResult;

  try {
    const response = await axios.get("https://account.live.com/names/Manage", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Referer": "https://account.live.com/"
      },
      validateStatus: (status) => status >= 200 && status < 400
    });

    const html = typeof response?.data === "string"
      ? response.data
      : (response?.data ? JSON.stringify(response.data) : "");

    if (!html) return emptyResult;

    let apiCanary = null;
    let formCanary = null;

    // 1. Extract API Canary
    const apiCanaryMatch = html.match(/"apiCanary":\s*"([^"]+)"/i);
    if (apiCanaryMatch && apiCanaryMatch[1]) {
      apiCanary = decode(apiCanaryMatch[1]);
    }

    // 2. Extract Form Canary
    const formCanaryMatch =
      html.match(/<input[^>]+(?:name="canary"|id="canary")[^>]+value="([^"]+)"/i) ||
      html.match(/<input[^>]+value="([^"]+)"[^>]+(?:name="canary"|id="canary")/i) ||
      html.match(/name="canary"\s+value="([^"]+)"/i) ||
      html.match(/"sCanary":\s*"([^"]+)"/i) ||
      html.match(/sCanary:\s*"([^"]+)"/i);
    if (formCanaryMatch && formCanaryMatch[1]) {
      formCanary = decode(formCanaryMatch[1]);
    }

    const canary = formCanary || apiCanary;
    const aliasSet = new Set();
    let primaryAlias = null;

    // 3. Extract structured aliases from ServerData / t0 / $Config JSON blocks.
    //
    // NOTE: The real account.live.com page embeds these as JavaScript object
    // literals, NOT strict JSON — they routinely contain `function(){...}`,
    // trailing commas, and unquoted keys, so JSON.parse throws. The previous
    // non-greedy `{[\s\S]*?}` regex also truncated the object at the FIRST
    // `};` it saw. Both bugs meant `primary` came back null on live accounts,
    // which made makePrimary's PHASE 4 verification always fail (and triggered
    // a rollback that deleted the freshly-created alias). We therefore:
    //   (a) extract the *balanced* object and try JSON.parse (fast path for
    //       clean/mock payloads), and
    //   (b) ALWAYS run targeted regex fallbacks against the raw HTML so the
    //       primary alias and aliases are recovered even when parsing fails.
    for (const varName of ["t0", "ServerData", "$Config"]) {
      const blockStart = html.search(
        new RegExp(`var\\s+${varName.replace("$", "\\$")}\\s*=\\s*{`, "i")
      );
      if (blockStart === -1) continue;

      const braceStart = html.indexOf("{", blockStart);
      const objStr = extractBalancedObject(html, braceStart);
      if (!objStr) continue;

      try {
        const parsed = JSON.parse(objStr);
        const wlx = parsed?.WLXAccount || parsed;

        if (wlx?.manageNames?.mxAliases && Array.isArray(wlx.manageNames.mxAliases)) {
          for (const item of wlx.manageNames.mxAliases) {
            const val = typeof item === "string" ? item : (item?.name || item?.email || item?.aliasName || item?.displayName || String(item || ""));
            const clean = normalizeEmail(val);
            if (isValidAlias(clean)) {
              aliasSet.add(clean);
              if (item?.isPrimary === true || item?.fPrimary === true || item?.isDefault === true) {
                primaryAlias = clean;
              }
            }
          }
        }

        if (wlx?.addAlias?.phoneAliases && Array.isArray(wlx.addAlias.phoneAliases)) {
          for (const p of wlx.addAlias.phoneAliases) {
            const val = typeof p === "string" ? p : (p?.name || p?.email || String(p || ""));
            const clean = normalizeEmail(val);
            if (isValidAlias(clean)) aliasSet.add(clean);
          }
        }

        if (wlx?.manageNames?.primaryAlias) {
          const mem = normalizeEmail(String(wlx.manageNames.primaryAlias));
          if (isValidAlias(mem)) {
            primaryAlias = mem;
            aliasSet.add(mem);
          }
        }

        if (wlx?.accountManagement?.membername) {
          const mem = normalizeEmail(String(wlx.accountManagement.membername));
          if (isValidAlias(mem)) {
            if (!primaryAlias) primaryAlias = mem;
            aliasSet.add(mem);
          }
        }
      } catch (_) {
        // Not strict JSON (the common live-page case) — fall back to the
        // targeted regex extraction below, which operates on the raw HTML.
      }
    }

    // 3b. Targeted regex extraction (runs unconditionally so it also rescues
    //     accounts where the JSON object was not valid JSON). Aliases are
    //     unioned; primary is only overwritten when we find an authoritative
    //     marker, never cleared.

    // Every alias-like value inside the embedded objects: "name"/"email"/
    // "aliasName"/"displayName": "someone@domain" or a phone number.
    const aliasFieldRegex = /"(?:name|email|aliasName|displayName)"\s*:\s*"([^"]+)"/gi;
    let aliasFieldMatch;
    while ((aliasFieldMatch = aliasFieldRegex.exec(html)) !== null) {
      const clean = normalizeEmail(aliasFieldMatch[1]);
      if (isValidAlias(clean)) aliasSet.add(clean);
    }

    // Authoritative primary from the manageNames.primaryAlias field.
    if (!primaryAlias) {
      const primaryFieldMatch = html.match(/"primaryAlias"\s*:\s*"([^"]+)"/i);
      if (primaryFieldMatch && primaryFieldMatch[1]) {
        const clean = normalizeEmail(primaryFieldMatch[1]);
        if (isValidAlias(clean)) {
          primaryAlias = clean;
          aliasSet.add(clean);
        }
      }
    }

    // Primary from an alias object flagged isPrimary/fPrimary/isDefault:true.
    // Match a single flat object (no nested braces) that carries both the
    // flag and an email/phone, regardless of field order.
    if (!primaryAlias) {
      const primaryObjRegex = /\{[^{}]*?"(?:isPrimary|fPrimary|isDefault)"\s*:\s*true[^{}]*?\}/gi;
      let objMatch;
      while ((objMatch = primaryObjRegex.exec(html)) !== null) {
        const emailInObj = objMatch[0].match(/"(?:name|email|aliasName|displayName)"\s*:\s*"([^"]+)"/i);
        if (emailInObj && emailInObj[1]) {
          const clean = normalizeEmail(emailInObj[1]);
          if (isValidAlias(clean)) {
            primaryAlias = clean;
            aliasSet.add(clean);
            break;
          }
        }
      }
    }

    // 4. HTML table action links extraction
    const linkMatches = html.match(/aliasName=([^&"'>\s]+)/gi);
    if (linkMatches) {
      for (const lm of linkMatches) {
        const val = decodeURIComponent(lm.replace(/aliasName=/i, "")).trim().toLowerCase();
        const clean = normalizeEmail(val);
        if (isValidAlias(clean) && !clean.includes("<") && !clean.includes(">")) {
          aliasSet.add(clean);
        }
      }
    }

    // 4b. Emails rendered as plain cell/element text (e.g. the primary alias
    //     row usually has no action link). Only the local part + domain, no
    //     surrounding tags. Keeps aliasSet complete on degraded pages where the
    //     JSON block is missing and only some rows carry action links.
    const textEmailRegex = />\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*(?:\(|<)/g;
    let textEmailMatch;
    while ((textEmailMatch = textEmailRegex.exec(html)) !== null) {
      const clean = normalizeEmail(textEmailMatch[1]);
      if (isValidAlias(clean)) aliasSet.add(clean);
    }
    
    // Also try to find phone numbers as plain text in the table cells
    const textPhoneRegex = />\s*([\+\d\s\(\)-]{7,20})\s*(?:\(|<)/g;
    let textPhoneMatch;
    while ((textPhoneMatch = textPhoneRegex.exec(html)) !== null) {
      const clean = normalizeEmail(textPhoneMatch[1]);
      if (isValidAlias(clean)) aliasSet.add(clean);
    }

    // 5. Multi-language primary alias HTML matching (English, German, French,
    //    Spanish, Portuguese, Vietnamese). The `<td...>` / `<span...>` patterns
    //    tolerate attributes on the tag and either ordering of the email vs the
    //    "Primary alias" label, since Microsoft renders it both ways depending
    //    on locale and layout.
    const PRIMARY_LABEL = "Primary alias|Bí danh chính|Alias principal|Primärer Alias|Hauptalias|Adresse principale|Псевдоним основной";
    if (!primaryAlias) {
      // A "gap" that must NOT jump across another email (@), a row boundary
      // (</tr>), or into a "Make Primary" action — this keeps the label from
      // being paired with the WRONG alias in a multi-row table.
      const GAP = "(?:(?!@|</tr>|MakePrimary)[\\s\\S]){0,120}?";
      const primaryMatch =
        html.match(/id="c_membername"[^>]*>([^<]+)</i) ||
        html.match(/class="[^"]*c_membername[^"]*"[^>]*>([^<]+)</i) ||
        html.match(/class="[^"]*primary[^"]*"[^>]*>([^<@]+@[^<]+)</i) ||
        // email then label (e.g. `<td>user@x.com (Primary alias)</td>` or
        // `<td>user@x.com</td><td>Primary alias</td>`)
        html.match(new RegExp(`([\\w.+-]+@[\\w.-]+)${GAP}(?:${PRIMARY_LABEL})`, "i")) ||
        // label then email in the SAME row/cell (e.g. `Primary alias: user@x.com`)
        html.match(new RegExp(`(?:${PRIMARY_LABEL})${GAP}([\\w.+-]+@[\\w.-]+)`, "i"));

      if (primaryMatch && primaryMatch[1]) {
        const found = normalizeEmail(primaryMatch[1]);
        if (isValidAlias(found)) {
          primaryAlias = found;
          aliasSet.add(found);
        }
      }
    }

    // 6. Last-resort inference: on the Manage page every alias EXCEPT the
    //    current primary is rendered with a "Make Primary" action link
    //    (aliasName=... &action=MakePrimary). If we found aliases but still
    //    have no primary, the one alias that has no MakePrimary link is the
    //    primary. Only applied when it yields exactly one candidate to avoid
    //    guessing wrong.
    if (!primaryAlias && aliasSet.size > 0) {
      const makePrimaryTargets = new Set();
      const mpRegex = /aliasName=([^&"'>\s]+)[^"'>]*?action=MakePrimary|action=MakePrimary[^"'>]*?aliasName=([^&"'>\s]+)/gi;
      let mp;
      while ((mp = mpRegex.exec(html)) !== null) {
        const raw = mp[1] || mp[2] || "";
        let decoded = raw;
        try { decoded = decodeURIComponent(raw); } catch (_) {}
        const clean = normalizeEmail(decoded);
        if (isValidAlias(clean)) makePrimaryTargets.add(clean);
      }

      if (makePrimaryTargets.size > 0) {
        const notMakeable = Array.from(aliasSet).filter((a) => !makePrimaryTargets.has(a));
        if (notMakeable.length === 1) {
          primaryAlias = notMakeable[0];
        }
      }
    }

    const normalizedAliases = Array.from(aliasSet);

    return {
      aliases: normalizedAliases,
      canary,
      formCanary: formCanary || null,
      apiCanary: apiCanary || canary,
      primary: primaryAlias,
      [Symbol.iterator]: function* () {
        yield this.aliases;
        yield this.canary;
        yield this.primary;
      }
    };
  } catch (error) {
    console.error("[GET_ALIASES] Error fetching aliases:", error.message);
    return emptyResult;
  }
}

module.exports = getAliases;
