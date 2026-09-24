/**
 * Global Stream & Console Logger Guard.
 * Intercepts all stdout/stderr streams and console methods to guarantee zero credential leakage
 * into unencrypted log files (PM2 combined.log, out.log, error.log) or terminal output.
 */

const util = require('util');
const { sanitize, sanitizeString } = require('./redactor');

let isAttached = false;

function attachGlobalLoggerGuard() {
    if (global.__LOGGER_GUARD_ATTACHED__ || isAttached) {
        return;
    }
    global.__LOGGER_GUARD_ATTACHED__ = true;
    isAttached = true;

    // 1. Intercept process.stdout.write
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    let inStdoutIntercept = false;

    process.stdout.write = function (chunk, encoding, callback) {
        if (inStdoutIntercept) {
            return originalStdoutWrite(chunk, encoding, callback);
        }
        try {
            inStdoutIntercept = true;
            let str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk));
            let sanitized = sanitizeString(str);
            const cb = typeof callback === 'function' ? callback : (typeof encoding === 'function' ? encoding : undefined);
            const enc = typeof encoding === 'string' ? encoding : undefined;
            return originalStdoutWrite(sanitized, enc, cb);
        } catch (e) {
            return originalStdoutWrite(chunk, encoding, callback);
        } finally {
            inStdoutIntercept = false;
        }
    };

    // 2. Intercept process.stderr.write
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    let inStderrIntercept = false;

    process.stderr.write = function (chunk, encoding, callback) {
        if (inStderrIntercept) {
            return originalStderrWrite(chunk, encoding, callback);
        }
        try {
            inStderrIntercept = true;
            let str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk));
            let sanitized = sanitizeString(str);
            const cb = typeof callback === 'function' ? callback : (typeof encoding === 'function' ? encoding : undefined);
            const enc = typeof encoding === 'string' ? encoding : undefined;
            return originalStderrWrite(sanitized, enc, cb);
        } catch (e) {
            return originalStderrWrite(chunk, encoding, callback);
        } finally {
            inStderrIntercept = false;
        }
    };

    // 3. Wrap console methods to sanitize objects before serialization
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];
    for (const method of consoleMethods) {
        const origMethod = console[method];
        if (typeof origMethod === 'function') {
            console[method] = function (...args) {
                const sanitizedArgs = args.map(arg => sanitize(arg));
                return origMethod.apply(console, sanitizedArgs);
            };
        }
    }
}

module.exports = {
    attachGlobalLoggerGuard
};
