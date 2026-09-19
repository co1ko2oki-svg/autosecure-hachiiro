const axios = require('axios');
const http = require('http');
const https = require('https');
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

    if (config.useproxy === true || config.useproxy === "true") {
        const proxies = Array.isArray(config.proxy) ? config.proxy.filter(Boolean) : [config.proxy];
        
        if (proxies.length > 0) {
            axios.interceptors.request.use((axiosConfig) => {
                if (axiosConfig._noProxy || axiosConfig.proxy === false) {
                    axiosConfig.httpAgent = globalHttpAgent;
                    axiosConfig.httpsAgent = globalHttpsAgent;
                    return axiosConfig;
                }

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
            console.log(`[Proxy] Global Axios proxy interceptor attached with Keep-Alive connection pooling.`);
        }
    }
}

module.exports = attachGlobalProxy;

