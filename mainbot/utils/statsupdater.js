const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { generateStatsImage } = require("./drawStats");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { queryParams } = require("../../db/database");

let launchDate = "Jul 01, 2026";
let startTime = Date.now();

let messageIdStoragePath = path.join(__dirname, '..', '..', 'autosecure', 'utils', 'db', 'statsMessage.txt');

async function getMessageId() {
    if (fs.existsSync(messageIdStoragePath)) {
        return fs.readFileSync(messageIdStoragePath, 'utf8').trim();
    }
    return null;
}

async function updatemessageid(id, channelId) {
    fs.writeFileSync(messageIdStoragePath, `${id}|${channelId}`);
}

async function fetchStatsData(client) {
    let accountsSecured = 0;
    let totalUsers = 0;
    try {
        const hits = await queryParams(`SELECT id FROM users`);
        if (hits) accountsSecured = hits.length;
    } catch(e) {}

    try {
        const allAccs = await queryParams(`SELECT DISTINCT user_id FROM leaderboard`);
        if (allAccs) totalUsers = allAccs.length;
    } catch(e) {
        totalUsers = accountsSecured;
    }

    const currentDate = new Date().toLocaleString("en-US", {
        month: "short", day: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short"
    });
    
    const mem = process.memoryUsage();
    const heap = `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`;
    const ram = `${(mem.rss / 1024 / 1024).toFixed(1)} MB RSS`;
    
    const cpuUsages = os.loadavg();
    const cpu = `${cpuUsages[0].toFixed(1)}%`;
    
    const processes = 40;
    
    const ping = client ? `${client.ws.ping} ms` : "0 ms";
    
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = Math.floor(uptimeSec % 60);
    const uptime = `${h}h ${m}m ${s}s`;

    return {
        accountsSecured: accountsSecured.toLocaleString(),
        totalUsers: totalUsers.toLocaleString(),
        launchDate: launchDate,
        currentDate: currentDate,
        processes: processes.toString(),
        cpu: cpu,
        ram: ram,
        heap: heap,
        ping: ping,
        uptime: uptime
    };
}

async function generateStatsPayload(client) {
    try {
        const data = await fetchStatsData(client);
        const imgBuffer = await generateStatsImage(data);
        
        const attachment = new AttachmentBuilder(imgBuffer, { name: 'stats.png' });
        
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setImage('attachment://stats.png');
        
        return {
            embeds: [embed],
            files: [attachment]
        };
    } catch (error) {
        console.error(`Error generating stats payload: ${error.message}`);
        return null;
    }
}

async function updateStatsMessage(client) {
    try {
        const config = require("../../config.json");
        if (!config.statschannel) return;
        
        const channelId = config.statschannel;
        const rawId = await getMessageId();
        const payload = await generateStatsPayload(client);
        if (!payload) return;

        if (rawId) {
            const [messageId, chId] = rawId.split("|");
            try {
                const channel = await client.channels.fetch(chId);
                const message = await channel.messages.fetch(messageId);
                payload.attachments = [];
                await message.edit({ ...payload, flags: 0 });
                return;
            } catch (err) {
                console.log("[STATS] Could not edit old message, attempting to replace...");
                try {
                    const channel = await client.channels.fetch(chId);
                    const message = await channel.messages.fetch(messageId);
                    await message.delete().catch(() => null);
                } catch(e) {}
            }
        }

        if (channelId) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    const messages = await channel.messages.fetch({ limit: 5 });
                    const botMessage = messages.find(m => m.author.id === client.user.id);
                    if (botMessage) {
                        payload.attachments = [];
                        try {
                            await botMessage.edit({ ...payload, flags: 0 });
                            await updatemessageid(botMessage.id, channelId);
                        } catch (editErr) {
                            await botMessage.delete().catch(() => null);
                            const sent = await channel.send(payload);
                            await updatemessageid(sent.id, channelId);
                            console.log(`[STATS] Replaced stats message (${sent.id})`);
                        }
                    } else {
                        const sent = await channel.send(payload);
                        await updatemessageid(sent.id, channelId);
                        console.log(`[STATS] Posted new stats (${sent.id})`);
                    }
                }
            } catch (error) {
                console.log("[STATS] Error posting stats:", error.message);
            }
        }
    } catch (error) {
        console.error(`[STATS] Critical error: ${error.message}`);
    }
}

function startStatsLoop(client) {
    setInterval(async () => {
        try {
            await updateStatsMessage(client);
        } catch (error) {
            console.error(`Error in stats update loop: ${error.message}`);
        }
    }, 60000); 
    
    setTimeout(() => {
        updateStatsMessage(client);
    }, 5000);
}

module.exports = { startStatsLoop, updateStatsMessage };
