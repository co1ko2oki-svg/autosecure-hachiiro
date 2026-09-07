const axios = require('axios');
const { fetchPlayerData } = require('./fetchPlayerData');
const { getCachedUUID, setCachedUUID, deduplicateRequest, httpsAgent } = require('./hypixelCache');

module.exports = async (username) => {
  if (!username) return null;
  const cleanName = username.trim();

  // 1. Check memory cache first (instant return, 0ms latency)
  const cached = getCachedUUID(cleanName);
  if (cached) {
    return cached;
  }

  // 2. Coalesce concurrent requests for the same username
  return deduplicateRequest(`uuid:${cleanName.toLowerCase()}`, async () => {
    // Re-check cache in case another coalesced request just populated it
    const doubleCheck = getCachedUUID(cleanName);
    if (doubleCheck) return doubleCheck;

    try {
      let uuid = null;

      // Mojang API
      try {
        const res1 = await axios({
          url: `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanName)}`,
          method: "get",
          maxRedirects: 0,
          timeout: 5000,
          httpsAgent,
          validateStatus: status => status >= 200 && status < 510,
        });
        uuid = res1?.data?.id || null;
      } catch (err) {
        uuid = null;
      }

      // PlayerDB fallback
      if (!uuid) {
        try {
          const res2 = await axios({
            url: `https://playerdb.co/api/player/minecraft/${encodeURIComponent(cleanName)}`,
            method: "get",
            timeout: 5000,
            httpsAgent,
            validateStatus: status => status >= 200 && status < 510,
          });
          if (res2?.data?.code === "player.found" && res2.data?.data?.player?.raw_id) {
            uuid = res2.data.data.player.raw_id;
          }
        } catch (err) {
          uuid = null;
        }
      }

      // Third fallback: fetchPlayerData
      if (!uuid) {
        try {
          const playerData = await fetchPlayerData(cleanName);
          if (playerData?.uuid) {
            uuid = playerData.uuid;
          }
        } catch (err) {
          uuid = null;
        }
      }

      if (uuid) {
        setCachedUUID(cleanName, uuid);
      }

      return uuid || null;
    } catch {
      return null;
    }
  });
};

