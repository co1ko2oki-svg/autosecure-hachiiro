const axios = require('axios');
const config = require('../../../config.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

function attachGlobalProxy() {
    if (config.useproxy === true || config.useproxy === "true") {
        const proxies = Array.isArray(config.proxy) ? config.proxy.filter(Boolean) : [config.proxy];
        
        if (proxies.length > 0) {
            axios.interceptors.request.use((axiosConfig) => {
                if (axiosConfig._noProxy || axiosConfig.proxy === false) {
                    return axiosConfig;
                }

                try {
                    const idx = Math.floor(Math.random() * proxies.length);
                    const [PROXY_HOST, PROXY_PORT, PROXY_USER, PROXY_PASS] = proxies[idx].split(":");
                    const auth = PROXY_USER && PROXY_PASS ? `${encodeURIComponent(PROXY_USER)}:${encodeURIComponent(PROXY_PASS)}@` : "";
                    const proxyUrlStr = `${auth}${PROXY_HOST}:${PROXY_PORT}`;
                    const proxyUrl = proxyUrlStr.startsWith('http') || proxyUrlStr.startsWith('socks') ? proxyUrlStr : `http://${proxyUrlStr}`;
                    const agent = proxyUrl.startsWith('socks') ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
                    
                    axiosConfig.httpAgent = agent;
                    axiosConfig.httpsAgent = agent;
                } catch (error) {
                    console.error("[Global Axios Proxy] Error setting up proxy for request:", error);
                }
                
                return axiosConfig;
            });
            console.log(`[Proxy] Global Axios proxy interceptor attached.`);
        }
    }
}

module.exports = attachGlobalProxy;
