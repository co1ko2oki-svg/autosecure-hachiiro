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

  // 1. Check Minecraft Java Profile first (Most reliable check for Java Edition)
  try {
    const profileRes = await axios.get(
      `https://api.minecraftservices.com/minecraft/profile`,
      {
        headers: {
          Authorization: `Bearer ${ssid}`,
          Accept: 'application/json'
        },
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

  // 2. Check Entitlements / License specifically for Java Edition
  try {
    const licenses = await axios.get(
      `https://api.minecraftservices.com/entitlements/license?requestId=c24114ab-1814-4d5c-9b1f-e8825edaec1f`,
      {
        headers: {
          Authorization: `Bearer ${ssid}`,
          Accept: 'application/json'
        },
      }
    );

    let rawItems = [];
    if (licenses?.data?.items && Array.isArray(licenses.data.items)) {
      rawItems = licenses.data.items;
    }

    const seen = new Map();
    let hasJavaEntitlement = false;
    let javaSource = null;

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

    // If account has Java profile or Java entitlement:
    if (mc.name || hasJavaEntitlement) {
      mc.source = javaSource || mc.source || "Purchased";
    } else {
      // Account does NOT own Java Edition (e.g. Bedrock only, Dungeons only, or no Minecraft)
      mc.source = "No Minecraft!";
    }
  } catch (err) {
    console.log('[PROFILE] Error fetching licenses:', err?.message || err);
  }

  // If Java profile doesn't exist and no Java entitlement found, ensure source is "No Minecraft!"
  if (!mc.name && mc.source !== "Purchased" && mc.source !== "Gamepass") {
    mc.source = "No Minecraft!";
  }

  return mc;
};
