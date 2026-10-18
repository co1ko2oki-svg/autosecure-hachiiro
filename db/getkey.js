const { queryParams } = require("./database"); 
const config = require("../config.json");

let cachedApiKey = { key: null, expiresAt: 0 };

async function haslifetimekey() {
  if (process.env.HYPIXEL_API_KEY || (config.hypixelApiKey && String(config.hypixelApiKey).trim())) {
    return true;
  }
  try {
    const lifetime = await queryParams("SELECT apikey, time FROM apikey WHERE id = ?", [2]);

    if (Array.isArray(lifetime) && lifetime.length > 0 && lifetime[0].apikey) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error checking lifetime API key:", error);
    return false; 
  }
}

async function getHypixelApiKey(forceRefresh = false) {
    if (!forceRefresh && cachedApiKey.key && cachedApiKey.expiresAt > Date.now()) {
      return cachedApiKey.key;
    }

    let key = null;
    try {
      // 1. Direct configuration from process.env or config.json
      if (process.env.HYPIXEL_API_KEY && process.env.HYPIXEL_API_KEY.trim()) {
        key = process.env.HYPIXEL_API_KEY.trim();
      } else if (config.hypixelApiKey && String(config.hypixelApiKey).trim()) {
        key = String(config.hypixelApiKey).trim();
      }

      // 2. Database stored keys
      if (!key) {
        const hasLifetime = await haslifetimekey();
     
        if (hasLifetime) {
          const results2 = await queryParams("SELECT apikey, time FROM apikey WHERE id = ?", [2]);
          if (results2.length > 0 && results2[0].apikey) {
            key = results2[0].apikey;
          }
        }
     
        if (!key) {
          const results = await queryParams("SELECT apikey, time FROM apikey WHERE id = ?", [1]);
          if (results.length > 0 && results[0].apikey) {
            key = results[0].apikey;
          }
        }
      }

      if (key) {
        cachedApiKey = { key, expiresAt: Date.now() + 60000 }; // 60s cache
      }
    } catch (e) {
      console.error("Error fetching Hypixel API key from DB:", e);
    }
    
    return key;
}

function invalidateApiKeyCache() {
  cachedApiKey = { key: null, expiresAt: 0 };
}

module.exports = {
  getHypixelApiKey,
  haslifetimekey,
  invalidateApiKeyCache
};