/**
 * Canonical email normalization, validation, safe metadata masking,
 * error classification, per-account concurrency locking, and state management.
 * Consolidates all state-machine and synchronization primitives inside autosecure.
 */

const crypto = require("crypto");

const ALIAS_STATES = Object.freeze({
  INITIAL: "INITIAL",
  BEFORE_READ: "BEFORE_READ",
  READY: "READY",
  VALIDATION: "VALIDATION",
  MUTATION_PENDING: "MUTATION_PENDING",
  REQUEST_ACCEPTED: "REQUEST_ACCEPTED",
  SERVER_CONFIRMED: "SERVER_CONFIRMED",
  STATE_REFRESH: "STATE_REFRESH",
  VERIFIED: "VERIFIED",
  STATE_VERIFIED: "STATE_VERIFIED",
  PERSISTED: "PERSISTED",
  FAILED: "FAILED",
  NEEDS_RETRY: "NEEDS_RETRY"
});

const MUTATION_RESULTS = Object.freeze({
  MUTATION_CONFIRMED: "MUTATION_CONFIRMED",
  MUTATION_REJECTED: "MUTATION_REJECTED",
  MUTATION_REDIRECTED: "MUTATION_REDIRECTED",
  MUTATION_AUTH_REQUIRED: "MUTATION_AUTH_REQUIRED",
  MUTATION_CHALLENGED: "MUTATION_CHALLENGED",
  MUTATION_UNKNOWN: "MUTATION_UNKNOWN",
  STATE_MISMATCH: "STATE_MISMATCH"
});

const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  MFA_REQUIRED: "MFA_REQUIRED",
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  STATE_MISMATCH: "STATE_MISMATCH",
  UNKNOWN: "UNKNOWN"
});

class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AppError";
    this.code = code in ERROR_CODES ? code : ERROR_CODES.UNKNOWN;
    this.httpStatus = details.httpStatus || null;
    this.operation = details.operation || null;
    this.accountId = details.accountId || null;
    this.isRetryable = details.isRetryable ?? AppError.isCodeRetryable(this.code);
    this.timestamp = new Date().toISOString();
  }

  static isCodeRetryable(code) {
    switch (code) {
      case ERROR_CODES.RATE_LIMITED:
      case ERROR_CODES.NETWORK_ERROR:
      case ERROR_CODES.SERVER_ERROR:
      case ERROR_CODES.STATE_MISMATCH:
        return true;
      default:
        return false;
    }
  }
}

function classifyError(error, context = {}) {
  if (error instanceof AppError) return error;

  const message = error?.message || String(error || "Unknown error occurred");
  const status = error?.response?.status || error?.status || null;
  const data = error?.response?.data;
  const rawText = typeof data === "string" ? data : (data ? JSON.stringify(data) : "");

  let code = ERROR_CODES.UNKNOWN;
  let isRetryable = false;

  if (status === 401 || status === 403) {
    code = (rawText.includes("proofs") || rawText.includes("challenge") || rawText.includes("consent"))
      ? ERROR_CODES.MFA_REQUIRED
      : ERROR_CODES.AUTH_REQUIRED;
  } else if (status === 429) {
    code = ERROR_CODES.RATE_LIMITED;
    isRetryable = true;
  } else if (status === 404) {
    code = ERROR_CODES.NOT_FOUND;
  } else if (status === 409) {
    code = ERROR_CODES.CONFLICT;
  } else if (status >= 500 && status < 600) {
    code = ERROR_CODES.SERVER_ERROR;
    isRetryable = true;
  }

  const msErrorCode = data?.error?.code || data?.errorCode;
  if (msErrorCode === "1282" || rawText.includes('code="1282"')) {
    code = ERROR_CODES.RATE_LIMITED;
    isRetryable = true;
  } else if (msErrorCode === "InvalidCanary" || rawText.includes("error_InvalidCanary")) {
    code = ERROR_CODES.AUTH_REQUIRED;
    isRetryable = true;
  } else if (rawText.includes("captcha") || rawText.includes("hipAction")) {
    code = ERROR_CODES.CAPTCHA_REQUIRED;
  } else if (rawText.includes("login.live.com") || rawText.includes("/login.srf")) {
    code = ERROR_CODES.AUTH_REQUIRED;
  }

  const lowerMsg = message.toLowerCase();
  if (
    lowerMsg.includes("etimedout") ||
    lowerMsg.includes("econnrefused") ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("enotfound") ||
    lowerMsg.includes("socket hang up") ||
    lowerMsg.includes("network error") ||
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT"
  ) {
    code = ERROR_CODES.NETWORK_ERROR;
    isRetryable = true;
  }

  if (lowerMsg.includes("state mismatch") || lowerMsg.includes("verification failed")) {
    code = ERROR_CODES.STATE_MISMATCH;
    isRetryable = true;
  }

  return new AppError(code, message, {
    httpStatus: status,
    operation: context.operation,
    accountId: context.accountId,
    isRetryable
  });
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  let clean = email.trim().toLowerCase();
  clean = clean.replace(/^<+|>+$/g, "").replace(/^"+|"+$/g, "");
  return clean;
}

