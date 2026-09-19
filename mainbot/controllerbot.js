const discord = require("discord.js");
const { queryParams } = require('../db/database.js');
const { tokens, guildid, welcomechannel } = require("../config.json");
const emailHandler = require("./handlers/emailHandler.js");
const eventHandler = require("./handlers/eventHandler.js");
const { startLicenseChecker } = require('./utils/licensechecker.js');
const { startLeaderboardUpdater } = require('./utils/leaderboardupdater.js');
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





client.tickets = new Map();
client.cooldowns = new discord.Collection();
eventHandler(client, tokens[0]);



async function setBotPresenceAndStatus() {
    try {
        // Lấy số lượng account đã secure từ database
        const users = await queryParams("SELECT id FROM users");
        const accCount = users ? users.length : 0;

        // Đặt trạng thái thành "Watching [số lượng] accounts"
        // type: 3 nghĩa là WATCHING (Đang xem)
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
    console.log(`Initializing controller!`)
    try {
        client.queryParams = async (query, params = [], method = "all") => {
            return queryParams(query, params, method);
          };
        await client.login(tokens[0]);

        client.once("ready", async () => {
const clientId = client.user.id;
setMainBotClient(client); // Set the main bot client globally
autosecurelogs(client, 'startbots', clientId, null, null, null, null);
initializequarantine();
emailHandler.initialize(client)

// Cập nhật trạng thái ngay khi khởi động
setBotPresenceAndStatus(); 
// Tự động cập nhật lại số lượng acc mỗi 5 phút (300000ms)
setInterval(setBotPresenceAndStatus, 300000); 

initializeNotificationSystem(client); // Fixed BUG #7: was imported but never invoked

await Promise.all([
    startLicenseChecker(client),
    setupMemberHandler(client),
    initializelogs(client),
    initializeappealclient(client),
    oldfinishedappeals(),
    checkroles(client),
    initializeAutoPanels(client),
    startLeaderboardUpdater(client).then(stop => {
        client.leaderboardCleanup = stop;
    })
]);
        });

    } catch (error) {
        console.error("Error in initializeController:", error);
    }
}

module.exports = { initializeController, client };
