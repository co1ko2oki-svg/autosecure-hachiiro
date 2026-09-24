/**
 * Fetches family roster or summary data
 * @param {HttpClient} axios 
 */
module.exports = async (axios) => {
    try {
        const token = axios?.axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                      axios?.defaults?.headers?.common?.['__RequestVerificationToken'] ||
                      null;

        const baseHeaders = {
            "X-Requested-With": "XMLHttpRequest",
            ...(token ? { "__RequestVerificationToken": token } : {})
        };

        const data = await axios.get(`https://account.microsoft.com/family/api/roster`, {
            headers: baseHeaders
        });

        const familyData = data?.data;
        if (familyData) {
            const members = Array.isArray(familyData.Members) ? familyData.Members : (Array.isArray(familyData.members) ? familyData.members : []);
            if (members.length > 0) {
                return familyData;
            }
        }
    } catch (e) {
        // Fallback to family-summary below
    }

    // Fallback: try /home/api/family/family-summary which is more reliable
    try {
        const resp = await axios.get("https://account.microsoft.com/home/api/family/family-summary", {
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        if (resp?.data?.members && Array.isArray(resp.data.members) && resp.data.members.length > 0) {
            return { members: resp.data.members };
        }
    } catch (e) {
        // Roster / family summary unavailable
    }

    return null;
};