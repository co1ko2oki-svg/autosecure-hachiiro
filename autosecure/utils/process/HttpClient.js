const axios = require("axios");
const { HttpProxyAgent } = require("http-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");

const config = require("../../../config.json");

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
  constructor() {
    this._cookieJar = new Map(); // key: `${domain}:${path}:${name}` -> cookieObj
    this.axios = axios.create({
      timeout: 10000,
      maxRedirects: 0,
      withCredentials: true,
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

    // Proxy interceptor
    this.axios.interceptors.request.use(async (axiosConfig) => {
      if (config.useproxy === true && config.proxy) {
        try {
          // Handle both string and array for config.proxy
          let proxyStr = config.proxy;
          if (Array.isArray(config.proxy)) {
              if (config.proxy.length === 0) throw new Error("Proxy array is empty");
              proxyStr = config.proxy[Math.floor(Math.random() * config.proxy.length)];
          }
          const [PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS] = proxyStr.split(":");
          const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
          axiosConfig.httpAgent = new HttpProxyAgent(proxyUrl);
          axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        } catch (error) {
          console.error("Error setting up proxy for request:", error);
        }
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
    if (!cookieStr || typeof cookieStr !== "string") return;
    const parsed = parseSetCookie(cookieStr, originUrl);
    if (!parsed) return;

    const key = `${parsed.domain}:${parsed.path}:${parsed.name}`;

    if (parsed.isDeleted) {
      this._cookieJar.delete(key);
      // Also delete any fallback key with empty domain
      this._cookieJar.delete(`:${parsed.path}:${parsed.name}`);
      this._cookieJar.delete(`::${parsed.name}`);
    } else {
      this._cookieJar.set(key, parsed);
    }
  }

  deleteCookie(cName, domain = null) {
    for (const [key, cookie] of this._cookieJar.entries()) {
      if (cookie.name === cName) {
        if (!domain || domainMatches(cookie.domain, domain)) {
          this._cookieJar.delete(key);
        }
      }
    }
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
    let useProxy = false;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (useProxy && attempt > 0) {
          const configWithoutProxy = { ...requestArgs[requestArgs.length - 1] };
          delete configWithoutProxy.httpAgent;
          delete configWithoutProxy.httpsAgent;
          const finalArgs = [...requestArgs.slice(0, -1), configWithoutProxy];
          return await this.axios[method](url, ...finalArgs);
        }

        return await this.axios[method](url, ...requestArgs);
      } catch (error) {
        if (attempt === retries - 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
}

module.exports = HttpClient;