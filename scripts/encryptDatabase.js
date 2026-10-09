#!/usr/bin/env node
/**
 * Standalone SQLCipher AES-256 Database Encryption Migration Script
 * Converts an unencrypted SQLite database to an encrypted SQLCipher AES-256 database.
 * 
 * Usage:
 *   node scripts/encryptDatabase.js
 *   npm run db:encrypt
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '..', 'db', 'database.db');
const tempEncryptedPath = path.resolve(__dirname, '..', 'db', 'database_encrypted.db');
const backupPath = path.resolve(__dirname, '..', 'db', `database_plain_backup_${Date.now()}.db`);

// Check driver: prefer @journeyapps/sqlcipher
let sqlite;
try {
  sqlite = require('@journeyapps/sqlcipher');
} catch (e1) {
  try {
    sqlite = require('sqlite3');
  } catch (e2) {
    console.error('[ENCRYPT] Neither @journeyapps/sqlcipher nor sqlite3 is installed.');
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
  console.error('[ENCRYPT] Error: No encryption key specified.');
  console.error('[ENCRYPT] Please configure DB_ENCRYPTION_KEY in your .env file.');
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
    console.log(`[ENCRYPT] No existing database found at ${dbPath}.`);
    console.log('[ENCRYPT] A fresh encrypted database will automatically be initialized when the app runs.');
    return;
  }

  if (isDatabaseEncrypted(dbPath)) {
    console.log('[ENCRYPT] The database is already encrypted with SQLCipher AES-256.');
    return;
  }

  console.log(`[ENCRYPT] Plaintext database detected at: ${dbPath}`);
  console.log('[ENCRYPT] Preparing to encrypt with SQLCipher AES-256...');

  if (fs.existsSync(tempEncryptedPath)) {
    fs.unlinkSync(tempEncryptedPath);
  }

  const pragmaKey = formatPragmaKey(rawKey);

  // Connect to unencrypted database without key
  const plainDb = new sqlite.Database(dbPath);

  await new Promise((resolve, reject) => {
    plainDb.serialize(() => {
      // 1. Flush any uncommitted WAL data into database file
      plainDb.run('PRAGMA wal_checkpoint(TRUNCATE);');

      // 2. Attach new encrypted database file with key
      const escapedTempPath = tempEncryptedPath.replace(/'/g, "''");
      const attachSql = `ATTACH DATABASE '${escapedTempPath}' AS encrypted KEY ${pragmaKey};`;
      plainDb.run(attachSql, (err) => {
        if (err) return reject(new Error(`Attach failed: ${err.message}`));
      });

      // 3. Export all tables, schema, data and indexes to encrypted database
      plainDb.run("SELECT sqlcipher_export('encrypted');", (err) => {
        if (err) return reject(new Error(`sqlcipher_export failed: ${err.message}`));
      });

      // 4. Detach encrypted database
      plainDb.run('DETACH DATABASE encrypted;', (err) => {
        if (err) return reject(new Error(`Detach failed: ${err.message}`));
        resolve();
      });
    });
  });

  // Close unencrypted connection
  await new Promise((resolve, reject) => {
    plainDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  if (!fs.existsSync(tempEncryptedPath) || fs.statSync(tempEncryptedPath).size === 0) {
    throw new Error('Encryption output file is missing or empty.');
  }

  // Backup original unencrypted file
  fs.copyFileSync(dbPath, backupPath);
  console.log(`[ENCRYPT] Plaintext backup preserved at: ${backupPath}`);

  // Replace original database with encrypted database
  fs.copyFileSync(tempEncryptedPath, dbPath);
  fs.unlinkSync(tempEncryptedPath);

  // Clean up legacy WAL/SHM files
  const shmPath = `${dbPath}-shm`;
  const walPath = `${dbPath}-wal`;
  if (fs.existsSync(shmPath)) try { fs.unlinkSync(shmPath); } catch (e) {}
  if (fs.existsSync(walPath)) try { fs.unlinkSync(walPath); } catch (e) {}

  // Verify encrypted database can be opened with the key
  const verifyDb = new sqlite.Database(dbPath);
  await new Promise((resolve, reject) => {
    verifyDb.serialize(() => {
      verifyDb.run(`PRAGMA key = ${pragmaKey};`);
      verifyDb.get('SELECT count(*) as count FROM sqlite_master;', (err, row) => {
        if (err) return reject(new Error(`Verification query failed: ${err.message}`));
        console.log(`[ENCRYPT] Verification successful. Objects in encrypted database: ${row?.count || 0}`);
        resolve();
      });
    });
  });

  await new Promise((resolve) => verifyDb.close(resolve));

  console.log('[ENCRYPT] SUCCESS: Database is now fully encrypted with SQLCipher AES-256!');
}

run().catch((err) => {
  console.error('[ENCRYPT] Failed to encrypt database:', err.message);
  process.exit(1);
});
