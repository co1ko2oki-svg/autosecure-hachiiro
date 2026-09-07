const sqlite = require("sqlite3").verbose();
const { join } = require("path");
const path = join(__dirname, "database.db");

const db = new sqlite.Database(path, (err) => {
  if (err) throw err;
});

// Configure SQLite for high concurrency & resilience
db.configure("busyTimeout", 10000);

// Initialize PRAGMA optimizations for speed and concurrent read/write
db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA busy_timeout = 10000;");
  db.run("PRAGMA synchronous = NORMAL;");
  db.run("PRAGMA cache_size = -64000;"); // 64MB memory page cache
  db.run("PRAGMA temp_store = MEMORY;");
  db.run("PRAGMA mmap_size = 268435456;"); // 256MB memory-mapped I/O
  db.run("PRAGMA foreign_keys = ON;");
});

// Helper for backoff delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Robust queryParams with automatic retry on SQLITE_BUSY / SQLITE_LOCKED
const queryParams = async (command, params = [], method = "all", maxRetries = 5) => {
  const queryMethod = typeof db[method] === "function" ? method : "all";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        db[queryMethod](command, params, function (error, result) {
          if (error) {
            reject(error);
          } else {
            // For db.run(), 'this' contains lastID and changes
            if (queryMethod === "run" && result === undefined) {
              resolve({ lastID: this?.lastID, changes: this?.changes });
            } else {
              resolve(result);
            }
          }
        });
      });
      return result;
    } catch (error) {
      const isBusy = error && (
        error.code === "SQLITE_BUSY" || 
        error.code === "SQLITE_LOCKED" || 
        (error.message && (error.message.includes("busy") || error.message.includes("locked")))
      );

      if (isBusy && attempt < maxRetries) {
        // Exponential backoff with jitter (50ms, 100ms, 200ms, 400ms...)
        const delay = Math.min(50 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50), 1000);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
};

module.exports = { db, queryParams };

