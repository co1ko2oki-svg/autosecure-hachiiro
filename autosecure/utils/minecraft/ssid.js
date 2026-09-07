const HttpClient = require('../process/HttpClient');

module.exports = async (xbl, d = false) => {
    if (!xbl || typeof xbl !== 'string') return null;

    try {
        let axios = new HttpClient();
        
        // Attempt 1: Standard WEB platform
        let extractSSID = await axios.post("https://api.minecraftservices.com/authentication/login_with_xbox", {
            identityToken: xbl,
            ensureLegacyEnabled: true,
            platform: "WEB"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (extractSSID?.data?.access_token) {
            return extractSSID.data.access_token;
        }

        if (d && JSON.stringify(extractSSID?.data || '').includes("/authentication/login_with_xbox")) {
            console.log("/authentication/login_with_xbox found in response");
            return "u should probably chill with the spam";
        }

        // Attempt 2: PC_LAUNCHER platform fallback
        let extractSSID2 = await axios.post("https://api.minecraftservices.com/authentication/login_with_xbox", {
            identityToken: xbl,
            ensureLegacyEnabled: true,
            platform: "PC_LAUNCHER"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (extractSSID2?.data?.access_token) {
            return extractSSID2.data.access_token;
        }

        // Attempt 3: Direct identity token payload
        let extractSSID3 = await axios.post("https://api.minecraftservices.com/authentication/login_with_xbox", {
            identityToken: xbl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (extractSSID3?.data?.access_token) {
            return extractSSID3.data.access_token;
        }

    } catch (e) {
        console.log("Catch in getSSID:", e?.message || e);
    }

    return null;
};
