const axios = require("axios");
const http = require("http");
const https = require("https");
const { HttpProxyAgent } = require("http-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

const config = require("../../../config.json");

// Direct connection Keep-Alive agent pool
const defaultHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  maxHeaderSize: 65536
});

const defaultHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  maxHeaderSize: 65536
});

// Proxy Keep-Alive agent pool cache
const proxyAgentPool = new Map();

function getCachedProxyAgent(proxyUrl) {
  if (proxyAgentPool.has(proxyUrl)) {
    return proxyAgentPool.get(proxyUrl);
  }

  const isSocks = proxyUrl.startsWith("socks");
  const agentOptions = {
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 30000,
    maxHeaderSize: 65536
  };

  const agent = isSocks
    ? new SocksProxyAgent(proxyUrl, agentOptions)
    : new HttpsProxyAgent(proxyUrl, agentOptions);

  proxyAgentPool.set(proxyUrl, agent);
  return agent;
}

function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Parses a Set-Cookie header string into a structured cookie object.
 */
function parseSetCookie(cookieStr, originUrl = null) {
  if (!cookieStr || typeof cookieStr !== "string") return null;

  const parts = cookieStr.split(";").map((p) => p.trim());
  if (parts.length === 0 || !parts[0]) return null;

  const firstEqual = parts[0].indexOf("=");
  if (firstEqual === -1) return null;

  const name = parts[0].substring(0, firstEqual).trim();
  const value = parts[0].substring(firstEqual + 1).trim();
  if (!name) return null;

  let domain = null;
  let path = "/";
  let expires = null;
  let maxAge = null;
  let isDeleted = false;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eqIdx = p.indexOf("=");
    const key = (eqIdx !== -1 ? p.substring(0, eqIdx) : p).trim().toLowerCase();
    const val = eqIdx !== -1 ? p.substring(eqIdx + 1).trim() : "";

    if (key === "domain" && val) {
      domain = val.startsWith(".") ? val.substring(1).toLowerCase() : val.toLowerCase();
    } else if (key === "path" && val) {
      path = val;
    } else if (key === "max-age" && val) {
      maxAge = parseInt(val, 10);
      if (!isNaN(maxAge) && maxAge <= 0) {
        isDeleted = true;
      }
    } else if (key === "expires" && val) {
      const expDate = new Date(val);
      if (!isNaN(expDate.getTime())) {
        expires = expDate;
        if (expDate.getTime() <= Date.now()) {
          isDeleted = true;
        }
      }
    }
  }

  // If domain is not specified, derive from origin URL
  if (!domain && originUrl) {
    try {
      const parsedUrl = new URL(originUrl);
      domain = parsedUrl.hostname.toLowerCase();
    } catch (e) {}
  }

  if (value === "" && (maxAge === 0 || isDeleted)) {
    isDeleted = true;
  }

  return {
    name,
    value,
    domain: domain || "",
    path,
    expires,
    maxAge,
    isDeleted
  };
}

/**
 * Checks if a cookie domain matches a request hostname.
 */
function domainMatches(cookieDomain, requestHost) {
  if (!cookieDomain || !requestHost) return true; // Loose fallback if unknown
  const cDom = cookieDomain.toLowerCase().replace(/^\./, "");
  const rHost = requestHost.toLowerCase();
  return rHost === cDom || rHost.endsWith(`.${cDom}`);
}

class HttpClient {
  /**
   * @param {boolean} [useProxy=true] - Whether this client may use the proxy
   *   configured in config.json. Defaults to true so existing `new HttpClient()`
   *   and `new HttpClient(true)` call sites behave identically. Pass `false` to
   *   force a direct connection for this instance regardless of config.useproxy
   *   (previously this argument was accepted but silently ignored).
   */
  constructor(useProxy = true) {
    this._useProxy = useProxy !== false;
    this._cookieJar = new Map(); // key: `${domain}:${path}:${name}` -> cookieObj
    this.axios = axios.create({
      timeout: 10000,
      maxRedirects: 0,
      withCredentials: true,
      httpAgent: defaultHttpAgent,
      httpsAgent: defaultHttpsAgent,
      validateStatus: (status) => status >= 200 && status < 600,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      }
    });

