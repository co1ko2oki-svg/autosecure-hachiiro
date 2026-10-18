/**
 * Minecraft Game Ownership and Entitlements Formatter
 * Analyzes account items and profile to extract all owned games (Java, Bedrock, Dungeons, Legends, Game Pass).
 */

const checkmc = require("../../../db/checkmc");

function isValidMinecraftUsername(name) {
  if (!name || typeof name !== "string") return false;
  const invalidKeywords = [
    "couldn't find!",
    "couldn't change!",
    "no minecraft!",
    "xbl failed",
    "none",
    "unknown",
    "failed",
    "false",
    "null",
    "undefined",
    "no minecraft profile",
    "no xbox profile [1]",
    "no xbox profile [2]"
  ];
  if (invalidKeywords.includes(name.trim().toLowerCase())) return false;
  return /^[a-zA-Z0-9_]{2,16}$/.test(name.trim());
}

/**
 * Checks if an account owns Minecraft (Java, Bedrock, or Game Pass).
 * @param {object} acc - The account object
 * @returns {boolean}
 */
function hasMinecraft(acc) {
  if (!acc) return false;

  // 0. Explicit negative checks first (highest priority)
  if (acc.hasmc === false || acc.hasmc === 0 || acc.hasmc === "0" || acc.hasmc === "false") return false;
  if (acc.ownsmc === "No Minecraft!" || acc.ownsmc === "No") return false;
  if (acc.mc === "No Minecraft!" || acc.mc === "No" || acc.mc === "XBL Failed") return false;
  if (acc.newName === "No Minecraft!" && (!acc.mc || acc.mc === "No Minecraft!")) return false;

  // 1. Direct checkmc check on acc.mc
  if (acc.mc && checkmc(acc.mc)) return true;
  if (acc.ownsmc && checkmc(acc.ownsmc)) return true;

  // 2. Boolean or integer flag hasmc
  if (acc.hasmc === true || acc.hasmc === 1 || acc.hasmc === "1" || acc.hasmc === "true") return true;

  // 3. Entitlements list inspection
  const items = extractItems(acc);
  if (items.some((i) => {
    const nameLower = (typeof i === "string" ? i : (i?.name || "")).toLowerCase();
    return nameLower.includes("minecraft") || nameLower.includes("game_pass") || nameLower.includes("gamepass");
  })) {
    return true;
  }

  // 4. Verified Java username only if not Gamertag
  if (acc.newName && isValidMinecraftUsername(acc.newName) && acc.newName !== acc.gamertag && acc.newName !== "No Minecraft!") {
    return true;
  }

  return false;
}

/**
 * Extracts items array safely from various locations on the account object.
 */
function extractItems(acc) {
  if (!acc) return [];
  if (Array.isArray(acc.items) && acc.items.length > 0) return acc.items;
  if (Array.isArray(acc.mcitems) && acc.mcitems.length > 0) return acc.mcitems;

  if (typeof acc.mcitems === "string" && acc.mcitems.startsWith("[")) {
    try {
      return JSON.parse(acc.mcitems);
    } catch (e) {}
  }

  if (acc.extra?.mcitems) {
    try {
      return typeof acc.extra.mcitems === "string" ? JSON.parse(acc.extra.mcitems) : acc.extra.mcitems;
    } catch (e) {}
  }

  return [];
}

/**
 * Formats a clean, readable string of all games owned by the account.
 * Examples:
 * - "Minecraft Java, Minecraft Bedrock"
 * - "Minecraft Java, Minecraft Bedrock (Game Pass)"
 * - "Minecraft Java, Minecraft Bedrock, Minecraft Dungeons"
 * - "Minecraft Java"
 * - "No Minecraft!"
 * 
 * @param {object} acc - The account object
 * @returns {string}
 */
