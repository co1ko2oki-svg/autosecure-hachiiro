const crypto = require("crypto");

/**
 * Signs out from all devices via Microsoft's DeleteDevices API.
 * 
 * @param {HttpClient} axios 
 * @param {string} canary - Canary token from the current session
 */
module.exports = async (axios, canary) => {
    const uaid = crypto.randomBytes(16).toString("hex");

    const payload = {
        uiflvr: 1001,
        uaid,
        scid: 100109,
        hpgid: 201030
    };

    const headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
    };

    if (canary) {
        headers["canary"] = canary;
    }

    try {
        const { data, status } = await axios.post(
            `https://account.live.com/API/Proofs/DeleteDevices`,
            JSON.stringify(payload),
            { headers }
        );

        if (status >= 200 && status < 300 && data && typeof data === "object") {
            if (data.apiCanary || data.success === true || !data.error) {
                return true;
            }
        }

        return false;
    } catch (err) {
        console.error(`[SIGNOUT] DeleteDevices request failed:`, err.message);
        return false;
    }
};