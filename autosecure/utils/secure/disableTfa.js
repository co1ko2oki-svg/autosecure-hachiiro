module.exports = async (axios, apiCanary = null) => {
    try {
        const headers = {
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json; charset=utf-8"
        };
        if (apiCanary) {
            headers["canary"] = apiCanary;
        }

        const { data } = await axios.post(
            `https://account.live.com/API/Proofs/DisableTfa`,
            JSON.stringify({
                uiflvr: 1001,
                uaid: "9b699236f4e94df58a700330b45a9b6b",
                scid: 100109,
                hpgid: 201030
            }),
            { headers }
        );

        if (data?.apiCanary) {
            console.log('[disableTfa] 2FA successfully disabled.');
            return true;
        }
        return false;
    } catch (err) {
        console.error('[disableTfa] Error disabling 2FA:', err.message);
        return false;
    }
};