function formatOwnedGames(acc) {
  if (!acc) return "No Minecraft!";

  if (acc.hasmc === false || acc.hasmc === 0 || acc.hasmc === "0" || acc.hasmc === "false") return "No Minecraft!";
  if (acc.ownsmc === "No Minecraft!" || acc.ownsmc === "No") return "No Minecraft!";
  if (acc.mc === "No Minecraft!" || acc.mc === "No") return "No Minecraft!";

  const items = extractItems(acc);
  const gameNames = new Set();
  let isGamepass = false;

  for (const item of items) {
    const rawName = typeof item === "string" ? item : (item?.name || item?.title || "");
    const rawSource = typeof item === "object" ? String(item?.source || "").toUpperCase() : "";

    if (rawSource.includes("GAMEPASS") || rawSource.includes("XGP") || rawSource.includes("SUBSCRIPTION")) {
      isGamepass = true;
    }

    const clean = rawName.trim();
    if (!clean) continue;

    // Normalize game names
    const lower = clean.toLowerCase();

    // Check for Game Pass products/identifiers
    if (lower.includes("game_pass") || lower.includes("gamepass") || lower.includes("xgp") || lower.includes("xgpu")) {
      isGamepass = true;
      continue; // Skip adding Game Pass as a game title in the game list
    }

    if (lower === "minecraft" || lower === "minecraft java" || lower === "product_minecraft" || lower === "game_minecraft") {
      gameNames.add("Minecraft Java");
      if (rawSource.includes("GAMEPASS") || rawSource.includes("XGP") || rawSource.includes("SUBSCRIPTION")) {
        isGamepass = true;
      }
    } else if (lower.includes("bedrock")) {
      gameNames.add("Minecraft Bedrock");
    } else if (lower.includes("dungeon")) {
      gameNames.add("Minecraft Dungeons");
    } else if (lower.includes("legend")) {
      gameNames.add("Minecraft Legends");
    } else {
      gameNames.add(clean);
    }
  }

  // Check account flags for Game Pass
  if (
    acc.mc === "Gamepass" || 
    String(acc.mc).toLowerCase().includes("gamepass") ||
    acc.ownsmc === "Gamepass" || 
    String(acc.ownsmc).toLowerCase().includes("gamepass")
  ) {
    isGamepass = true;
  }

  // Check Microsoft Account subscriptions if available
  let subs = acc.subscriptions || acc.extra?.subscriptions || acc.subs;
  if (typeof subs === 'string' && (subs.startsWith('[') || subs.startsWith('{'))) {
    try { subs = JSON.parse(subs); } catch (e) {}
  }
  if (typeof subs === 'string' && (subs.startsWith('[') || subs.startsWith('{'))) {
    try { subs = JSON.parse(subs); } catch (e) {}
  }
  if (Array.isArray(subs)) {
    for (const sub of subs) {
      const subName = String(sub?.name || sub?.productName || "").toLowerCase();
      if (subName.includes("game pass") || subName.includes("gamepass") || subName.includes("xgp")) {
        // If no explicit permanent Java purchase exists in items
        const hasPermanentPurchase = items.some(i => {
          const s = String(i?.source || "").toUpperCase();
          const n = String(i?.name || "").toLowerCase();
          return (n.includes("minecraft") && !n.includes("bedrock") && !n.includes("dungeon") && !n.includes("legend")) &&
                 (s === "PURCHASE" || s === "MC_PURCHASE" || s === "RETAIL");
        });
        if (!hasPermanentPurchase) {
          isGamepass = true;
        }
      }
    }
  }

  // If the account has a verified Java username or Java source, ensure Minecraft Java is listed
  const ownsJava =
    (acc.hasmc === true || checkmc(acc.mc) || checkmc(acc.ownsmc)) &&
    (acc.mc === "Purchased" ||
     acc.mc === "Gamepass" ||
     acc.ownsmc === "Purchased" ||
     acc.ownsmc === "Gamepass" ||
     (acc.newName && isValidMinecraftUsername(acc.newName) && acc.newName !== acc.gamertag && acc.newName !== "No Minecraft!"));

  if (ownsJava && ![...gameNames].some((g) => g.toLowerCase().includes("java"))) {
    gameNames.add("Minecraft Java");
  }

  const list = Array.from(gameNames);

  // Sort: Java -> Bedrock -> Dungeons -> Legends -> Others
  list.sort((a, b) => {
    const rank = (name) => {
      const n = name.toLowerCase();
      if (n.includes("java")) return 1;
      if (n.includes("bedrock")) return 2;
      if (n.includes("dungeon")) return 3;
      if (n.includes("legend")) return 4;
      return 5;
    };
    return rank(a) - rank(b);
  });

  if (list.length === 0) {
    if (acc.mc && acc.mc !== "No Minecraft!" && checkmc(acc.mc)) {
      return isGamepass && !acc.mc.includes("Game Pass") ? `${acc.mc} (Game Pass)` : acc.mc;
    }
    if (acc.ownsmc && acc.ownsmc !== "No Minecraft!" && acc.ownsmc !== "No" && acc.ownsmc !== "Unknown" && checkmc(acc.ownsmc)) {
      return isGamepass && !acc.ownsmc.includes("Game Pass") ? `${acc.ownsmc} (Game Pass)` : acc.ownsmc;
    }
    return isGamepass ? "Minecraft Java (Game Pass)" : "No Minecraft!";
  }

  const gamesStr = list.join(", ");
  return isGamepass ? `${gamesStr} (Game Pass)` : gamesStr;
}

module.exports = {
  hasMinecraft,
  formatOwnedGames,
  isValidMinecraftUsername
};
