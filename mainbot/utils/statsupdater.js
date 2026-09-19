const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require("discord.js");
const { generateStatsImage } = require("./drawStats");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { queryParams } = require("../../db/database");
const { sendComponentsV2, editComponentsV2, IS_COMPONENTS_V2 } = require("./componentsV2");
const moment = require("moment"); // For nice time formatting if needed

let launchDate = new Date().toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" });
let startTime = Date.now();

// This stores the message ID so we can edit it, just like leaderboard
let messageIdStoragePath = path.join(__dirname, '..', '..', 'autosecure', 'utils', 'db', 'statsMessage.txt');

async function getMessageId() {
    if (fs.existsSync(messageIdStoragePath)) {
        return fs.readFileSync(messageIdStoragePath, 'utf8');
    }
    return null;
}

async function updatemessageid(id, channelId) {
    fs.writeFileSync(messageIdStoragePath, `${id}|${channelId}`);
}

async function fetchStatsData(client) {
    // 1. Get Accounts Secured
    const allAccs = await queryParams(`SELECT * FROM users`);
    const totalUsers = allAccs ? allAccs.length : 0;
    
    // Total Accounts (from hits) - You can adjust this query if there's a specific hits table
    let accountsSecured = totalUsers; // Defaulting to users if hits table isn't easily countable, or adjust here
    try {
        const hits = await queryParams(`SELECT id FROM users`); // Adjust query based on actual hit tracking
        if (hits) accountsSecured = hits.length;
    } catch(e) {}

    // 2. Dates
    const currentDate = new Date().toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
    
    // 3. System Stats
    const mem = process.memoryUsage();
    const heap = `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`;
    const ram = `${(mem.rss / 1024 / 1024).toFixed(1)} MB RSS`;
    
    const cpuUsages = os.loadavg();
    const cpu = `${cpuUsages[0].toFixed(1)}%`;
    
    const processes = 40; // Simulated or you can count actual worker threads/child processes
    
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

async function generateStatsComponentsV2(client) {
    try {
        const data = await fetchStatsData(client);
        const imgBuffer = await generateStatsImage(data);
        
        let url = "";
        const config = require("../../config.json");
        
        // Upload to log channel to get URL
        if (config.log && client) {
            try {
                const logChannel = await client.channels.fetch(config.log);
                const { AttachmentBuilder } = require('discord.js');
                const att = new AttachmentBuilder(imgBuffer, { name: 'stats.png' });
                const msg = await logChannel.send({ files: [att] });
                url = msg.attachments.first().url;
            } catch(e) {
                console.error("Failed to upload stats image to log channel:", e.message);
            }
        }
        
        if (!url) return { content: "Failed to generate stats image URL" };

        const containerComponents = [];
        containerComponents.push({
            type: 12, 
            items: [ { media: { url: url } } ]
        });
        
        return {
            flags: IS_COMPONENTS_V2,
            components: [
                {
                    type: 17, // CONTAINER
                    accent_color: 0x2B2D31,
                    components: containerComponents
                }
            ]
        };
    } catch (error) {
        console.error(`Error generating stats Components V2: ${error.message}`);
        return { content: "Failed to generate stats" };
    }
}

async function updateStatsMessage(client) {
    try {
        const rawId = await getMessageId();
        const payload = await generateStatsComponentsV2(client);
        const config = require("../../config.json");
        
        // If they don't have statschannel in config, fallback to leaderboard or something
        // Just return if not configured
        if (!config.statschannel) return;
        
        const channelId = config.statschannel;

        if (rawId) {
            const [messageId, chId] = rawId.split("|");
            try {
                await editComponentsV2(client, chId, messageId, payload);
                return;
            } catch (err) {
                console.log("[STATS] Could not edit old message, will try posting new one...");
            }
        }

        if (channelId) {
            try {
                const channel = await client.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    const sent = await sendComponentsV2(client, channelId, payload);
                    const sentId = sent?.id || sent;
                    if (sentId) {
                        await updatemessageid(sentId, channelId);
                        console.log(`[STATS] Posted new stats Components V2 (${sentId})`);
                    }
                }
            } catch (error) {
                console.log("[STATS] Error fetching stats channel or posting message:", error.message);
            }
        }
    } catch (error) {
        console.error(`[STATS] Critical error: ${error.message}`);
    }
}

function startStatsLoop(client) {
    // Update every 60 seconds
    setInterval(async () => {
        try {
            await updateStatsMessage(client);
        } catch (error) {
            console.error(`Error in stats update loop: ${error.message}`);
        }
    }, 60000); 
    
    // Initial update after 5 seconds
    setTimeout(() => {
        updateStatsMessage(client);
    }, 5000);
}

module.exports = { startStatsLoop, updateStatsMessage };
