const { spawn, exec } = require("child_process");
const { startup } = require("./db/db");
const { queryParams } = require("./db/database");
const { initializeController } = require("./mainbot/controllerbot");
const initializeBots = require("./mainbot/handlers/initializeBots");
const owners = require("./config.json").owners;
const hasAccess = require("./db/access");
const generate = require("./autosecure/utils/generate");
const pm2 = require("pm2");

// --- ANTI-CRASH & PROCESS STABILITY ---
process.on('unhandledRejection', (reason, promise) => {
  // Ignore expired/unknown Discord interactions (code 10062) - harmless
  if (reason?.code === 10062) return;
  console.error('[ANTI-CRASH] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`[ANTI-CRASH] Uncaught Exception: ${err ? err.message : err}`, err ? err.stack : '');
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
  console.error(`[ANTI-CRASH] Exception Monitor: ${err ? err.message : err}`);
});

let initializationStatus = new Map();
initializationStatus.set('botsInitialized', false);
initializationStatus.set('initializationTime', null);
initializationStatus.set('initializedBotsCount', 0);

async function fixexpiredlicenses() {
  try {
    const now = Date.now().toString();
    const result = await queryParams("DELETE FROM usedLicenses WHERE expiry < ?", [now]);
    console.log(`Removed expired licenses.`);
  } catch (err) {
    console.error("Error fixing expired licenses:", err);
  }
}

async function startBot(restart = false) {
  try {
    if (restart) {
      console.log("Restarting bot...");

      pm2.connect((err) => {
        if (err) {
          console.error("Failed to connect to PM2:", err);
          process.exit(1);
        }

        pm2.restart("autosecure", (err, apps) => {
          if (err) {
            console.error("Failed to restart bot:", err);
            process.exit(1);
          }
          console.log("Bot successfully restarted!");
          pm2.disconnect();
          process.exit(0);
        });
      });

      return;
    }

    await startup();
    await initializeController();

    let ownersAccessed = false;
    const durationMs = 100 * 365 * 24 * 60 * 60 * 1000; // 100 years in milliseconds

    for (const ownerId of owners) {
      const hasOwnerAccess = await hasAccess(ownerId, "1");

      let id = generate(32);

      if (!hasOwnerAccess) {
        const existingSlots = await queryParams(
          "SELECT slots FROM slots WHERE user_id = ?",
          [ownerId]
        );

        if (existingSlots.length === 0) {
          await queryParams(
            "INSERT INTO slots (user_id, slots) VALUES (?, ?)",
            [ownerId, 1]
          );
        } else {
          await queryParams(
            "UPDATE slots SET slots = ? WHERE user_id = ?",
            [1, ownerId]
          );
        }

        const secureExists = await queryParams(
          "SELECT 1 FROM secureconfig WHERE user_id = ?",
          [ownerId]
        );
        if (secureExists.length === 0) {
          await queryParams("INSERT INTO secureconfig (user_id) VALUES (?)", [ownerId]);
        }

        const expiry = (Date.now() + durationMs).toString();
        await queryParams(
          "INSERT INTO usedLicenses (license, user_id, expiry) VALUES (?, ?, ?)",
          [id, ownerId, expiry]
        );

        ownersAccessed = true;
      }
    }

    if (ownersAccessed) {
      console.log(`Automatically gave owners access!`);
    }

    await fixexpiredlicenses();
    let amount = await initializeBots();
    console.log(`Initialized ${amount} Bots`);
    

    initializationStatus.set('botsInitialized', true);
    initializationStatus.set('initializationTime', new Date());
    initializationStatus.set('initializedBotsCount', amount);
  } catch (error) {
    console.error("Error during initialization:", error);
    initializationStatus.set('initializationError', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startBot()
}

module.exports = { 
  startBot,
  initializationStatus
};