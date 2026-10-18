const memoryCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function parseFormattedNumber(val) {
    if (!val) return 0;
    val = String(val).replace(/,/g, '').trim();
    const multiplier = val.slice(-1).toUpperCase();
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
    if (multiplier === 'K') return Math.round(num * 1000);
    if (multiplier === 'M') return Math.round(num * 1000000);
    if (multiplier === 'B') return Math.round(num * 1000000000);
    if (multiplier === 'T') return Math.round(num * 1000000000000);
    return Math.round(num);
}

function parseDonutStatsHtml(html, ign) {
    if (typeof html !== 'string' || !html.trim() || (html.includes('404') && html.includes('Player not found')) || html.includes('Failed to find player') || (html.includes('notFound') && !html.includes('money'))) {
        return null;
    }

    const metaMatch = html.match(/content="([^"]*DonutSMP stats:[^"]*)"/i) || html.match(/content="([^"]*stats:[^"]*)"/i);
    const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const extract = (regex, fallback = '0') => {
        const m = cleanText.match(regex);
        return m ? m[1].trim() : fallback;
    };

    const moneyMatch = cleanText.match(/Money\s+\$([\d.,]+[KMBTkp]?)/i) || (metaMatch ? metaMatch[1].match(/\$([\d.,]+[KMBTkp]?)\s+money/i) : null);
    const shardsMatch = cleanText.match(/Shards\s+([\d.,]+[KMBTkp]?)/i);
    const playtimeMatch = cleanText.match(/Playtime\s+([\d]+[dhm\s]+[\d]*[hm]?)/i) || (metaMatch ? metaMatch[1].match(/([\d]+[dhm\s]+[\d]*[hm]?)\s+playtime/i) : null);
    const killsMatch = cleanText.match(/Kills\s+([\d.,]+)/i) || (metaMatch ? metaMatch[1].match(/([\d.,]+)\s+kills/i) : null);
    const kdMatch = cleanText.match(/K\/D:\s*([\d.]+)/i);
    const deathsMatch = cleanText.match(/Deaths\s+([\d.,]+)/i);
    const rankMatch = cleanText.match(/Featured\s+[^\s]+\s+(Diamond|Media|VIP|Elite|Champion|Master|Hero|Overlord|Legend)/i);

    const blocksPlaced = extract(/Blocks Placed\s+([\d.,]+[KMBTkp]?)/i, '0');
    const blocksBroken = extract(/Blocks Broken\s+([\d.,]+[KMBTkp]?)/i, '0');
    const mobsKilled = extract(/Mobs Killed\s+([\d.,]+[KMBTkp]?)/i, '0');
    const moneySpent = extract(/Money Spent\s+\$([\d.,]+[KMBTkp]?)/i, '0');
    const moneyMade = extract(/Money Made\s+\$([\d.,]+[KMBTkp]?)/i, '0');

    if (!moneyMatch && !playtimeMatch && !killsMatch && !shardsMatch) {
        return null;
    }

    const rawMoney = moneyMatch ? moneyMatch[1] : '0';
    const rawShards = shardsMatch ? shardsMatch[1] : '0';
    const rawPlaytime = playtimeMatch ? playtimeMatch[1].trim() : '0m';
    const rawKills = killsMatch ? killsMatch[1].replace(/,/g, '') : '0';
    const rawDeaths = deathsMatch ? deathsMatch[1].replace(/,/g, '') : '0';
    const rawKd = kdMatch ? kdMatch[1] : (Number(rawDeaths) > 0 ? (Number(rawKills) / Number(rawDeaths)).toFixed(2) : Number(rawKills).toFixed(2));
    const rank = rankMatch ? rankMatch[1] : 'None';

    return {
        username: ign,
        money: parseFormattedNumber(rawMoney),
        moneyFormatted: rawMoney.startsWith('$') ? rawMoney : `$${rawMoney}`,
        balance: rawMoney.replace(/^\$/, ''),
        playtime: rawPlaytime || '0m',
        shards: parseFormattedNumber(rawShards),
        shardsFormatted: rawShards,
        kills: Number(rawKills) || 0,
        deaths: Number(rawDeaths) || 0,
        kdr: String(rawKd || '0.00'),
        rank: rank || 'None',
        blocksPlaced: blocksPlaced,
        blocksBroken: blocksBroken,
        mobsKilled: mobsKilled,
        moneySpent: moneySpent,
        moneyMade: moneyMade,
        smp: 'DonutSMP',
        hasData: true
    };
}

