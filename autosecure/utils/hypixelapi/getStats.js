const { queryParams } = require("../../../db/database");
const getData = require("./getData");
const { getCachedStats, setCachedStats, deduplicateRequest } = require("./hypixelCache");

const refreshdelay = 43200000; // 12h for SQLite long-term storage

module.exports = async (ign) => {
    if (!ign) return null;
    const cleanIgn = ign.trim();
    const ignKey = cleanIgn.toLowerCase();

    // 1. Instant RAM cache check (<1ms)
    const memoryCached = getCachedStats(cleanIgn);
    if (memoryCached) {
        return memoryCached;
    }

    // 2. Request deduplication (In-flight coalescing)
    return deduplicateRequest(`stats:${ignKey}`, async () => {
        // Double-check memory cache inside the coalesced closure
        const recheckMem = getCachedStats(cleanIgn);
        if (recheckMem) return recheckMem;

        try {
            // 3. Check SQLite database
            let query = await queryParams(`SELECT stats, last_updated FROM stats WHERE name = ?`, [cleanIgn], "all");
            
            if (query && query.length > 0) {
                try {
                    const cachedStats = JSON.parse(query[0].stats);
                    if (Date.now() - refreshdelay < Number(query[0].last_updated) && cachedStats && cachedStats.hasapi !== false) {
                        setCachedStats(cleanIgn, cachedStats);
                        return cachedStats;
                    }
                } catch (parseErr) {
                    // Invalid JSON in DB, proceed to refresh
                }
            }

            // 4. Fetch fresh data from Hypixel API
            let d = await getData(cleanIgn);
            if (!d) return null;

            // Cache in fast RAM
            setCachedStats(cleanIgn, d);

            // Persist to SQLite asynchronously
            if (!query || query.length === 0) {
                await queryParams(
                    `INSERT INTO stats(name, stats, last_updated) VALUES(?, ?, ?)`,
                    [cleanIgn, JSON.stringify(d), Date.now()],
                    "run"
                ).catch(err => console.error(`Error saving stats to DB for ${cleanIgn}:`, err.message));
            } else {
                await queryParams(
                    `UPDATE stats SET stats = ?, last_updated = ? WHERE name = ?`,
                    [JSON.stringify(d), Date.now(), cleanIgn],
                    "run"
                ).catch(err => console.error(`Error updating stats in DB for ${cleanIgn}:`, err.message));
            }

            return d;
        } catch (e) {
            console.error(`Catch in getStats for ${cleanIgn}:`, e.message);
            return null;
        }
    });
};