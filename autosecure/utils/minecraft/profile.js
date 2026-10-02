const crypto = require('crypto');
const HttpClient = require('../process/HttpClient');

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

  // 1. Check Minecraft Java Profile first (Most reliable check for Java Edition)
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
      mc.source = "Purchased"; // Default if Java profile exists
    }
  } catch (err) {
    console.log('[PROFILE] Error fetching Minecraft profile:', err?.message || err);
  }

  // 2. Check Primary Ownership via mcstore
  let hasJavaEntitlement = false;
  let javaSource = null;
  let useFallback = false;

  try {
    const mcstoreRes = await fetchWithFallback(
      `https://api.minecraftservices.com/entitlements/mcstore`,
      {
        Authorization: `Bearer ${ssid}`,
        Accept: 'application/json'
      }
    );

    if (mcstoreRes?.data?.items && Array.isArray(mcstoreRes.data.items) && mcstoreRes.data.items.length > 0) {
      for (let item of mcstoreRes.data.items) {
        const nameLower = (item.name || "").toLowerCase();
        if (nameLower === 'product_minecraft' || nameLower === 'game_minecraft') {
          hasJavaEntitlement = true;
          javaSource = "Purchased";
        }
      }
    } else {
      useFallback = true;
    }
  } catch (err) {
    console.log('[PROFILE] Error fetching mcstore entitlements:', err?.message || err);
    useFallback = true;
  }

  // 3. Check Entitlements / License specifically for Java Edition (Fallback)
  if (useFallback) {
    try {
      const licenses = await fetchWithFallback(
        `https://api.minecraftservices.com/entitlements/license?requestId=${crypto.randomUUID()}`,
        {
          Authorization: `Bearer ${ssid}`,
          Accept: 'application/json'
        }
      );

      let rawItems = [];
      if (licenses?.data?.items && Array.isArray(licenses.data.items)) {
        rawItems = licenses.data.items;
      }

      const seen = new Map();

      for (let item of rawItems) {
        const nameLower = (item.name || "").toLowerCase();
        const sourceUpper = (item.source || "").toUpperCase();
        let baseName = nameLower.replace(/^product_/, '').replace(/^game_/, '');

        let prettyName;
        if (baseName === 'minecraft') {
          prettyName = 'Minecraft Java';
        } else if (baseName === 'minecraft_bedrock') {
          prettyName = 'Minecraft Bedrock';
        } else {
          prettyName = baseName.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }

        if (seen.has(prettyName)) {
          const existing = seen.get(prettyName);
          if (existing.source === 'PURCHASE' && item.source === 'MC_PURCHASE') {
            seen.set(prettyName, { name: prettyName, source: item.source });
          }
        } else {
          seen.set(prettyName, { name: prettyName, source: item.source });
        }

        // STRICT JAVA CHECK: Only match Minecraft Java Edition
        // Exclude bedrock, dungeons, legends
        if (baseName === 'minecraft' || nameLower === 'product_minecraft' || nameLower === 'game_minecraft') {
          hasJavaEntitlement = true;
          if (
            sourceUpper.includes("GAMEPASS") || 
            sourceUpper.includes("XGP") || 
            nameLower.includes("game_pass") || 
            nameLower.includes("gamepass")
          ) {
            javaSource = "Gamepass";
          } else {
            javaSource = "Purchased";
          }
        }
      }

      mc.items = Array.from(seen.values());
    } catch (err) {
      console.log('[PROFILE] Error fetching licenses:', err?.message || err);
    }
  }

  // If account has Java profile or Java entitlement:
  if (mc.name || hasJavaEntitlement) {
    mc.source = javaSource || mc.source || "Purchased";
  } else {
    // Account does NOT own Java Edition (e.g. Bedrock only, Dungeons only, or no Minecraft)
    mc.source = "No Minecraft!";
  }

  // If Java profile doesn't exist and no Java entitlement found, ensure source is "No Minecraft!"
  if (!mc.name && mc.source !== "Purchased" && mc.source !== "Gamepass") {
    mc.source = "No Minecraft!";
  }

  return mc;
};
