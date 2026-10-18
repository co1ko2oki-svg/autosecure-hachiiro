const crypto = require('crypto');
const HttpClient = require('../process/HttpClient');

function isGamepassKeyword(str) {
  if (!str || typeof str !== 'string') return false;
  return /(game_?pass|xgp|xgpu|xbox_game_pass|pc_game_pass|subscription)/i.test(str);
}

function isPurchaseSource(str) {
  if (!str || typeof str !== 'string') return false;
  const upper = str.toUpperCase();
  if (isGamepassKeyword(upper)) return false;
  return (
    upper === 'PURCHASE' ||
    upper === 'MC_PURCHASE' ||
    upper === 'RETAIL' ||
    upper === 'MOJANG' ||
    upper === 'EXTERNAL' ||
    upper === 'SINGLE' ||
    upper === 'BONUS' ||
    upper === 'PROMOTION'
  );
}

module.exports = async (ssid) => {
  let mc = { 
    source: null, 
    name: null, 
    uuid: null, 
    capes: [], 
    skins: null, 
    ssid: ssid, 
    items: [] 
  };

  if (!ssid || typeof ssid !== 'string') {
    return mc;
  }

  const axios = new HttpClient();

  // Helper function to fetch with proxy, and fallback to direct connection on error
  async function fetchWithFallback(url, headers) {
    try {
      return await axios.get(url, { headers });
    } catch (err) {
      if (err?.response?.status >= 400 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        console.log(`[PROFILE] Proxy failed for ${url}, retrying direct...`);
        return await axios.get(url, { headers, _noProxy: true }).catch(e => {
            console.log(`[PROFILE] Direct fallback also failed:`, e?.message);
            throw e;
        });
      }
      throw err;
    }
  }

  // 1. Fetch Minecraft Java Profile (names and capes)
  let hasJavaProfile = false;
  try {
    const profileRes = await fetchWithFallback(
      `https://api.minecraftservices.com/minecraft/profile`,
      {
        Authorization: `Bearer ${ssid}`,
        Accept: 'application/json'
      }
    );

    const data = profileRes?.data;
    if (data && data.name && data.id) {
      mc.name = data.name;
      mc.uuid = data.id;
      mc.skins = data.skins || null;

      let capes = [];
      if (Array.isArray(data.capes)) {
        capes = data.capes
          .filter(cape => cape && (cape.alias || cape.state === 'ACTIVE' || cape.id))
          .map(cape => cape.alias || cape.state || cape.id);
      }
      mc.capes = capes;
      hasJavaProfile = true;
    }
  } catch (err) {
    console.log('[PROFILE] Error fetching Minecraft profile:', err?.message || err);
  }

  // 2. Fetch Entitlements concurrently: Both mcstore AND license
  const [mcstoreResult, licenseResult] = await Promise.allSettled([
    fetchWithFallback(
      `https://api.minecraftservices.com/entitlements/mcstore`,
      {
        Authorization: `Bearer ${ssid}`,
        Accept: 'application/json'
      }
    ),
    fetchWithFallback(
      `https://api.minecraftservices.com/entitlements/license?requestId=${crypto.randomUUID()}`,
      {
        Authorization: `Bearer ${ssid}`,
        Accept: 'application/json'
      }
    )
  ]);

  const rawStoreItems = mcstoreResult.status === 'fulfilled' && Array.isArray(mcstoreResult.value?.data?.items)
    ? mcstoreResult.value.data.items
    : [];

  const rawLicenseItems = licenseResult.status === 'fulfilled' && Array.isArray(licenseResult.value?.data?.items)
    ? licenseResult.value.data.items
    : [];

  let hasGamepass = false;
  let hasJavaPurchased = false;
  let hasJavaEntitlement = false;

  const seenGames = new Map();

  function addSeenGame(prettyName, source) {
    if (seenGames.has(prettyName)) {
      const existing = seenGames.get(prettyName);
      if (isPurchaseSource(source) && !isPurchaseSource(existing.source)) {
        seenGames.set(prettyName, { name: prettyName, source: source });
      }
    } else {
      seenGames.set(prettyName, { name: prettyName, source: source });
    }
  }

  // Inspect license items (contains item name and acquisition source)
  for (const item of rawLicenseItems) {
    if (!item) continue;
    const nameLower = (item.name || "").toLowerCase();
    const sourceUpper = (item.source || "").toUpperCase();
    const baseName = nameLower.replace(/^product_/, '').replace(/^game_/, '');

    if (isGamepassKeyword(sourceUpper) || isGamepassKeyword(nameLower)) {
      hasGamepass = true;
    }

    let prettyName = null;
    if (baseName === 'minecraft' || nameLower === 'product_minecraft' || nameLower === 'game_minecraft') {
      prettyName = 'Minecraft Java';
      hasJavaEntitlement = true;
      if (isPurchaseSource(sourceUpper)) {
        hasJavaPurchased = true;
      } else if (isGamepassKeyword(sourceUpper)) {
        hasGamepass = true;
      }
    } else if (baseName === 'minecraft_bedrock' || nameLower.includes('bedrock')) {
      prettyName = 'Minecraft Bedrock';
    } else if (baseName === 'dungeons' || nameLower.includes('dungeon')) {
      prettyName = 'Minecraft Dungeons';
    } else if (baseName === 'legends' || nameLower.includes('legend')) {
      prettyName = 'Minecraft Legends';
    } else if (isGamepassKeyword(nameLower)) {
      prettyName = 'Xbox Game Pass';
    }

    if (prettyName) {
      addSeenGame(prettyName, item.source || (isGamepassKeyword(nameLower) ? "GAMEPASS" : "PURCHASE"));
    }
  }

  // Inspect mcstore items (contains item name and signature)
  for (const item of rawStoreItems) {
    if (!item) continue;
    const nameLower = (item.name || "").toLowerCase();
    const baseName = nameLower.replace(/^product_/, '').replace(/^game_/, '');

    if (isGamepassKeyword(nameLower)) {
      hasGamepass = true;
      addSeenGame('Xbox Game Pass', 'GAMEPASS');
    }

    let prettyName = null;
    if (baseName === 'minecraft' || nameLower === 'product_minecraft' || nameLower === 'game_minecraft') {
      prettyName = 'Minecraft Java';
      hasJavaEntitlement = true;
    } else if (baseName === 'minecraft_bedrock' || nameLower.includes('bedrock')) {
      prettyName = 'Minecraft Bedrock';
    } else if (baseName === 'dungeons' || nameLower.includes('dungeon')) {
      prettyName = 'Minecraft Dungeons';
    } else if (baseName === 'legends' || nameLower.includes('legend')) {
      prettyName = 'Minecraft Legends';
    }

    if (prettyName && !seenGames.has(prettyName)) {
      addSeenGame(prettyName, hasGamepass ? 'GAMEPASS' : 'PURCHASE');
    }
  }

  // Authoritative determination of Minecraft status
  if (hasJavaPurchased) {
    // Explicit permanent purchase verified from license endpoint
    mc.source = "Purchased";
  } else if (hasGamepass) {
    // Explicit Game Pass subscription detected, without permanent Java purchase
    mc.source = "Gamepass";
  } else if (hasJavaEntitlement) {
    // Java entitlement in store/license without Game Pass indicators
    mc.source = "Purchased";
  } else if (hasJavaProfile) {
    // Player has a Java profile (IGN), but NO permanent Java purchase entitlement was returned.
    const storeFulfilled = mcstoreResult.status === 'fulfilled';
    const licenseFulfilled = licenseResult.status === 'fulfilled';
    if (!storeFulfilled && !licenseFulfilled) {
      // Both endpoints errored out (network outage), fallback to Purchased
      mc.source = "Purchased";
    } else {
      // Entitlement endpoints responded successfully with no permanent purchase license.
      // The account accessed Minecraft via Game Pass subscription.
      mc.source = "Gamepass";
    }
  } else {
    // No Java profile and no Java entitlement
    mc.source = "No Minecraft!";
  }

  // Ensure Minecraft Java is in mc.items if Java profile or Java entitlement exists
  if (hasJavaProfile || hasJavaEntitlement || hasJavaPurchased || (hasGamepass && mc.name)) {
    const javaItemSource = mc.source === "Gamepass" ? "GAMEPASS" : "PURCHASE";
    seenGames.set('Minecraft Java', { name: 'Minecraft Java', source: javaItemSource });
  }

  if (hasGamepass && !seenGames.has('Xbox Game Pass')) {
    seenGames.set('Xbox Game Pass', { name: 'Xbox Game Pass', source: 'GAMEPASS' });
  }

  mc.items = Array.from(seenGames.values());
  return mc;
};
