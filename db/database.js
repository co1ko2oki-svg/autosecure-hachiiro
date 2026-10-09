const { join } = require("path");
const fs = require("fs");
const dbPath = join(__dirname, "database.db");

// Load driver: prefer @journeyapps/sqlcipher for transparent AES-256 database file encryption, fallback to sqlite3
let sqlite;
let usingSqlCipher = false;
try {
  sqlite = require("@journeyapps/sqlcipher");
  usingSqlCipher = true;
} catch (e1) {
  try {
    sqlite = require("sqlite3");
  } catch (e2) {
    console.error("[DATABASE] Neither @journeyapps/sqlcipher nor sqlite3 is available:", e2.message);
    process.exit(1);
  }
}

// Retrieve DB encryption key from environment or config
const dbKey = (
  process.env.DB_ENCRYPTION_KEY || 
  process.env.TOKEN_ENCRYPTION_KEY || 
  process.env.JWT_SECRET || 
  ""
).trim();

// Format encryption key for SQLCipher PRAGMA
function formatPragmaKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `"x'${trimmed}'"`;
  }
  return `'${trimmed.replace(/'/g, "''")}'`;
}

// Detect whether on-disk database file is already encrypted with SQLCipher
function isDatabaseEncrypted(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (stats.size < 16) return false;
    const buf = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, buf, 0, 16, 0);
    } finally {
      fs.closeSync(fd);
    }
    const magic = buf.toString("utf8", 0, 16);
    return !magic.startsWith("SQLite format 3");
  } catch (e) {
    return false;
  }
}

// Auto-migration: if existing database is unencrypted and encryption key + sqlcipher are active,
// run the encryption export routine before opening persistent connections.
if (fs.existsSync(dbPath) && !isDatabaseEncrypted(dbPath) && dbKey && usingSqlCipher) {
  try {
    const { execFileSync } = require("child_process");
    const encryptScript = join(__dirname, "..", "scripts", "encryptDatabase.js");
    if (fs.existsSync(encryptScript)) {
      console.log("[DATABASE] Unencrypted SQLite database detected with active SQLCipher key. Running automatic AES-256 migration...");
      execFileSync(process.execPath, [encryptScript], { stdio: "inherit" });
    }
  } catch (migErr) {
    console.error("[DATABASE] Auto-migration to SQLCipher encountered an issue:", migErr.message);
  }
}

// Ensure database file permissions are restrictive (owner-only read/write)
try {
  if (fs.existsSync(dbPath)) {
    fs.chmodSync(dbPath, 0o600);
  }
} catch (e) {}

const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('[DATABASE] Failed to open database:', err.message);
    process.exit(1);
  }
});

// Configure SQLite for high concurrency & resilience
db.configure("busyTimeout", 10000);

// Initialize PRAGMA optimizations for speed and concurrent read/write
db.serialize(() => {
  if (dbKey) {
    if (usingSqlCipher) {
      const pragmaKey = formatPragmaKey(dbKey);
      db.run(`PRAGMA key = ${pragmaKey};`, (keyErr) => {
        if (keyErr) {
          console.error('[DATABASE] Failed to apply SQLCipher AES-256 key:', keyErr.message);
        }
      });
      db.get("PRAGMA cipher_version;", (verErr, row) => {
        if (verErr) {
          console.error('[DATABASE] SQLCipher verification failed:', verErr.message);
        } else if (row) {
          const version = Object.values(row)[0];
          console.log(`[DATABASE] SQLCipher AES-256 active (v${version})`);
        }
      });
    } else {
      console.warn('[DATABASE] DB_ENCRYPTION_KEY is configured, but @journeyapps/sqlcipher is not loaded. Operating in standard unencrypted SQLite mode.');
    }
  }

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

module.exports = { 
  db, 
  queryParams,
  usingSqlCipher,
  isDatabaseEncrypted,
  formatPragmaKey
};
