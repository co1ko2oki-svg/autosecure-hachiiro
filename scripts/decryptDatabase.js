#!/usr/bin/env node
/**
 * Standalone SQLCipher AES-256 Database Decryption Script
 * Converts an encrypted SQLCipher AES-256 database back to standard plaintext SQLite.
 * 
 * Usage:
 *   node scripts/decryptDatabase.js
 *   npm run db:decrypt
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '..', 'db', 'database.db');
const tempDecryptedPath = path.resolve(__dirname, '..', 'db', 'database_decrypted.db');
const backupPath = path.resolve(__dirname, '..', 'db', `database_enc_backup_${Date.now()}.db`);

// Check driver: prefer @journeyapps/sqlcipher
let sqlite;
try {
  sqlite = require('@journeyapps/sqlcipher');
} catch (e1) {
  try {
    sqlite = require('sqlite3');
  } catch (e2) {
    console.error('[DECRYPT] Neither @journeyapps/sqlcipher nor sqlite3 is installed.');
    process.exit(1);
  }
}

// Key resolution
const rawKey = (
  process.env.DB_ENCRYPTION_KEY ||
  process.env.TOKEN_ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  ''
).trim();

if (!rawKey) {
  console.error('[DECRYPT] Error: No encryption key specified.');
  console.error('[DECRYPT] Please configure DB_ENCRYPTION_KEY in your .env file.');
  process.exit(1);
}

// Function to format the key for SQLCipher PRAGMA
function formatPragmaKey(key) {
  const trimmed = key.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `"x'${trimmed}'"`;
  }
  return `'${trimmed.replace(/'/g, "''")}'`;
}

// Check if database file is already encrypted
function isDatabaseEncrypted(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (stats.size < 16) return false;
    const buf = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, 16, 0);
    } finally {
      fs.closeSync(fd);
    }
    const magic = buf.toString('utf8', 0, 16);
    return !magic.startsWith('SQLite format 3');
  } catch (e) {
    return false;
  }
}

async function run() {
  if (!fs.existsSync(dbPath)) {
    console.log(`[DECRYPT] No database found at ${dbPath}.`);
    return;
  }

  if (!isDatabaseEncrypted(dbPath)) {
    console.log('[DECRYPT] The database is already unencrypted plaintext SQLite.');
    return;
  }

  console.log(`[DECRYPT] Encrypted database detected at: ${dbPath}`);
  console.log('[DECRYPT] Preparing to decrypt to plaintext SQLite...');

  if (fs.existsSync(tempDecryptedPath)) {
    fs.unlinkSync(tempDecryptedPath);
  }

  const pragmaKey = formatPragmaKey(rawKey);

  // Connect to encrypted database with key
  const encDb = new sqlite.Database(dbPath);

  await new Promise((resolve, reject) => {
    encDb.serialize(() => {
      // 1. Supply decryption key
      encDb.run(`PRAGMA key = ${pragmaKey};`, (err) => {
        if (err) return reject(new Error(`PRAGMA key failed: ${err.message}`));
      });

      // 2. Attach new plaintext database with empty key
      const escapedTempPath = tempDecryptedPath.replace(/'/g, "''");
      const attachSql = `ATTACH DATABASE '${escapedTempPath}' AS plaintext KEY '';`;
      encDb.run(attachSql, (err) => {
        if (err) return reject(new Error(`Attach plaintext failed: ${err.message}`));
      });

      // 3. Export all data to plaintext
      encDb.run("SELECT sqlcipher_export('plaintext');", (err) => {
        if (err) return reject(new Error(`sqlcipher_export failed: ${err.message}`));
      });

      // 4. Detach plaintext database
      encDb.run('DETACH DATABASE plaintext;', (err) => {
        if (err) return reject(new Error(`Detach failed: ${err.message}`));
        resolve();
      });
    });
  });

  // Close encrypted connection
  await new Promise((resolve, reject) => {
    encDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  if (!fs.existsSync(tempDecryptedPath) || fs.statSync(tempDecryptedPath).size === 0) {
    throw new Error('Decryption output file is missing or empty.');
  }

  // Backup encrypted file
  fs.copyFileSync(dbPath, backupPath);
  console.log(`[DECRYPT] Encrypted backup preserved at: ${backupPath}`);

  // Replace original database with decrypted database
  fs.copyFileSync(tempDecryptedPath, dbPath);
  fs.unlinkSync(tempDecryptedPath);

  // Clean up WAL/SHM files
  const shmPath = `${dbPath}-shm`;
  const walPath = `${dbPath}-wal`;
  if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) {}
  if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) {}

  console.log('[DECRYPT] SUCCESS: Database is now decrypted to standard plaintext SQLite!');
}

run().catch((err) => {
  console.error('[DECRYPT] Failed to decrypt database:', err.message);
  process.exit(1);
});
