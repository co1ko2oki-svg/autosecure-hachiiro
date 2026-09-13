const crypto = require("crypto");
const { getSecurityProofsRaw } = require("../secure/securityInformation");

/**
 * Revokes all Windows Hello / FIDO2 sign-in methods.
 *
 * @param {HttpClient} axios
 * @param {string|null} canary - Canary token from the current session (optional, will be fetched if missing)
 * @returns {Promise<boolean>}
 */
module.exports = async (axios, canary = null) => {
    const uaid = crypto.randomBytes(16).toString("hex");

    // Obtain a fresh canary if none provided
    let effectiveCanary = canary;
    if (!effectiveCanary) {
        try {
            const proofs = await getSecurityProofsRaw(axios);
            effectiveCanary = proofs?.canary || null;
        } catch (_) {}
    }

    const payload = {
        uiflvr: 1001,
        uaid,
        scid: 100109,
        hpgid: 201030
    };

    const headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
        Accept: "application/json"
    };

    if (effectiveCanary) {
        headers["canary"] = effectiveCanary;
    }

    try {
        const { data, status } = await axios.post(
            "https://account.live.com/API/Proofs/RevokeWindowsHelloProofs",
            payload,
            {
                headers,
                validateStatus: (s) => s >= 200 && s < 500
            }
        );

        if (status >= 200 && status < 300 && data && typeof data === "object") {
            if (data.apiCanary || data.success === true || !data.error) {
                console.log("[RESET_WINDOWS_HELLO] Successfully revoked Windows Hello proofs.");
                return true;
            }
        }

        const errorCode = data?.error?.code || data?.errorCode;
        console.log(`[RESET_WINDOWS_HELLO] Revoke failed: HTTP ${status}${errorCode ? ` error=${errorCode}` : ""}`);
        return false;
    } catch (err) {
        console.error("[RESET_WINDOWS_HELLO] RevokeWindowsHelloProofs request failed:", err.message);
        return false;
    }
};