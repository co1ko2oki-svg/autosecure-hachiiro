/**
 * Enterprise CMD / Terminal Logger for VinGr0ups3cur3 & Mainbot.
 * Features:
 * - Vibrant ANSI colors & formatted badges for instant visual tracking.
 * - Automatic timestamps [HH:mm:ss].
 * - Clean section dividers and summary boxes.
 * - Deep redaction of sensitive credentials (tokens, passwords, cookies, recovery codes).
 * - Full backward compatibility with existing log.info(msg) calls.
 */

const crypto = require("crypto");
const { sanitize, sanitizeString, maskEmail } = require("../logging/redactor");

// ANSI Color codes
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright Foreground
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background
  bgRed: "\x1b[41m\x1b[97m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m",
  bgBlue: "\x1b[44m\x1b[97m",
  bgMagenta: "\x1b[45m\x1b[97m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgDark: "\x1b[100m\x1b[97m"
};

const SENSITIVE_KEYWORDS = new Set([
  "password", "newpassword", "oldpassword", "token", "accesstoken",
  "refreshtoken", "msauth", "cookie", "cookies", "canary", "apicanary",
  "formcanary", "amsc", "amrp", "amc", "jwt", "secret", "secretkey",
  "recovery", "recoverycode", "captcha", "captchatoken", "sessionid", "ssid"
]);

function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sanitizeValue(key, val) {
  if (val === null || val === undefined) return "";
  const lowerKey = String(key || "").toLowerCase();
  const strVal = String(val);

  if (SENSITIVE_KEYWORDS.has(lowerKey) || lowerKey.includes("pass") || lowerKey.includes("token") || lowerKey.includes("secret") || lowerKey.includes("cookie")) {
    if (!val) return "[EMPTY]";
    const fp = crypto.createHash("sha256").update(strVal).digest("hex").substring(0, 6);
    return `[REDACTED fp=${fp}]`;
  }

  if (lowerKey.includes("email") || lowerKey.includes("alias")) {
    return maskEmail(strVal);
  }

  return sanitizeString(strVal);
}

class TerminalLogger {
  constructor() {
    this.enabled = true;
    this.debugEnabled = true;
  }

  prefix(badge, badgeColor) {
    const time = `${C.gray}[${getTimestamp()}]${C.reset}`;
    const tag = `${badgeColor} ${badge} ${C.reset}`;
    return `${time} ${tag}`;
  }

  info(moduleOrMsg, maybeMsg = null) {
    if (!this.enabled) return;
    const isTwoArg = maybeMsg !== null;
    const mod = isTwoArg ? moduleOrMsg : "INFO";
    const msg = sanitizeString(isTwoArg ? maybeMsg : moduleOrMsg);
    console.log(`${this.prefix("ℹ INFO", C.bgCyan)} ${C.cyan}[${mod}]${C.reset} ${msg}`);
  }

  success(moduleOrMsg, maybeMsg = null) {
    if (!this.enabled) return;
    const isTwoArg = maybeMsg !== null;
    const mod = isTwoArg ? moduleOrMsg : "SUCCESS";
    const msg = sanitizeString(isTwoArg ? maybeMsg : moduleOrMsg);
    console.log(`${this.prefix("✔ SUCCESS", C.bgGreen)} ${C.green}[${mod}]${C.reset} ${C.brightGreen}${msg}${C.reset}`);
  }

  warn(moduleOrMsg, maybeMsg = null) {
    if (!this.enabled) return;
    const isTwoArg = maybeMsg !== null;
    const mod = isTwoArg ? moduleOrMsg : "WARN";
    const msg = sanitizeString(isTwoArg ? maybeMsg : moduleOrMsg);
    console.log(`${this.prefix("⚠ WARN", C.bgYellow)} ${C.yellow}[${mod}]${C.reset} ${C.brightYellow}${msg}${C.reset}`);
  }

  warning(moduleOrMsg, maybeMsg = null) {
    this.warn(moduleOrMsg, maybeMsg);
  }

  error(moduleOrMsg, maybeMsg = null) {
    if (!this.enabled) return;
    const isTwoArg = maybeMsg !== null;
    const mod = isTwoArg ? moduleOrMsg : "ERROR";
    const msg = sanitizeString(isTwoArg ? maybeMsg : moduleOrMsg);
    console.error(`${this.prefix("✖ ERROR", C.bgRed)} ${C.red}[${mod}]${C.reset} ${C.brightRed}${msg}${C.reset}`);
  }

  step(module, stepName, details = "") {
    if (!this.enabled) return;
    const time = `${C.gray}[${getTimestamp()}]${C.reset}`;
    const badge = `${C.brightMagenta}⚡ STEP${C.reset}`;
    const modStr = `${C.bold}${C.magenta}[${module}]${C.reset}`;
    const stepStr = `${C.cyan}▸ ${stepName}${C.reset}`;
    const cleanDetails = details ? sanitizeString(String(details)) : "";
    const detailStr = cleanDetails ? ` ${C.gray}→ ${cleanDetails}${C.reset}` : "";
    console.log(`${time} ${badge} ${modStr} ${stepStr}${detailStr}`);
  }

  stateVerified(module, message, data = {}) {
    if (!this.enabled) return;
    const time = `${C.gray}[${getTimestamp()}]${C.reset}`;
    const badge = `${C.bgGreen} STATE VERIFIED ${C.reset}`;
    const modStr = `${C.bold}${C.green}[${module}]${C.reset}`;
    const cleanMsg = sanitizeString(message);
    console.log(`${time} ${badge} ${modStr} ${C.brightGreen}${cleanMsg}${C.reset}`);
  }

  debugging(msg) {
    if (!this.debugEnabled) return;
    const time = `${C.gray}[${getTimestamp()}]${C.reset}`;
    const cleanMsg = sanitizeString(msg);
    console.log(`${time} ${C.gray}[DEBUG] ${cleanMsg}${C.reset}`);
  }

  msg(raw) {
    if (this.enabled) {
      console.log(sanitizeString(raw));
    }
  }

  /**
   * Prominent Boxed Header Banner for high-level operations.
   */
  banner(title, subtitle = "") {
    const width = 64;
    const border = "═".repeat(width);
    console.log(`\n${C.brightCyan}╔${border}╗${C.reset}`);
    console.log(`${C.brightCyan}║${C.reset}  ${C.bold}${C.brightWhite}${title.padEnd(width - 2)}${C.reset}${C.brightCyan}║${C.reset}`);
    if (subtitle) {
      console.log(`${C.brightCyan}║${C.reset}  ${C.gray}${subtitle.padEnd(width - 2)}${C.reset}${C.brightCyan}║${C.reset}`);
    }
    console.log(`${C.brightCyan}╚${border}╝${C.reset}\n`);
  }

  /**
   * Neat Key-Value Summary Card.
   */
  summaryBox(title, rows = []) {
    const width = 62;
    console.log(`\n${C.cyan}┌── ${C.bold}${title} ${C.cyan}${"─".repeat(Math.max(2, width - title.length - 5))}┐${C.reset}`);
    for (const [key, value] of rows) {
      const cleanKey = String(key || "");
      const cleanVal = sanitizeValue(cleanKey, value);
      const line = `  ${C.gray}•${C.reset} ${C.white}${cleanKey}:${C.reset} ${C.brightGreen}${cleanVal}${C.reset}`;
      console.log(`${line}`);
    }
    console.log(`${C.cyan}└──${"─".repeat(width)}┘${C.reset}\n`);
  }

  divider() {
    console.log(`${C.gray}${"─".repeat(64)}${C.reset}`);
  }
}

const loggerInstance = new TerminalLogger();

// Backward compatibility properties
loggerInstance.log = true;
loggerInstance.debug = true;
loggerInstance.C = C;

module.exports = loggerInstance;