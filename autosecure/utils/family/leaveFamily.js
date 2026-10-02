const getPuid = require('./getPuid');

/**
 * Leaves or removes the account from Microsoft Family group.
 * @param {HttpClient} axios 
 * @returns {Promise<boolean|string>}
 */
module.exports = async function leaveFamily(axios) {
    try {
        let token = axios?.axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                      axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                      null;

        if (!token) {
            try {
                const getVerificationToken = require('../secure/Cookies/verificationToken');
                await getVerificationToken(axios);
                token = axios?.axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                        axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                        null;
            } catch (_) {}
        }

        const baseHeaders = {
            "X-Requested-With": "XMLHttpRequest",
            ...(token ? { "__RequestVerificationToken": token } : {})
        };

        let members = [];
        try {
            const rosterRes = await axios.get(`https://account.microsoft.com/family/api/roster`, {
                headers: baseHeaders
            });
            const familyData = rosterRes?.data;
            if (familyData) {
                members = Array.isArray(familyData.Members) ? familyData.Members : (Array.isArray(familyData.members) ? familyData.members : []);
            }
        } catch (rosterErr) {
            // Ignore roster error, proceed with family-summary fallback
        }

        // Fallback: try family-summary endpoint
        if (members.length === 0) {
            try {
                const summaryRes = await axios.get(`https://account.microsoft.com/home/api/family/family-summary`, {
                    headers: baseHeaders
                });
                const summaryData = summaryRes?.data;
                if (summaryData?.members && Array.isArray(summaryData.members)) {
                    members = summaryData.members;
                }
            } catch (_) {}
        }

        // Try extracting user PUID from roster members
        let puid = null;
        if (members.length > 0) {
            const currentMember = members.find(m => m.IsSignedInUser || m.IsCurrentUser || m.isSelf);
            if (currentMember) {
                puid = currentMember.Puid || currentMember.UserPuid || currentMember.MemberId || currentMember.Id;
            }
        }

        // Fallback 1: Scrape PUID from /family/home
        if (!puid) {
            try {
                puid = await getPuid(axios);
            } catch (puidErr) {
                console.log('[LEAVE_FAMILY] Error scraping PUID:', puidErr.message);
            }
        }

        // Fallback 2: Check first member PUID
        if (!puid && members.length > 0) {
            puid = members[0].Puid || members[0].UserPuid || members[0].MemberId || members[0].Id;
        }

        if (!puid) {
            console.log('[LEAVE_FAMILY] Could not obtain user PUID');
            return false;
        }

        const deleteRes = await axios.delete(`https://account.microsoft.com/family/api/member?removeSet=Msa:${puid}`, {
            headers: {
                ...baseHeaders,
                "Origin": "https://account.microsoft.com",
                "Referer": "https://account.microsoft.com/family/home"
            }
        });

        if (deleteRes?.data?.result === 0 || deleteRes?.status === 200 || deleteRes?.status === 204 || deleteRes?.status === 404) {
            return true;
        } else {
            console.log(`[LEAVE_FAMILY] Leave family returned status: ${deleteRes?.status}, result: ${deleteRes?.data?.result}`);
            return false;
        }
    } catch (err) {
        if (err?.response?.status === 404) {
            console.log('[LEAVE_FAMILY] Member not found in family (already removed)');
            return true;
        }
        console.error('[LEAVE_FAMILY] Error leaving family:', err.message);
        return false;
    }
};