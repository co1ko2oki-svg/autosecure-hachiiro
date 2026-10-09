/**
 * Global Graceful Shutdown and Exception Management Module
 * Prevents zombie processes, ensures clean closure of HTTP servers, database,
 * Discord gateway connections, timers, and allows orchestrators (PM2, systemd, Docker)
 * to restart properly upon fatal errors without infinite crash loops.
 */

let isShuttingDown = false;
const activeServers = new Set();
const activeClients = new Set();
const cleanupCallbacks = new Set();

/**
 * Register an active HTTP/HTTPS server for graceful shutdown.
 * @param {import('http').Server} server
 */
function registerServer(server) {
    if (server) activeServers.add(server);
}

/**
 * Register a Discord client for graceful destruction.
 * @param {any} client
 */
function registerClient(client) {
    if (client) activeClients.add(client);
}

/**
 * Register an arbitrary cleanup callback.
 * @param {Function} fn
 */
function registerCleanup(fn) {
    if (typeof fn === 'function') cleanupCallbacks.add(fn);
}

/**
 * Perform coordinated graceful shutdown of all application components.
 * @param {string} reason
 * @param {number} exitCode
 */
async function performShutdown(reason = 'UNKNOWN', exitCode = 0) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[SHUTDOWN] Initiating graceful shutdown (Reason: ${reason}, Exit Code: ${exitCode})...`);

    // Force terminate after 10 seconds if any handle refuses to close
    const forceTimer = setTimeout(() => {
        console.error('[SHUTDOWN] Forced termination after 10s shutdown timeout.');
        process.exit(exitCode);
    }, 10000);
    if (forceTimer.unref) forceTimer.unref();

    // 1. Stop accepting new HTTP requests and close servers
    for (const srv of activeServers) {
        try {
            if (srv && typeof srv.close === 'function') {
                srv.close();
            }
        } catch (e) {
            console.error('[SHUTDOWN] Error closing server:', e.message);
        }
    }

    // 2. Run custom cleanup handlers
    for (const cleanup of cleanupCallbacks) {
        try {
            await Promise.resolve(cleanup());
        } catch (e) {
            console.error('[SHUTDOWN] Error during cleanup callback:', e.message);
        }
    }

    // 3. Gracefully disconnect Discord clients
    for (const client of activeClients) {
        try {
            if (client && typeof client.destroy === 'function') {
                await Promise.resolve(client.destroy());
            }
        } catch (e) {
            console.error('[SHUTDOWN] Error destroying Discord client:', e.message);
        }
    }

    // 4. Close SQLite database connections if open
    try {
        const { db } = require('../../../db/database');
        if (db && typeof db.close === 'function') {
            await new Promise((resolve) => {
                db.close((err) => {
                    if (err) console.error('[SHUTDOWN] Database close error:', err.message);
                    resolve();
                });
            });
        }
    } catch (e) {}

    clearTimeout(forceTimer);
    console.log('[SHUTDOWN] All resources cleanly released. Exiting.');
    process.exit(exitCode);
}

/**
 * Checks whether an error is benign/recoverable and does not indicate corrupted state.
 * @param {any} err
 * @returns {boolean}
 */
function isRecoverableError(err) {
    if (!err) return false;
    const msg = String(err.message || err);
    const code = err.code;

    // Discord API interaction timeout/unknown (code 10062) - harmless event expiration
    if (code === 10062 || code === '10062' || msg.includes('Unknown interaction')) return true;
    // Transient client disconnect / aborted HTTP requests
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECANCELED' || code === 'ERR_STREAM_PREMATURE_CLOSE') return true;
    if (msg.includes('aborted') || msg.includes('socket hang up')) return true;

    return false;
}

/**
 * Installs global process signal & exception handlers.
 * @param {string} serviceName
 */
function setupGlobalErrorHandlers(serviceName = 'App') {
    if (global.__GLOBAL_ERROR_HANDLERS_SET__) return;
    global.__GLOBAL_ERROR_HANDLERS_SET__ = true;

    process.on('SIGTERM', () => {
        console.log(`[${serviceName}] Received SIGTERM signal.`);
        performShutdown('SIGTERM', 0);
    });

    process.on('SIGINT', () => {
        console.log(`[${serviceName}] Received SIGINT signal.`);
        performShutdown('SIGINT', 0);
    });

    process.on('unhandledRejection', (reason, promise) => {
        if (isRecoverableError(reason)) {
            return;
        }
        console.error(`[${serviceName}] [FATAL UNHANDLED REJECTION]:`, reason);
        performShutdown('unhandledRejection', 1);
    });

    process.on('uncaughtException', (err, origin) => {
        if (isRecoverableError(err)) {
            console.warn(`[${serviceName}] [RECOVERABLE EXCEPTION]:`, err.message);
            return;
        }
        console.error(`[${serviceName}] [FATAL UNCAUGHT EXCEPTION]:`, err ? err.stack || err.message : err);
        performShutdown('uncaughtException', 1);
    });
}

module.exports = {
    registerServer,
    registerClient,
    registerCleanup,
    performShutdown,
    setupGlobalErrorHandlers,
    isRecoverableError
};
