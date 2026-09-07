const decode = require("./decode");
const { normalizeEmail } = require("./aliasHelper");

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
    const apiCanaryMatch =
      html.match(/"apiCanary":\s*"([^"]+)"/i) ||
      html.match(/"sCanary":\s*"([^"]+)"/i) ||
      html.match(/"canary":\s*"([^"]+)"/i);
    if (apiCanaryMatch && apiCanaryMatch[1]) {
      apiCanary = decode(apiCanaryMatch[1]);
    }

    // 2. Extract Form Canary
    const formCanaryMatch =
      html.match(/<input[^>]+(?:name="canary"|id="canary")[^>]+value="([^"]+)"/i) ||
      html.match(/<input[^>]+value="([^"]+)"[^>]+(?:name="canary"|id="canary")/i) ||
      html.match(/name="canary"\s+value="([^"]+)"/i);
    if (formCanaryMatch && formCanaryMatch[1]) {
      formCanary = decode(formCanaryMatch[1]);
    }

    const canary = formCanary || apiCanary;
    const aliasSet = new Set();
    let primaryAlias = null;

    // 3. Extract structured aliases from ServerData / t0 / $Config JSON blocks
    const jsonMatches = [
      html.match(/var\s+t0\s*=\s*({[\s\S]*?});\s*(?:var|<\/script>|\n)/i),
      html.match(/var\s+ServerData\s*=\s*({[\s\S]*?});\s*(?:var|<\/script>|\n)/i),
      html.match(/var\s+\$Config\s*=\s*({[\s\S]*?});\s*(?:var|<\/script>|\n)/i)
    ];

    for (const m of jsonMatches) {
      if (m && m[1]) {
        try {
          const parsed = JSON.parse(m[1]);
          const wlx = parsed?.WLXAccount || parsed;

          // Check mxAliases objects for explicit primary markers
          if (wlx?.manageNames?.mxAliases && Array.isArray(wlx.manageNames.mxAliases)) {
            for (const item of wlx.manageNames.mxAliases) {
              const val = typeof item === "string" ? item : (item?.name || item?.email || item?.aliasName || item?.displayName || String(item || ""));
              const clean = normalizeEmail(val);
              if (clean && clean.includes("@")) {
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
              if (clean && clean.includes("@")) aliasSet.add(clean);
            }
          }

          if (wlx?.manageNames?.primaryAlias) {
            const mem = normalizeEmail(String(wlx.manageNames.primaryAlias));
            if (mem && mem.includes("@")) {
              primaryAlias = mem;
              aliasSet.add(mem);
            }
          }

          if (wlx?.accountManagement?.membername) {
            const mem = normalizeEmail(String(wlx.accountManagement.membername));
            if (mem && mem.includes("@")) {
              if (!primaryAlias) primaryAlias = mem;
              aliasSet.add(mem);
            }
          }
        } catch (_) {}
      }
    }

    // 4. HTML table action links extraction
    const linkMatches = html.match(/aliasName=([^&"'>\s]+)/gi);
    if (linkMatches) {
      for (const lm of linkMatches) {
        const val = decodeURIComponent(lm.replace(/aliasName=/i, "")).trim().toLowerCase();
        const clean = normalizeEmail(val);
        if (clean && clean.includes("@") && !clean.includes("<") && !clean.includes(">")) {
          aliasSet.add(clean);
        }
      }
    }

    // 5. Multi-language primary alias HTML matching (English, German, French, Spanish, Portuguese, Vietnamese)
    if (!primaryAlias) {
      const primaryMatch =
        html.match(/id="c_membername"[^>]*>([^<]+)</i) ||
        html.match(/class="[^"]*c_membername[^"]*"[^>]*>([^<]+)</i) ||
        html.match(/class="[^"]*primary[^"]*"[^>]*>([^<@]+@[^<]+)</i) ||
        html.match(/(?:Primary alias|Bí danh chính|Alias principal|Primärer Alias|Hauptalias|Adresse principale)[^<]*<\/td>[\s\S]*?<td>([^<@]+@[^<]+)/i) ||
        html.match(/<td>([^<@]+@[^<]+)<\/td>[\s\S]*?(?:Primary alias|Bí danh chính|Alias principal|Primärer Alias|Hauptalias)/i);

      if (primaryMatch && primaryMatch[1]) {
        const found = normalizeEmail(primaryMatch[1]);
        if (found && found.includes("@")) {
          primaryAlias = found;
          aliasSet.add(found);
        }
      }
    }

    const normalizedAliases = Array.from(aliasSet);

    return {
      aliases: normalizedAliases,
      canary,
      formCanary: formCanary || canary,
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