async function fetchUrl(url) {
    if (typeof fetch === "function") {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8"
            },
            signal: AbortSignal.timeout(6000)
        });
        if (res.status === 200) {
            return await res.text();
        }
        return null;
    }
    const https = require("https");
    return new Promise((resolve) => {
        const req = https.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "*/*"
            },
            timeout: 6000
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                resolve(null);
                return;
            }
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => resolve(body));
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });
    });
}

async function getDonutStats(ign) {
    if (!ign || ign === "No Minecraft!" || ign === "XBL Failed") return null;
    const cleanIgn = ign.trim();
    const ignKey = cleanIgn.toLowerCase();

    // 1. Check RAM cache
    const cached = memoryCache.get(ignKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        // 2. Fetch live data from donutstats.net
        const urls = [
            `https://www.donutstats.net/player/${encodeURIComponent(cleanIgn)}`,
            `https://donutstats.net/player/${encodeURIComponent(cleanIgn)}`
        ];

        for (const u of urls) {
            try {
                const text = await fetchUrl(u);
                if (!text) continue;

                // Try parsing JSON first
                if (text.startsWith("{") && text.endsWith("}")) {
                    try {
                        const json = JSON.parse(text);
                        const playerObj = json.player || json.data || json;
                        const statsObj = json.stats || playerObj.stats || playerObj;
                        if (statsObj) {
                            const money = statsObj.money ?? statsObj.balance ?? 0;
                            const playtime = statsObj.playtime ?? statsObj.play_time ?? "0m";
                            const shards = statsObj.shards ?? statsObj.donutShards ?? 0;
                            const kills = statsObj.kills ?? statsObj.player_kills ?? 0;
                            const deaths = statsObj.deaths ?? 0;
                            const kdr = statsObj.kdr ?? (deaths > 0 ? (kills / deaths).toFixed(2) : Number(kills).toFixed(2));
                            const rank = playerObj.rank ?? statsObj.rank ?? "None";

                            const result = {
                                username: cleanIgn,
                                money: typeof money === "string" ? parseFormattedNumber(money) : Number(money) || 0,
                                playtime: typeof playtime === "string" ? playtime : `${playtime}m`,
                                shards: typeof shards === "string" ? parseFormattedNumber(shards) : Number(shards) || 0,
                                kills: Number(kills) || 0,
                                deaths: Number(deaths) || 0,
                                kdr: String(kdr) || "0.00",
                                rank: String(rank || "None"),
                                smp: "DonutSMP",
                                hasData: true
                            };
                            memoryCache.set(ignKey, { timestamp: Date.now(), data: result });
                            return result;
                        }
                    } catch {}
                }

                // Parse HTML
                const parsed = parseDonutStatsHtml(text, cleanIgn);
                if (parsed && parsed.hasData) {
                    memoryCache.set(ignKey, { timestamp: Date.now(), data: parsed });
                    return parsed;
                }
            } catch (err) {
                console.log(`[DONUT_STATS] URL ${u} error:`, err.message);
            }
        }
    } catch (e) {
        console.log(`[DONUT_STATS] Error fetching Donut stats for ${cleanIgn}:`, e.message);
    }

    // Default fallback stats object if player not found / API down
    const fallback = {
        username: cleanIgn,
        money: 0,
        playtime: "0m",
        shards: 0,
        kills: 0,
        deaths: 0,
        kdr: "0.00",
        rank: "None",
        smp: "DonutSMP",
        hasData: false
    };
    memoryCache.set(ignKey, { timestamp: Date.now(), data: fallback });
    return fallback;
}

module.exports = getDonutStats;
