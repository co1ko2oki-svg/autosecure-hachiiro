const axios = require('axios');
const http = require('http');
const https = require('https');

function patchMaxHeaderSize(mod) {
  if (!mod || mod._maxHeaderSizePatched) return;
  mod._maxHeaderSizePatched = true;
  const orig = mod.request;
  mod.request = function (url, options, cb) {
    let opts = options;
    let callback = cb;
    if (typeof url === 'string' || url instanceof URL) {
      if (typeof options === 'function') {
        callback = options;
        opts = {};
      } else {
        opts = options ? { ...options } : {};
      }
      if (!opts.maxHeaderSize || opts.maxHeaderSize < 524288) opts.maxHeaderSize = 524288;
      return orig.call(mod, url, opts, callback);
    } else {
      opts = url ? { ...url } : {};
      callback = options;
      if (!opts.maxHeaderSize || opts.maxHeaderSize < 524288) opts.maxHeaderSize = 524288;
      return orig.call(mod, opts, callback);
    }
  };
}
patchMaxHeaderSize(http);
patchMaxHeaderSize(https);

const config = require('../../../config.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const globalHttpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 30000
});

const globalHttpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 30000
});

const globalProxyAgentPool = new Map();

function getGlobalProxyAgent(proxyUrl) {
    if (globalProxyAgentPool.has(proxyUrl)) {
        return globalProxyAgentPool.get(proxyUrl);
    }
    const isSocks = proxyUrl.startsWith('socks');
    const agentOptions = {
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 30000
    };
    const agent = isSocks
        ? new SocksProxyAgent(proxyUrl, agentOptions)
        : new HttpsProxyAgent(proxyUrl, agentOptions);
    globalProxyAgentPool.set(proxyUrl, agent);
    return agent;
}

function attachGlobalProxy() {
    axios.defaults.httpAgent = globalHttpAgent;
    axios.defaults.httpsAgent = globalHttpsAgent;

    if (config.useproxy === "true" || config.useproxy === true) {
        const proxies = config.proxy || [];
        if (proxies.length > 0) {
            axios.interceptors.request.use((axiosConfig) => {
                if (axiosConfig._noProxy || axiosConfig.proxy === false) {
                    axiosConfig.httpAgent = globalHttpAgent;
                    axiosConfig.httpsAgent = globalHttpsAgent;
                    return axiosConfig;
                }

                if (!axiosConfig.signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                    axiosConfig.signal = AbortSignal.timeout(10000);
                } else if (!axiosConfig.timeout) {
                    axiosConfig.timeout = 10000;
                }
                
                axiosConfig._retryCount = axiosConfig._retryCount || 0;

                try {
                    const idx = Math.floor(Math.random() * proxies.length);
                    const [PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS] = proxies[idx].split(":");
                    const auth = PROXY_USER && PROXY_PASS ? `${encodeURIComponent(PROXY_USER)}:${encodeURIComponent(PROXY_PASS)}@` : "";
                    const proxyUrlStr = `${auth}${PROXY_HOST}:${PROXY_PORT}`;
                    const proxyUrl = proxyUrlStr.startsWith('http') || proxyUrlStr.startsWith('socks') ? proxyUrlStr : `http://${proxyUrlStr}`;
                    const agent = getGlobalProxyAgent(proxyUrl);
                    
                    axiosConfig.httpAgent = agent;
                    axiosConfig.httpsAgent = agent;
                } catch (error) {
                    console.error("[Global Axios Proxy] Error setting up proxy for request:", error);
                    axiosConfig.httpAgent = globalHttpAgent;
                    axiosConfig.httpsAgent = globalHttpsAgent;
                }
                
                return axiosConfig;
            });
            
            axios.interceptors.response.use(
                (response) => response,
                (error) => {
                    const reqConfig = error.config;
                    if (!reqConfig || reqConfig._noProxy || reqConfig.proxy === false) {
                        return Promise.reject(error);
                    }
                    
                    reqConfig._retryCount = (reqConfig._retryCount || 0) + 1;

                    if (reqConfig._retryCount <= 2 && proxies.length > 1) {
                        console.log(`[Proxy] Request failed (${error.message}), retrying with next proxy (${reqConfig._retryCount}/2)... url: ${reqConfig.url}`);
                        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                            reqConfig.signal = AbortSignal.timeout(10000);
                        }
                        return axios(reqConfig);
                    }
                    
                    // If proxies fail, seamlessly FALL BACK TO DIRECT CONNECTION!
                    if (!reqConfig._triedDirect) {
                        reqConfig._triedDirect = true;
                        reqConfig._noProxy = true;
                        reqConfig.proxy = false;
                        reqConfig.httpAgent = globalHttpAgent;
                        reqConfig.httpsAgent = globalHttpsAgent;
                        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                            reqConfig.signal = AbortSignal.timeout(15000);
                        }
                        console.log(`[Proxy] All proxy attempts failed (${error.message}), falling back to DIRECT connection: ${reqConfig.url}`);
                        return axios(reqConfig);
                    }
                    
                    return Promise.reject(error);
                }
            );

            console.log(`[Proxy] Global Axios proxy interceptor attached with Keep-Alive connection pooling, fast timeout and direct fallback.`);
        }
    }
}

module.exports = attachGlobalProxy;

