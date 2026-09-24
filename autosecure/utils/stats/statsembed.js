const getembedautosec = require("../responses/getembedsautosec");
const { EmbedBuilder } = require("discord.js");
const short = require("short-number");

const safeShort = (n) => {
    const num = typeof n === "number" ? n : Number(n);
    if (isNaN(num)) return "0";
    return short(num);
};

async function statsembed(client, acc, interaction) {
    const raw = await getembedautosec(client, "statsmsg", acc, interaction);

    let embed = raw;

    if (raw && Array.isArray(raw.fields) && raw.fields.length > 0) {
        console.log(`Embed worked!`);
        
        // Add visage thumbnail if we have a Minecraft username
        if (acc.newName && acc.newName !== "No Minecraft!") {
            const encodedName = encodeURIComponent(acc.newName);
            embed.thumbnail = {
                url: `https://visage.surgeplay.com/bust/${encodedName}.png?y=-40&quality=lossless`
            };
        }
    } else {
        const sbProfile = acc?.stats?.skyblock?.find(p => p.current) || acc?.stats?.skyblock?.[0] || {};
        const bedwars = acc?.stats?.bedwars || {};

        embed = new EmbedBuilder()
            .setColor(11716576)
            .addFields(
                { name: "Donut Money", value: `${safeShort(acc?.donut?.money || 0)}`, inline: true },
                { name: "Donut Playtime", value: `${acc?.donut?.playtime || "0m"}`, inline: true },
                { name: "Donut Shards", value: `${safeShort(acc?.donut?.shards || 0)}`, inline: true },
                { name: "Hypixel Rank", value: `${acc?.stats?.rank || "None"}`, inline: true },
                { name: "Skyblock Net.", value: `${safeShort(sbProfile.networth || 0)}`, inline: true },
                { name: "Bedwars Stars", value: `${bedwars.level || 0}`, inline: true },
                { name: "Lunar Cosmetics", value: `${acc?.lunar?.cosmetics || "None"}`, inline: true },
                { name: "Feather Cosmetics", value: `${acc?.feather?.cosmetics || "None"}`, inline: true }
            );
            
        // Add visage thumbnail even for the fallback embed if we have a username
        if (acc.newName && acc.newName !== "No Minecraft!") {
            const encodedName = encodeURIComponent(acc.newName);
            embed.setThumbnail(`https://visage.surgeplay.com/bust/${encodedName}.png?y=-40&quality=lossless`);
        }

        if (acc?.banchecked || acc?.donutBanchecked || acc?.mcpvpBanchecked) {
            const hpxStr = acc?.ban === true ? `🔴 Banned (${acc?.banReason || 'Unknown'})` : (acc?.ban === false ? '🟢 Clean' : '⚪ -');
            const donutStr = acc?.donutBan === true ? `🔴 Banned (${acc?.donutBanReason || 'Unknown'})` : (acc?.donutBan === false ? '🟢 Clean' : '⚪ -');
            const mcpvpStr = acc?.mcpvpBan === true ? `🔴 Banned (${acc?.mcpvpBanReason || 'Unknown'})` : (acc?.mcpvpBan === false ? '🟢 Clean' : '⚪ -');
            embed.setFooter({ text: `Ban Status • Hypixel: ${hpxStr} | Donut: ${donutStr} | MCPVP: ${mcpvpStr}` });
        }
    }

    return { embeds: [embed] };
}

module.exports = statsembed;
