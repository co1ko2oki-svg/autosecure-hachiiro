const decode = require("./decode");


module.exports = async function loginHelper(axios, d = false, repeat = 0, userid) {
    console.log(`Helping with login!`)
    let loginData;
    
    try {
        loginData = await axios.post("https://login.live.com/login.srf");
    } catch (error) {
        console.log(`[LOGINHELPER] Error making login request:`, error.message);
        if (error.response && error.response.status === 400) {
            console.log(`[LOGINHELPER] HTTP 400 - Invalid authentication data`);
            return "unauthed";
        }
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            console.log(`[LOGINHELPER] Network timeout during login`);
            return "unauthed";
        }
        throw error;
    }
    let link = loginData?.data?.match(/action="([^"]+)"/)?.[1]
if (link) {
    if (link.includes("child-consent") || link.includes("child-landing")){
        console.log(`Got child landing: ${link}`)
        return "child"
    }
    console.log(`Link: ${link}`);
    if (link.includes('/confirm')) {
        console.log(`Got the confirm issue: ${link}`);
    }


        /*
        Locked
        */
        if (link.includes("accrue")) {
            console.log("ACCRUE!!")
            if (repeat > 2) { return "unauthed" }
            let ipt = loginData.data.match(/<input[^>]+name=["']ipt["'][^>]+value=["']([^"']+)["']/)?.[1]

            const accrueData = await axios.post(link, `ipt=${ipt}`)

            let canary = accrueData.data.match(/<input[^>]+name=["']canary["'][^>]+value=["']([^"']+)["']/)?.[1] || decode(accrueData?.data?.match(/"sCanary":"([^"]*)"/)?.[1])

            if (canary) {
                await axios.post(link, `canary=${encodeURIComponent(canary)}`)
            } else {
                console.log(`No Canary`, ``)
                await axios.post(link)
            }
            return await loginHelper(axios, d, repeat + 1, userid)
        }


        /*
        Cancel Replacing Security
        */
        else if (link.includes("cancel")) {
            if (d){
                // getssid fix
                return "cancel"
            }
            console.log(`CANCEL!!`)
            let ipt = loginData.data.match(/<input[^>]+name=["']ipt["'][^>]+value=["']([^"']+)["']/)?.[1]

            await axios.post(link, `ipt=${ipt}`)
            return await loginHelper(axios, d, repeat + 1, userid)
        }


        /*
        Privacy Notice
        */
        else if (link.includes("privacynotice")) {
            if (repeat > 2) { return "unauthed" }
            console.log(`Got Privacy notice account!`)
            const correlationIdMatch = loginData.data.match(/name="correlation_id"[^>]+value="([^"]+)"/);
            const codeMatch = loginData.data.match(/name="code"[^>]+value="([^"]+)"/);
            const correlationId = correlationIdMatch?.[1] || null;
            const code = codeMatch?.[1] || null;

            if (code && correlationId) {
                const noticeData = await axios.post(link, `correlation_id=${correlationId}&code=${code}`)
                const regex = /ucis\.(\w+) = '([^']*)';/g;

                const uciData = {};
                let match;
                const encryptedPayload = noticeData.data?.match(/ucis\.SerializedEncryptionData\s*=\s*('|"|)(.*?)(\1)/)?.[2]

                while ((match = regex.exec(noticeData.data)) !== null) {
                    const key = match[1];
                    const value = match[2];
                    uciData[key] = value;
                }
                const formData = `-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="ClientId"

            ${uciData?.ClientId}
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="ConsentSurface"

SISU
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="ConsentType"

ucsisunotice
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="correlation_id"

            ${uciData?.CorrelationId}
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="CountryRegion"

US
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="DeviceId"

-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="SerializedEncryptionData"

            ${encryptedPayload}
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="FormFactor"

Desktop
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="Market"

EN-US
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="ModelType"

ucsisunotice
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="ModelVersion"

1.14
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="NoticeId"

            ${uciData?.NoticeId}
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="Platform"

Web
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="UserId"

            ${uciData?.UserId}
-----------------------------21228718521184446577444291967
Content-Disposition: form-data; name="UserVersion"

1
-----------------------------21228718521184446577444291967--`;
                await axios.post(`https://privacynotice.account.microsoft.com/recordnotice`,
                    formData, {
                    headers: {
                        "Content-Type": "multipart/form-data; boundary=---------------------------21228718521184446577444291967",

                    }
                })
            }
            return await loginHelper(axios, d, repeat + 1, userid)


        /*
        Phone Locked
        */

                /// TD








        /*
        Locked
        */
        } else if (link.includes("identity/confirm")) {
            return "locked"
        }


        else if (link.includes("Abuse")) {
            console.log(`ABUSE!!`)
            return "locked"
        }

        else if (link.includes("RecoverAccount")) {
            console.log(`User has to enable their account again!`)
            return "unauthed"
        }

        else if (link.includes("recover")) {
            console.log(`Locked!`)
            return "unauthed"
        }

        else if (link.includes("/proofs")) {
            console.log(`Authenticated Account!`)
            return "authed"
        }

        else {
            console.log(`Checking unhandled link ${link}`);
        }
    } else {
        console.log(`No link!`);
    }

    const loc = loginData?.headers?.location || loginData?.headers?.Location || "";
    if (loc.includes("account.live.com") || loc.includes("account.microsoft.com")) {
        return "authed";
    }

    const body = typeof loginData?.data === "string" ? loginData.data : JSON.stringify(loginData?.data || "");

    // Handle KMSI prompt
    if (body.includes("kmsi") || body.includes("Keep me signed in") || body.includes("Stay signed in") || body.includes("type=28")) {
        console.log(`[LOGINHELPER] Handling KMSI prompt...`);
        let kmsiPPFT = null;
        try {
            const sd = JSON.parse(body.match(/var ServerData = ({.*?});/s)?.[1] || "{}");
            kmsiPPFT = sd.sFT || sd.sFTTag?.match(/value="([^"]*)"/)?.[1];
        } catch (e) {}
        if (!kmsiPPFT) {
            kmsiPPFT = body.match(/name="PPFT"[^>]*value="([^"]*)"/)?.[1];
        }
        if (kmsiPPFT) {
            try {
                const postUrl = link || "https://login.live.com/ppsecure/post.srf";
                await axios.post(postUrl, `PPFT=${encodeURIComponent(kmsiPPFT)}&type=28&LoginOptions=3`, {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    maxRedirects: 0,
                    validateStatus: () => true
                });
                return "authed";
            } catch (e) {}
        }
        return "authed";
    }

    // Check if Microsoft is showing an unauthenticated sign-in page
    if (
        body.includes("Sign in to your Microsoft account") ||
        (body.includes("Sign in") && body.includes("PPFT")) ||
        body.includes("loginfmt") ||
        body.includes("i0116") ||
        body.includes("login-fluent") ||
        body.includes("i5030") ||
        body.includes("login_en")
    ) {
        console.log("[LOGINHELPER] Microsoft returned unauthenticated login page");
        return "unauthed";
    }

    // Check if Microsoft is requiring proof verification
    if (body.includes("frmVerifyProof") || body.includes("Call us overprotective") || body.includes("identity/confirm")) {
        console.log("[LOGINHELPER] Proof verification required");
        return "unauthed";
    }

    if (body === "") {
        return "authed";
    }

    // If cookies exist, consider authed, otherwise unauthed
    if (axios.getCookie && (axios.getCookie("AMRPSSecAuth") || axios.getCookie("AMCSecAuth") || axios.getCookie("__Host-MSAAUTH"))) {
        return "authed";
    }

    return "unauthed";
}