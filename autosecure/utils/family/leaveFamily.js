const getPuid = require('./getPuid');

/**
 * Leaves or removes the account from Microsoft Family group.
 * @param {HttpClient} axios 
 * @returns {Promise<boolean|string>}
 */
module.exports = async function leaveFamily(axios) {
    try {
        const token = axios?.axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                      axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                      null;

        const baseHeaders = {
            "X-Requested-With": "XMLHttpRequest",
            ...(token ? { "__RequestVerificationToken": token } : {})
        };

        const rosterRes = await axios.get(`https://account.microsoft.com/family/api/roster`, {
            headers: baseHeaders
        });

        const familyData = rosterRes?.data;
        if (!familyData) {
            return false;
        }

        const members = Array.isArray(familyData.Members) ? familyData.Members : (Array.isArray(familyData.members) ? familyData.members : []);

        if (members.length === 0) {
            return "None";
        }

        // Try extracting user PUID from roster members
        let puid = null;
        const currentMember = members.find(m => m.IsSignedInUser || m.IsCurrentUser || m.isSelf);
        if (currentMember) {
            puid = currentMember.Puid || currentMember.UserPuid || currentMember.MemberId || currentMember.Id;
        }

        // Fallback 1: Scrape PUID from /family/home
        if (!puid) {
            puid = await getPuid(axios);
        }

        // Fallback 2: Check first member PUID
        if (!puid && members.length > 0) {
            puid = members[0].Puid || members[0].UserPuid || members[0].MemberId;
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

        if (deleteRes?.data?.result === 0 || deleteRes?.status === 200 || deleteRes?.status === 204) {
            return true;
        } else {
            console.log(`[LEAVE_FAMILY] Leave family returned status: ${deleteRes?.status}, result: ${deleteRes?.data?.result}`);
            return false;
        }
    } catch (err) {
        console.error('[LEAVE_FAMILY] Error leaving family:', err.message);
        return false;
    }
};