    const { updateExtraInformation } = require("../../process/helpers");
    const getAliases = require("../getAliases");
    const getoauths = require("../getoauths");

    module.exports = async function newinfo(axios, uid) {
        let newinfo = { 
            newprimary: null,
            oauths: null
        };

        let promises = [];

        promises.push((async () => {
            try {
                let newa = await getAliases(axios);
                if (!newa) return;

                const aliasesList = Array.isArray(newa) ? newa[0] : (newa.aliases || []);
                const primaryEmail = Array.isArray(newa) ? newa[2] : (newa.primary || null);

                if (aliasesList !== null && aliasesList !== undefined) {
                    await updateExtraInformation(uid, "newaliases", JSON.stringify(aliasesList));
                }
                if (primaryEmail) {
                    newinfo.newprimary = primaryEmail;
                }
            } catch (err) {
                console.error(`[NEWINFO] Error getting new aliases for ${uid}:`, err.message);
            }
        })());

        promises.push((async () => {
            try {
                let oauthdata = await getoauths(axios);
                await updateExtraInformation(uid, "oauthsafter", JSON.stringify(oauthdata || []));
                newinfo.oauths = oauthdata;
            } catch (error) {
                console.error(`[NEWINFO] Error getting oauths for ${uid}:`, error.message);
            }
        })());

        await Promise.all(promises);

        return newinfo;
    };

