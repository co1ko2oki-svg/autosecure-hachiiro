const axios = require("axios");
const crypto = require("crypto");

module.exports = async (host, amsc) => {
    try {
        const ct = Math.floor(Date.now() / 1000);
        const uaid = crypto.randomBytes(16).toString("hex");
        let data = await axios({
            method: "GET",
            url: `https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=21&ct=${ct}&rver=7.5.2156.0&wp=SA_20MIN&wreply=https://account.live.com/proofs/Add?apt=2&uaid=${uaid}&lc=1033&id=38936&mkt=en-US&uaid=${uaid}`,
            headers: {
                cookie: `__Host-MSAAUTH=${host}; __Host-MSAAUTHP=${host}; amsc=${amsc}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
            },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 500,
            timeout: 15000 // 15 second timeout
        })


    if (data.data.includes("Abuse")) {
        return `locked`
    } else if (data.data.includes("working to restore all services")) {
        return `down`
    }
    let polishedHost = null;
    let polishedHostP = null;
    if (data.headers && data.headers["set-cookie"]) {
        data.headers["set-cookie"].forEach((cookie) => {
            const [rawName, ...values] = cookie.split("=");
            const name = (rawName || '').trim();
            const val = values.join("=").split(";").shift().trim();
            if (name === "__Host-MSAAUTH") {
                polishedHost = val;
            } else if (name === "__Host-MSAAUTHP") {
                polishedHostP = val;
            } else if (name === "MSAAUTH" && !polishedHost) {
                polishedHost = val;
            }
        });
    }
    if (!polishedHost && polishedHostP) {
        polishedHost = polishedHostP;
    }
    return polishedHost || host;
    } catch (error) {
        console.log(`[POLISHHOST] Error occurred:`, error.message);
        
        if (error.response) {
            console.log(`[POLISHHOST] Response status:`, error.response.status);
            if (error.response.status === 400) {
                console.log(`[POLISHHOST] HTTP 400 - Invalid host or session expired`);
                throw new Error('Invalid host or session expired');
            }
            if (error.response.status >= 500) {
                console.log(`[POLISHHOST] Server error - Microsoft services may be down`);
                return 'down';
            }
        }
        
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            console.log(`[POLISHHOST] Network timeout or connection reset - falling back to original host`);
            return host;
        }
        
        // For other errors, return the original host
        console.log(`[POLISHHOST] Returning original host due to error`);
        return host;
    }
}