    // Request interceptor: inject domain-scoped cookies
    this.axios.interceptors.request.use((axiosConfig) => {
      let reqHost = "";
      try {
        if (axiosConfig.url) {
          const parsed = new URL(axiosConfig.url, axiosConfig.baseURL);
          reqHost = parsed.hostname;
        }
      } catch (e) {}

      const matchingCookies = [];
      for (const cookie of this._cookieJar.values()) {
        if (cookie.isDeleted) continue;
        if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;

        if (domainMatches(cookie.domain, reqHost)) {
          matchingCookies.push(`${cookie.name}=${cookie.value}`);
        }
      }

      if (matchingCookies.length > 0) {
        axiosConfig.headers["Cookie"] = matchingCookies.join("; ");
      } else {
        delete axiosConfig.headers["Cookie"];
      }

      return axiosConfig;
    });

    // Response interceptor: parse and store Set-Cookie with lifecycle management
    this.axios.interceptors.response.use((response) => {
      const setCookieHeader = response.headers ? response.headers["set-cookie"] : null;
      let reqUrl = response.config ? response.config.url : null;

      if (setCookieHeader) {
        const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        for (const cookieStr of list) {
          this.setCookie(cookieStr, reqUrl);
        }
      }
      return response;
    });

    // Proxy interceptor with Keep-Alive connection pooling
    this.axios.interceptors.request.use(async (axiosConfig) => {
      // config.useproxy may be a real boolean OR the string "true" (it is stored
      // as a string in config.json). The strict `=== true` check silently
      // skipped proxying whenever it was a string, so every request went out
      // from the raw VPS/datacenter IP — which Microsoft answers with HTTP 403
      // on mutation endpoints (AddAssocId, MakePrimary). Accept both forms, the
      // same way bancheck.js and checklocked.js already do.
      const proxyEnabled =
        this._useProxy && (config.useproxy === true || config.useproxy === "true");
      // `_noProxy` forces a direct connection and restores default keep-alive agent pool.
      if (axiosConfig._noProxy || axiosConfig.proxy === false) {
        axiosConfig.httpAgent = defaultHttpAgent;
        axiosConfig.httpsAgent = defaultHttpsAgent;
        return axiosConfig;
      }

      if (proxyEnabled && config.proxy) {
        try {
          // Handle both string and array for config.proxy
          const proxies = Array.isArray(config.proxy)
            ? config.proxy.filter(Boolean)
            : [config.proxy];
          if (proxies.length === 0) throw new Error("Proxy array is empty");

          // `_proxyIndex` lets _requestWithRetry deterministically rotate through
          // proxies on retry; otherwise pick one at random.
          const idx =
            typeof axiosConfig._proxyIndex === "number"
              ? axiosConfig._proxyIndex % proxies.length
              : Math.floor(Math.random() * proxies.length);

          const [PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS] = proxies[idx].split(":");
          const auth = PROXY_USER && PROXY_PASS ? `${encodeURIComponent(PROXY_USER)}:${encodeURIComponent(PROXY_PASS)}@` : "";
          const proxyUrlStr = `${auth}${PROXY_HOST}:${PROXY_PORT}`;
          const proxyUrl = proxyUrlStr.startsWith('http') || proxyUrlStr.startsWith('socks') ? proxyUrlStr : `http://${proxyUrlStr}`;
          const agent = getCachedProxyAgent(proxyUrl);
          axiosConfig.httpAgent = agent;
          axiosConfig.httpsAgent = agent;
        } catch (error) {
          console.error("Error setting up proxy for request:", error);
          axiosConfig.httpAgent = defaultHttpAgent;
          axiosConfig.httpsAgent = defaultHttpsAgent;
        }
      } else {
        axiosConfig.httpAgent = defaultHttpAgent;
        axiosConfig.httpsAgent = defaultHttpsAgent;
      }
      return axiosConfig;
    });
  }

  // Getter for backward compatibility: returns list of name=value pairs
  get cookies() {
    const list = [];
    for (const cookie of this._cookieJar.values()) {
      if (!cookie.isDeleted && (!cookie.expires || cookie.expires.getTime() > Date.now())) {
        list.push(`${cookie.name}=${cookie.value}`);
      }
    }
    return list;
  }

  set cookies(val) {
    if (Array.isArray(val)) {
      this.clearCookies();
      for (const c of val) {
        this.setCookie(c);
      }
    }
  }

  getCookie(cName, domain = null) {
    for (const cookie of this._cookieJar.values()) {
      if (cookie.name === cName) {
        if (cookie.isDeleted || (cookie.expires && cookie.expires.getTime() <= Date.now())) {
          continue;
        }
        if (!domain || domainMatches(cookie.domain, domain)) {
          return cookie.value;
        }
      }
    }
    return null;
  }

  setCookie(cookieStr, originUrl = null) {
    const parsed = parseSetCookie(cookieStr, originUrl);
    if (!parsed) return;

    const key = `${parsed.domain}:${parsed.path}:${parsed.name}`;
    if (parsed.isDeleted) {
      this._cookieJar.delete(key);
    } else {
      this._cookieJar.set(key, parsed);
    }
  }

  getCookieString(domain = null) {
    const matching = [];
    for (const cookie of this._cookieJar.values()) {
      if (cookie.isDeleted) continue;
      if (cookie.expires && cookie.expires.getTime() <= Date.now()) continue;

      if (!domain || domainMatches(cookie.domain, domain)) {
        matching.push(`${cookie.name}=${cookie.value}`);
      }
    }
    return matching.join("; ");
  }

  clearCookies() {
    this._cookieJar.clear();
  }

  async get(url, axiosConfig = {}, retries = 2) {
    if (!isValidUrl(url)) throw new Error(`Invalid URL ${url}`);

    if (axiosConfig && axiosConfig.maxRedirects === 0) {
      return this._requestWithRetry("get", url, axiosConfig, retries);
    }

    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirectHops =
      axiosConfig && typeof axiosConfig.maxRedirects === "number"
        ? axiosConfig.maxRedirects
        : 5;

    while (redirectCount <= maxRedirectHops) {
      const response = await this._requestWithRetry("get", currentUrl, axiosConfig, retries);
      const status = response?.status;
      const location = response?.headers?.location;

      if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < maxRedirectHops) {
        try {
          const resolvedUrl = new URL(location, currentUrl).toString();
          currentUrl = resolvedUrl;
          redirectCount++;
          continue;
        } catch (e) {
          return response;
        }
      }
      return response;
    }
  }

  async post(url, data, axiosConfig = {}, retries = 2) {
    if (!isValidUrl(url)) throw new Error("Invalid URL");
    return this._requestWithRetry("post", url, data, axiosConfig, retries);
  }

  async put(url, data, axiosConfig = {}, retries = 2) {
    if (!isValidUrl(url)) throw new Error("Invalid URL");
    return this._requestWithRetry("put", url, data, axiosConfig, retries);
  }

  async delete(url, axiosConfig = {}, retries = 2) {
    if (!isValidUrl(url)) throw new Error("Invalid URL");
    return this._requestWithRetry("delete", url, axiosConfig, retries);
  }

  async _requestWithRetry(method, url, ...args) {
    const retries = args[args.length - 1];
    const requestArgs = args.slice(0, -1);
    const configIdx = requestArgs.length - 1;
    const baseConfig =
      requestArgs[configIdx] && typeof requestArgs[configIdx] === "object"
        ? requestArgs[configIdx]
        : {};

    const proxies = Array.isArray(config.proxy)
      ? config.proxy.filter(Boolean)
      : config.proxy
      ? [config.proxy]
      : [];
    const proxyEnabled =
      this._useProxy &&
      (config.useproxy === true || config.useproxy === "true") &&
      proxies.length > 0;

    let lastError = null;
    let lastResponse = null;

    // Ensure we always attempt all available proxies plus at least 1 direct-connection fallback attempt
    const maxAttempts = proxyEnabled ? Math.max(retries, proxies.length + 1) : retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const attemptConfig = { ...baseConfig };
      if (proxyEnabled) {
        if (attempt < proxies.length) {
          attemptConfig._proxyIndex = attempt;
        } else {
          attemptConfig._noProxy = true;
        }
      }
      const attemptArgs = [...requestArgs.slice(0, configIdx), attemptConfig];

      try {
        const response = await this.axios[method](url, ...attemptArgs);

        if (
          response &&
          (response.status === 403 || response.status === 429) &&
          proxyEnabled &&
          attempt < maxAttempts - 1
        ) {
          lastResponse = response;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        // If a proxy request failed with a connection/network error, warn and seamlessly proceed to the next proxy or direct
        if (attempt < maxAttempts - 1) {
          console.warn(`[HTTP_CLIENT] Attempt ${attempt + 1}/${maxAttempts} (${attempt < proxies.length ? 'Proxy #' + attempt : 'Direct Fallback'}) failed: ${error.message}. Continuing to next attempt...`);
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }

    if (lastResponse) return lastResponse;
    if (lastError) throw lastError;
  }
}

module.exports = HttpClient;