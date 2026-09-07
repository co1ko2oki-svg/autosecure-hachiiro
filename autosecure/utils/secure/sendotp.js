const HttpClient = require("../process/HttpClient");

async function sendotp(email, secId) {
    try {
        const client = new HttpClient();
        
        // Step 1: Establish fresh Microsoft session & extract PPFT
        const loginPage = await client.get("https://login.live.com/login.srf");
        
        let ppft = null;
        const html = loginPage.data || "";
        const match = html.match(/var ServerData = ({.*?});/s);
        if (match) {
            try {
                const serverData = JSON.parse(match[1]);
                ppft = serverData.sFT || serverData.sFTTag?.match(/value="([^"]*)"/)?.[1];
            } catch (e) {}
        }
        if (!ppft) {
            ppft = html.match(/name="PPFT"[^>]*value="([^"]*)"/)?.[1];
        }

        if (!ppft) {
            console.error("[SEND_OTP] Failed to extract initial PPFT from login.srf");
            return false;
        }

        // Step 2: Query GetCredentialType to obtain authoritative flowToken & discover proofs
        let flowToken = ppft;
        let selectedProofId = secId;

        try {
            const credsRes = await client.post("https://login.live.com/GetCredentialType.srf", {
                username: email,
                flowToken: ppft,
                checkPhones: false,
                forceotclogin: false,
                federationFlags: 3,
                isOtherIdpSupported: true,
                isRemoteNGCSupported: true,
                isFidoSupported: true,
                isCookieBannerShown: false,
                isExternalFederationDisallowed: false,
                otclogindisallowed: false,
                isSignup: false,
                country: "US",
                isAccessPassSupported: true
            }, {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Accept": "application/json",
                    "Referer": "https://login.live.com/login.srf",
                    "Origin": "https://login.live.com",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            if (credsRes?.data?.FlowToken) {
                flowToken = credsRes.data.FlowToken;
            }

            const proofs = credsRes?.data?.Credentials?.OtcLoginEligibleProofs;
            if (Array.isArray(proofs) && proofs.length > 0) {
                // If provided secId is found or use first eligible email proof
                const matchedProof = proofs.find(p => p.data === secId || p.type === 1) || proofs[0];
                if (matchedProof?.data) {
                    selectedProofId = matchedProof.data;
                    console.log(`[SEND_OTP] Targeting verified proof: ${matchedProof.display || "Email"}`);
                }
            }
        } catch (credErr) {
            console.error("[SEND_OTP] GetCredentialType note:", credErr.message);
        }

        // Step 3: Trigger One-Time Code delivery via GetOneTimeCode.srf
        const postData = `login=${encodeURIComponent(email)}&flowtoken=${encodeURIComponent(flowToken)}&purpose=eOTT_OtcLogin&channel=Email&AltEmailE=${encodeURIComponent(selectedProofId)}`;

        const otcResponse = await client.post(
            "https://login.live.com/GetOneTimeCode.srf",
            postData,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://login.live.com/login.srf",
                    "Origin": "https://login.live.com",
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json, text/javascript, */*; q=0.01"
                }
            }
        );

        const resData = otcResponse?.data;
        const resState = typeof resData === "object" ? resData?.State : null;
        console.log(`[SEND_OTP] Microsoft GetOneTimeCode response: status=${otcResponse?.status}, State=${resState}`);

        // State 206 or 200 or returned FlowToken indicates successful code dispatch
        if (resState === 206 || resState === 200 || resData?.FlowToken) {
            console.log(`[SEND_OTP] [✔] Microsoft confirmed: Verification code sent successfully!`);
            return true;
        }

        // Fallback check: if status is 200 but state is unexpected
        if (otcResponse?.status === 200) {
            console.log(`[SEND_OTP] [✔] HTTP 200 received for OTP request.`);
            return true;
        }

        console.error(`[SEND_OTP] [X] Microsoft did not confirm OTP dispatch (State: ${resState})`);
        return false;
    } catch (error) {
        console.error('[SEND_OTP] Error sending code:', error.message);
        return false;
    }
}

module.exports = sendotp;