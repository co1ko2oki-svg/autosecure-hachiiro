const HttpClient = require('../process/HttpClient');

module.exports = async (xbl, d = false) => {
    if (!xbl || typeof xbl !== 'string') return null;

    try {
        let axios = new HttpClient();
        
        // Attempt 1: Standard payload
        let extractSSID;
        try {
            extractSSID = await axios.post("https://api.minecraftservices.com/authentication/login_with_xbox", {
                identityToken: xbl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
        } catch (err) {
            extractSSID = err.response || {};
            if (err?.response?.status === 403) {
                console.log('Client ID may be blocked');
            }
            if (err?.response?.data) {
                console.log('Error data:', err.response.data);
            }
        }

        if (extractSSID?.data?.access_token) {
            return extractSSID.data.access_token;
        }

        // Attempt 2: ensureLegacyEnabled fallback
        let extractSSID2;
        try {
            extractSSID2 = await axios.post("https://api.minecraftservices.com/authentication/login_with_xbox", {
                identityToken: xbl,
                ensureLegacyEnabled: true
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
        } catch (err) {
            extractSSID2 = err.response || {};
            if (err?.response?.status === 403) {
                console.log('[SSID] Proxied attempt received 403, will attempt direct connection');
            }
        }

        if (extractSSID2?.data?.access_token) {
            return extractSSID2.data.access_token;
        }

        // Attempt 3: Direct connection fallback (bypassing proxy in case proxy IP is blocked by Cloudflare/Mojang)
        try {
            console.log('[SSID] Attempting direct connection fallback without proxy...');
            const directAxios = new HttpClient(false);
            const directRes = await directAxios.post("https://api.minecraftservices.com/authentication/login_with_xbox", {
                identityToken: xbl,
                ensureLegacyEnabled: true
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (directRes?.data?.access_token) {
                console.log('[SSID] Direct fallback successfully retrieved access_token!');
                return directRes.data.access_token;
            }
        } catch (directErr) {
            console.log('[SSID] Direct fallback failed:', directErr?.message || directErr);
        }

    } catch (e) {
        console.log("[SSID] Unexpected error in getSSID:", e?.message || e);
    }

    return null;
};
