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
  if (acc.mc === "No Minecraft!" || acc.mc === "No") return false;

  // 1. Direct checkmc check on acc.mc
  if (acc.mc && checkmc(acc.mc)) return true;
  if (acc.ownsmc && checkmc(acc.ownsmc)) return true;

  // 2. Boolean or integer flag hasmc
  if (acc.hasmc === true || acc.hasmc === 1 || acc.hasmc === "1" || acc.hasmc === "true") return true;

  // 3. Valid Minecraft IGN in newName or oldName
  if (acc.newName && isValidMinecraftUsername(acc.newName)) return true;
  if (acc.oldName && isValidMinecraftUsername(acc.oldName)) return true;

  // 4. Entitlements list inspection
  const items = extractItems(acc);
  if (items.some((i) => {
    const nameLower = (typeof i === "string" ? i : (i?.name || "")).toLowerCase();
    return nameLower.includes("minecraft");
  })) {
    return true;
  }

  // 5. Fallback: check username (risky because it could just be an Xbox Gamertag)
  if (acc.username && isValidMinecraftUsername(acc.username)) return true;

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

    if (rawSource.includes("GAMEPASS") || rawSource.includes("XGP")) {
      isGamepass = true;
    }

    const clean = rawName.trim();
    if (!clean) continue;

    // Normalize game names
    const lower = clean.toLowerCase();
    if (lower === "minecraft" || lower === "minecraft java" || lower === "product_minecraft" || lower === "game_minecraft") {
      gameNames.add("Minecraft Java");
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

  // If the account has a verified Java username or Java source, ensure Minecraft Java is listed
  const ownsJava =
    isValidMinecraftUsername(acc.newName) ||
    isValidMinecraftUsername(acc.oldName) ||
    isValidMinecraftUsername(acc.username) ||
    acc.mc === "Purchased" ||
    acc.mc === "Gamepass";

  if (ownsJava && ![...gameNames].some((g) => g.toLowerCase().includes("java"))) {
    gameNames.add("Minecraft Java");
  }

  if (acc.mc === "Gamepass" || String(acc.mc).toLowerCase().includes("gamepass")) {
    isGamepass = true;
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
    if (acc.mc && acc.mc !== "No Minecraft!") {
      return acc.mc;
    }
    if (acc.ownsmc && acc.ownsmc !== "No Minecraft!" && acc.ownsmc !== "No" && acc.ownsmc !== "Unknown") {
      return acc.ownsmc;
    }
    return "No Minecraft!";
  }

  const gamesStr = list.join(", ");
  return isGamepass ? `${gamesStr} (Game Pass)` : gamesStr;
}

module.exports = {
  hasMinecraft,
  formatOwnedGames,
  isValidMinecraftUsername
};