function isSameEmail(emailA, emailB) {
  const a = normalizeEmail(emailA);
  const b = normalizeEmail(emailB);
  if (!a || !b) return false;
  return a === b;
}

function sanitizeAliasPrefix(prefix) {
  if (!prefix || typeof prefix !== "string") return "";
  let clean = prefix.trim().toLowerCase();
  clean = clean.replace(/[^a-z0-9._-]/g, "");
  clean = clean.replace(/^\.+|\.+$/g, "");
  return clean;
}

function isValidAliasInput(name) {
  if (!name || typeof name !== "string") return false;
  const clean = sanitizeAliasPrefix(name);
  return clean.length >= 3 && clean.length <= 64;
}

function safeFingerprint(val) {
  if (val === null || val === undefined || val === "") return "none";
  return crypto.createHash("sha256").update(String(val)).digest("hex").substring(0, 8);
}

function safeMetadata(val) {
  if (val === null || val === undefined || val === "") return "[present=false]";
  const str = String(val);
  return `[present=true, len=${str.length}, fp=${safeFingerprint(str)}]`;
}

function generateCorrelationId() {
  return crypto.randomBytes(4).toString("hex");
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return "[empty]";
  const clean = email.trim();
  const atIdx = clean.indexOf("@");
  if (atIdx === -1) return clean.length <= 3 ? "***" : `${clean.substring(0, 2)}***`;
  const name = clean.substring(0, atIdx);
  const domain = clean.substring(atIdx + 1);
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name.substring(0, 2)}***${name[name.length - 1]}@${domain}`;
}

// In-flight mutex to prevent duplicate concurrent remove requests on the same alias
const inFlightOperations = new Set();

function isAliasOpPending(aliasKey) {
  return inFlightOperations.has(normalizeEmail(aliasKey));
}

function setAliasOpPending(aliasKey) {
  const norm = normalizeEmail(aliasKey);
  if (!norm || inFlightOperations.has(norm)) return false;
  inFlightOperations.add(norm);
  return true;
}

function clearAliasOpPending(aliasKey) {
  const norm = normalizeEmail(aliasKey);
  if (norm) inFlightOperations.delete(norm);
}

/**
 * Per-Account Mutex for serialized mutations.
 */
class AccountOperationLock {
  constructor() {
    this.locks = new Map();
  }

  normalizeKey(key) {
    return key ? String(key).trim().toLowerCase() : "global_unknown";
  }

  async withLock(accountKey, action) {
    const key = this.normalizeKey(accountKey);
    const currentTail = this.locks.get(key) || Promise.resolve();

    let resolveCurrent;
    const nextTail = new Promise((resolve) => {
      resolveCurrent = resolve;
    });

    this.locks.set(key, currentTail.then(() => nextTail));

    try {
      await currentTail;
      return await action();
    } finally {
      resolveCurrent();
      if (this.locks.get(key) === nextTail) {
        this.locks.delete(key);
      }
    }
  }

  isLocked(accountKey) {
    return this.locks.has(this.normalizeKey(accountKey));
  }
}

const accountOperationLock = new AccountOperationLock();

/**
 * Account State Snapshots & Rollback.
 */
class AccountStateManager {
  constructor() {
    this.states = new Map();
    this.snapshots = new Map();
  }

  takeSnapshot(accountId) {
    if (!accountId) return null;
    const current = this.states.get(accountId) || { accountId };
    const snap = JSON.parse(JSON.stringify(current));
    if (!this.snapshots.has(accountId)) this.snapshots.set(accountId, []);
    this.snapshots.get(accountId).push(snap);
    return snap;
  }

  rollback(accountId) {
    if (!accountId) return null;
    const stack = this.snapshots.get(accountId);
    if (stack && stack.length > 0) {
      const prev = stack.pop();
      this.states.set(accountId, prev);
      return prev;
    }
    return null;
  }

  commit(accountId) {
    if (!accountId) return;
    const stack = this.snapshots.get(accountId);
    if (stack && stack.length > 0) stack.pop();
  }

  applyVerifiedState(accountId, verifiedData) {
    const current = this.states.get(accountId) || { accountId };
    const updated = { ...current, ...verifiedData, updatedAt: new Date().toISOString() };
    this.states.set(accountId, updated);
    return updated;
  }
}

const accountStateManager = new AccountStateManager();

const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "oldpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "msauth",
  "cookie",
  "cookies",
  "canary",
  "apicanary",
  "formcanary",
  "amsc",
  "amrp",
  "amc",
  "jwt",
  "secret",
  "secretkey",
  "recovery",
  "recoverycode",
  "captcha",
  "captchatoken",
  "sessionid",
  "ssid",
  "authorization"
]);

function redactObject(obj, depth = 0) {
  if (depth > 6) return "[max_depth]";
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    if (obj.includes("@") && obj.length < 120 && !obj.includes(" ")) {
      return maskEmail(obj);
    }
    return obj;
  }

  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("pass") || lowerKey.includes("secret") || lowerKey.includes("token")) {
      if (value) {
        sanitized[key] = `[REDACTED len=${String(value).length} fp=${safeFingerprint(value)}]`;
      } else {
        sanitized[key] = "[EMPTY]";
      }
    } else if (lowerKey.includes("email") || lowerKey.includes("alias")) {
      sanitized[key] = typeof value === "string" ? maskEmail(value) : redactObject(value, depth + 1);
    } else {
      sanitized[key] = redactObject(value, depth + 1);
    }
  }
  return sanitized;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  red: "\x1b[91m",
  cyan: "\x1b[96m",
  magenta: "\x1b[95m",
  blue: "\x1b[94m",
  white: "\x1b[97m"
};

function formatStatus(status) {
  const s = String(status || "INFO").toUpperCase();
  if (s.includes("VERIFIED") || s.includes("SUCCESS") || s.includes("COMPLETED")) {
    return `${ANSI.green}✔ ${s}${ANSI.reset}`;
  }
  if (s.includes("FAIL") || s.includes("ERROR") || s.includes("BLOCKED")) {
    return `${ANSI.red}✖ ${s}${ANSI.reset}`;
  }
  if (s.includes("WARN") || s.includes("RETRY")) {
    return `${ANSI.yellow}⚠ ${s}${ANSI.reset}`;
  }
  return `${ANSI.cyan}▸ ${s}${ANSI.reset}`;
}

function getSimpleTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class Logger {
  constructor(defaultContext = {}) {
    this.defaultContext = defaultContext;
  }

  logEvent(data) {
    const entry = {
      operation: data.operation || this.defaultContext.operation || "UNKNOWN_OPERATION",
      accountId: data.accountId || this.defaultContext.accountId || "anonymous",
      step: data.step || "EXECUTION",
      requestId: data.requestId || this.defaultContext.requestId || crypto.randomBytes(4).toString("hex"),
      status: data.status || "INFO",
      duration: typeof data.duration === "number" ? Math.round(data.duration) : null,
      errorCode: data.errorCode || null,
      message: data.message || "",
      data: data.data ? redactObject(data.data) : undefined,
      timestamp: new Date().toISOString()
    };

    const timeStr = `${ANSI.gray}[${getSimpleTime()}]${ANSI.reset}`;
    const opStr = `${ANSI.bold}${ANSI.cyan}[${entry.operation}]${ANSI.reset}`;
    const stepStr = `${ANSI.magenta}[${entry.step}]${ANSI.reset}`;
    const statusStr = formatStatus(entry.status);
    const durStr = entry.duration ? ` ${ANSI.green}(${entry.duration}ms)${ANSI.reset}` : "";
    const errStr = entry.errorCode ? ` ${ANSI.red}[${entry.errorCode}]${ANSI.reset}` : "";
    const ctxStr = `${ANSI.gray}req=${entry.requestId} acc=${entry.accountId}${ANSI.reset}`;

    const outStr = `${timeStr} ${opStr} ${stepStr} ${statusStr} ${ctxStr}${durStr}${errStr}: ${ANSI.white}${entry.message}${ANSI.reset}`;

    if (entry.status === "ERROR" || entry.status === "FAILED") {
      console.error(outStr);
    } else if (entry.status === "WARN" || entry.status === "NEEDS_RETRY") {
      console.warn(outStr);
    } else {
      console.log(outStr);
    }

    return entry;
  }

  info(message, extra = {}) {
    return this.logEvent({ status: "INFO", message, ...extra });
  }

  warn(message, extra = {}) {
    return this.logEvent({ status: "WARN", message, ...extra });
  }

  error(message, extra = {}) {
    return this.logEvent({ status: "ERROR", message, ...extra });
  }

  createChild(context = {}) {
    return new Logger({ ...this.defaultContext, ...context });
  }
}

const defaultLogger = new Logger();

async function retryWithBackoff(fn, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const isRetryablePredicate = options.isRetryable ?? ((err) => classifyError(err).isRetryable);

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries) {
        break;
      }

      if (!isRetryablePredicate(err)) {
        break;
      }

      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitterDelay = Math.floor(Math.random() * expDelay);

      if (typeof options.onRetry === "function") {
        try {
          options.onRetry(err, attempt + 1, jitterDelay);
        } catch (_) {}
      }

      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }
  }

  throw lastError;
}

/**
 * Structured Logger with sensitive data masking and ANSI colors.
 */
function logAliasEvent(operation, data = {}) {
  const pairs = [];
  let status = data.status || "INFO";
  let step = data.step || "";

  for (const [k, v] of Object.entries(data)) {
    if (k === "status" || k === "step") continue;
    const lower = k.toLowerCase();
    if (lower.includes("target") || lower.includes("alias") || lower.includes("email")) {
      pairs.push(`${ANSI.cyan}${k}${ANSI.reset}=${ANSI.yellow}${maskEmail(String(v || ""))}${ANSI.reset}`);
    } else if (lower.includes("password") || lower.includes("token") || lower.includes("secret") || lower.includes("cookie")) {
      pairs.push(`${ANSI.gray}${k}=[REDACTED]${ANSI.reset}`);
    } else {
      pairs.push(`${ANSI.gray}${k}=${v}${ANSI.reset}`);
    }
  }

  const timeStr = `${ANSI.gray}[${getSimpleTime()}]${ANSI.reset}`;
  const opBadge = `${ANSI.bold}${ANSI.cyan}[${operation}]${ANSI.reset}`;
  const stepBadge = step ? `${ANSI.magenta}[${step}]${ANSI.reset} ` : "";
  const statusBadge = formatStatus(status);
  const details = pairs.length > 0 ? ` ${pairs.join(" ")}` : "";

  console.log(`${timeStr} ${opBadge} ${stepBadge}${statusBadge}${details}`);
}

module.exports = {
  ALIAS_STATES,
  OPERATION_STATES: ALIAS_STATES,
  MUTATION_RESULTS,
  ERROR_CODES,
  ALIAS_ERROR_CODES: ERROR_CODES,
  AppError,
  AliasOperationError: AppError,
  classifyError,
  normalizeEmail,
  isSameEmail,
  sanitizeAliasPrefix,
  isValidAliasInput,
  safeFingerprint,
  safeMetadata,
  generateCorrelationId,
  maskEmail,
  redactObject,
  Logger,
  logger: defaultLogger,
  retryWithBackoff,
  isAliasOpPending,
  setAliasOpPending,
  clearAliasOpPending,
  logAliasEvent,
  AccountOperationLock,
  accountOperationLock,
  AccountStateManager,
  accountStateManager
};
