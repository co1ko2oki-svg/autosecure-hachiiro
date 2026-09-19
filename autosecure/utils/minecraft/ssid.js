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

        if (d && JSON.stringify(extractSSID?.data || '').includes("/authentication/login_with_xbox")) {
            console.log("/authentication/login_with_xbox found in response");
            return "u should probably chill with the spam";
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
                console.log('Client ID may be blocked');
            }
            if (err?.response?.data) {
                console.log('Error data:', err.response.data);
            }
        }

        if (extractSSID2?.data?.access_token) {
            return extractSSID2.data.access_token;
        }

    } catch (e) {
        console.log("Catch in getSSID:", e?.message || e);
    }

    return null;
};
