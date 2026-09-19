const crypto = require('crypto');
const axios = require('axios');
const qs = require('querystring');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const HttpClient = require('../process/HttpClient');

const TRUSTED_DOMAINS = [
    'xboxlive.com',
    'live.com',
    'microsoftonline.com',
    'microsoft.com',
    'xbox.com',
    'minecraft.net'
];

/**
 * Validates that a hostname belongs to a trusted Microsoft/Xbox domain.
 */
function isTrustedHost(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    const lower = hostname.toLowerCase().trim();
    return TRUSTED_DOMAINS.some(d => lower === d || lower.endsWith('.' + d));
}

/**
 * Generates a dynamic PKCE verifier and S256 code challenge.
 */
function generatePkce() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

/**
 * Normalizes any input (cookie string, full cookie header, HttpClient, or object)
 * into a pure MSAAUTH cookie value.
 */
function extractAuthToken(input) {
    if (!input) return null;
    if (typeof input === 'object') {
        if (typeof input.getCookie === 'function') {
            return input.getCookie('__Host-MSAAUTH') || input.getCookie('__Host-MSAAUTHP') || input.getCookie('msauth') || null;
        }
        if (input.host) return extractAuthToken(input.host);
        if (input.loginCookie) return extractAuthToken(input.loginCookie);
        if (input.msauth) return extractAuthToken(input.msauth);
    }
    if (typeof input === 'string') {
        let token = input.trim();
        if (token.startsWith('__Host-MSAAUTH=')) {
            token = token.substring('__Host-MSAAUTH='.length);
        } else if (token.startsWith('__Host-MSAAUTHP=')) {
            token = token.substring('__Host-MSAAUTHP='.length);
        }
        token = token.split(';')[0].trim();
        return token || null;
    }
    return null;
}

/**
 * Safely decodes standard and URL-safe Base64 strings.
 */
function base64UrlDecode(str) {
    if (!str || typeof str !== 'string') return null;
    try {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }
        return Buffer.from(base64, 'base64').toString('utf8');
    } catch {
        return null;
    }
}

/**
 * Safely parses the accessToken JSON payload from SISU responses (supports Array and Object shapes).
 */
function parseAccessTokenJson(jsonData) {
    if (!jsonData) return null;

    let items = [];
    if (Array.isArray(jsonData)) {
        items = jsonData;
    } else if (typeof jsonData === 'object') {
        items = Object.values(jsonData);
    } else {
        return null;
    }

    let uhs = null;
    let xsts = '';
    let playfabxbl = null;
    let gtg = null;
    let xuid = null;
    let purchasetoken = null;

    for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const xuiList = item?.Item2?.DisplayClaims?.xui;
        if (Array.isArray(xuiList) && xuiList.length > 0 && !uhs) {
            if (typeof xuiList[0]?.uhs === 'string' && xuiList[0].uhs.length > 0) {
                uhs = xuiList[0].uhs;
            }
        }

        const relyingParty = item?.Item1;
        const token = item?.Item2?.Token;

        if (relyingParty === 'rp://api.minecraftservices.com/' && typeof token === 'string') {
            xsts = token;
        } else if (relyingParty === 'http://xboxlive.com') {
            if (Array.isArray(xuiList) && xuiList.length > 0) {
                gtg = xuiList[0]?.gtg || gtg;
                xuid = xuiList[0]?.xid || xuid;
            }
        } else if (relyingParty === 'http://playfab.xboxlive.com/' && typeof token === 'string') {
            playfabxbl = token;
        } else if (relyingParty === 'http://mp.microsoft.com/' && typeof token === 'string') {
            purchasetoken = token;
        }
    }

    if (!uhs || !xsts) return null;

    return {
        XBL: `XBL3.0 x=${uhs};${xsts}`,
        gtg: gtg || null,
        xuid: xuid || null,
        playxbl: playfabxbl ? `XBL3.0 x=${uhs};${playfabxbl}` : null,
        purchasingtoken: purchasetoken ? `XBL3.0 x=${uhs};${purchasetoken}` : null,
        uhs: uhs
    };
}

/**
 * Extracts and parses accessToken from URL or HTML text.
 */
function extractAndParseTokenFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/accessToken=([A-Za-z0-9\-_%.+]+)/);
    if (match && match[1]) {
        let rawToken;
        try {
            rawToken = decodeURIComponent(match[1]);
        } catch {
            rawToken = match[1];
        }
        const decoded = base64UrlDecode(rawToken);
        if (decoded) {
            try {
                const parsedJson = JSON.parse(decoded);
                return parseAccessTokenJson(parsedJson);
            } catch {}
        }
    }
    return null;
}

/**
 * Tier 1: Enhanced SISU Xbox Live redirect flow with proxy support via HttpClient
 */
async function sisuFlow(token) {
    const httpClient = new HttpClient();
    // Seed the cookie jar with the auth token
    httpClient.setCookie(`__Host-MSAAUTH=${token}; Domain=.live.com; Path=/`);

    let currentUrl = 'https://sisu.xboxlive.com/connect/XboxLive/?state=login&cobrandId=8058f65d-ce06-4c30-9559-473c9275a65d&tid=896928775&ru=https://www.minecraft.net/en-us/login&aid=1142970254';
    const maxHops = 8;

    for (let hop = 0; hop < maxHops; hop++) {
        const urlObj = new URL(currentUrl);
        if (!isTrustedHost(urlObj.hostname)) {
            console.log(`[XBL SISU] Untrusted redirect host: ${urlObj.hostname}`);
            return null;
        }

        const response = await httpClient.get(currentUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true
        });

        const location = response.headers?.location;
        if (location) {
            const parsed = extractAndParseTokenFromText(location);
            if (parsed) return parsed;

            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        const body = typeof response.data === 'string' ? response.data : '';
        if (body) {
            const parsed = extractAndParseTokenFromText(body);
            if (parsed) return parsed;

            // Handle intermediate PPFT submit page if prompted
            const serverDataMatch = body.match(/var ServerData = ({.*?});/s);
            let ppft = null;
            let urlPost = 'https://login.live.com/ppsecure/post.srf';
            if (serverDataMatch) {
                try {
                    const sd = JSON.parse(serverDataMatch[1]);
                    const m = sd.sFTTag?.match(/value="([^"]*)"/);
                    if (m) ppft = m[1];
                    if (sd.urlPost) urlPost = sd.urlPost;
                } catch {}
            }
            if (!ppft) {
                const m = body.match(/name="PPFT"[^>]*value="([^"]*)"/) || body.match(/value="([^"]*)"[^>]*name="PPFT"/);
                if (m) ppft = m[1];
            }

            if (ppft) {
                try {
                    const targetPostUrl = new URL(urlPost, currentUrl).toString();
                    if (!isTrustedHost(new URL(targetPostUrl).hostname)) return null;

                    const postRes = await httpClient.post(
                        targetPostUrl,
                        `PPFT=${encodeURIComponent(ppft)}&LoginOptions=1&type=28`,
                        {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                                'Referer': currentUrl,
                                'Origin': 'https://login.live.com'
                            },
                            maxRedirects: 0,
                            timeout: 15000,
                            validateStatus: () => true
                        }
                    );
                    if (postRes.headers?.location) {
                        const postLocation = postRes.headers.location;
                        const postParsed = extractAndParseTokenFromText(postLocation);
                        if (postParsed) return postParsed;
                        currentUrl = new URL(postLocation, currentUrl).toString();
                        continue;
                    }
                } catch {}
            }
        }

        break;
    }

    return null;
}

/**
 * Tier 2: PPFT Form Post Flow (Handles consent/confirmation intermediate prompts)
 */
async function ppftPostFlow(token) {
    const httpClient = new HttpClient();
    const cookieHeader = `__Host-MSAAUTH=${token}`;
    const loginRes = await httpClient.get('https://login.live.com/login.srf', {
        headers: {
            'Cookie': cookieHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        },
        maxHeaderSize: 131072,
        timeout: 10000,
        validateStatus: () => true
    });

    let sft = null;
    const serverDataMatch = loginRes.data?.match(/var ServerData = ({.*?});/s);
    if (serverDataMatch) {
        try {
            const sd = JSON.parse(serverDataMatch[1]);
            const m = sd.sFTTag?.match(/value="([^"]*)"/);
            if (m) sft = m[1];
        } catch {}
    }
    if (!sft) {
        const m = loginRes.data?.match(/name="PPFT"[^>]*value="([^"]*)"/) || loginRes.data?.match(/value="([^"]*)"[^>]*name="PPFT"/);
        if (m) sft = m[1];
    }
    if (!sft) return null;

    const postRes = await httpClient.post(
        'https://login.live.com/ppsecure/post.srf',
        `PPFT=${encodeURIComponent(sft)}&canary=&LoginOptions=1&type=28&hpgrequestid=&ctx=`,
        {
            params: {
                'nopa': '2',
                'client_id': '000000004420578E',
                'cobrandid': '8058f65d-ce06-4c30-9559-473c9275a65d'
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxHeaderSize: 131072,
            maxRedirects: 0,
            timeout: 10000,
            validateStatus: () => true
        }
    );

    let redirectUrl = postRes.headers?.location;
    if (!redirectUrl) return null;
    redirectUrl = new URL(redirectUrl, 'https://login.live.com').toString();

    if (!isTrustedHost(new URL(redirectUrl).hostname)) return null;

    const tokenRes = await httpClient.get(redirectUrl, {
        headers: { 'Cookie': cookieHeader, 'User-Agent': 'Mozilla/5.0' },
        maxHeaderSize: 131072,
        maxRedirects: 0,
        timeout: 10000,
        validateStatus: () => true
    });

    const finalLocation = tokenRes.headers?.location || '';
    const parsed = extractAndParseTokenFromText(finalLocation);
    if (parsed) return parsed;

    return null;
}

/**
 * Tier 3: Direct MSAL OAuth -> Xbox Live API -> Minecraft XSTS Authorize
 * (Uses dynamically generated PKCE and secure token exchange)
 */
async function msalXboxLiveFlow(token) {
    const httpClient = new HttpClient();
    const cookieHeader = `__Host-MSAAUTHP=${token}; __Host-MSAAUTH=${token}`;
    const { verifier, challenge } = generatePkce();
    const stateId = crypto.randomUUID();

    // 1. Get OAuth authorization code
    const authRes = await httpClient.get('https://login.live.com/oauth20_authorize.srf', {
        params: {
            client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
            scope: 'openid profile offline_access',
            redirect_uri: 'https://www.xbox.com/auth/msa/blank.html',
            response_type: 'code',
            response_mode: 'fragment',
            prompt: 'none',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: JSON.stringify({ id: stateId, meta: { interactionType: 'silent' } })
        },
        headers: {
            'Cookie': cookieHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxHeaderSize: 131072,
        maxRedirects: 0,
        timeout: 10000,
        validateStatus: () => true
    });

    const location = authRes.headers?.location || '';
    const fragment = location.split('#')[1] || location.split('?')[1] || '';
    const params = new URLSearchParams(fragment);
    const code = params.get('code');
    if (!code) return null;

    // 2. Exchange authorization code for refresh_token
    const tokenRes = await httpClient.post(
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        qs.stringify({
            client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
            redirect_uri: 'https://www.xbox.com/auth/msa/blank.html',
            scope: 'openid profile offline_access',
            code: code,
            code_verifier: verifier,
            grant_type: 'authorization_code'
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'User-Agent': 'Mozilla/5.0'
            },
            maxHeaderSize: 131072,
            timeout: 10000
        }
    );

    const refreshToken = tokenRes.data?.refresh_token;
    if (!refreshToken) return null;

    // 3. Get RPS Ticket for Xbox Live
    const rpsRes = await httpClient.post(
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        qs.stringify({
            client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
            redirect_uri: 'https://www.xbox.com/auth/msa/blank.html',
            scope: 'xboxlive.signin openid profile offline_access',
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'User-Agent': 'Mozilla/5.0'
            },
            maxHeaderSize: 131072,
            timeout: 10000
        }
    );

    const rpsAccessToken = rpsRes.data?.access_token;
    if (!rpsAccessToken) return null;
    const rpsTicket = `d=${rpsAccessToken}`;

    // 4. Authenticate with user.auth.xboxlive.com
    const userAuthRes = await httpClient.post(
        'https://user.auth.xboxlive.com/user/authenticate',
        {
            Properties: {
                AuthMethod: 'RPS',
                RpsTicket: rpsTicket,
                SiteName: 'user.auth.xboxlive.com'
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        },
        {
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        }
    );

    const userToken = userAuthRes.data?.Token;
    if (!userToken) return null;

    // 5. Authorize Minecraft XSTS Token
    const mcXstsRes = await httpClient.post(
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        {
            Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT'
        },
        {
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        }
    );

    const xstsToken = mcXstsRes.data?.Token;
    const uhs = mcXstsRes.data?.DisplayClaims?.xui?.[0]?.uhs;
    if (!xstsToken || !uhs) return null;

    // 6. Authorize Xbox Live profile token for Gamertag & XUID
    let gtg = null;
    let xuid = null;
    try {
        const xboxXstsRes = await httpClient.post(
            'https://xsts.auth.xboxlive.com/xsts/authorize',
            {
                Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
                RelyingParty: 'http://xboxlive.com',
                TokenType: 'JWT'
            },
            {
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            }
        );
        const xui = xboxXstsRes.data?.DisplayClaims?.xui?.[0];
        gtg = xui?.gtg || null;
        xuid = xui?.xid || null;
    } catch {}

    // 7. Authorize PlayFab token
    let playfabxbl = null;
    try {
        const playfabRes = await httpClient.post(
            'https://xsts.auth.xboxlive.com/xsts/authorize',
            {
                Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
                RelyingParty: 'http://playfab.xboxlive.com/',
                TokenType: 'JWT'
            },
            {
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            }
        );
        const secondtoken = playfabRes.data?.Token;
        if (secondtoken) playfabxbl = `XBL3.0 x=${uhs};${secondtoken}`;
    } catch {}

    // 8. Authorize Purchase token
    let purchasetoken = null;
    try {
        const purchaseRes = await httpClient.post(
            'https://xsts.auth.xboxlive.com/xsts/authorize',
            {
                Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
                RelyingParty: 'http://mp.microsoft.com/',
                TokenType: 'JWT'
            },
            {
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                timeout: 8000
            }
        );
        const thirdtoken = purchaseRes.data?.Token;
        if (thirdtoken) purchasetoken = `XBL3.0 x=${uhs};${thirdtoken}`;
    } catch {}

    return {
        XBL: `XBL3.0 x=${uhs};${xstsToken}`,
        gtg: gtg,
        xuid: xuid,
        playxbl: playfabxbl,
        purchasingtoken: purchasetoken,
        uhs: uhs
    };
}

/**
 * Main export: Resolves Xbox Live token and details using multi-tier resilient fallback.
 * @param {string|object} loginCookie - __Host-MSAAUTH token, full cookie, or HttpClient
 * @returns {Promise<{ XBL: string, gtg: string|null, xuid: string|null, playxbl: string|null, purchasingtoken: string|null, uhs: string }|null>}
 */
module.exports = async (loginCookie) => {
    try {
        const token = extractAuthToken(loginCookie);
        if (!token) {
            console.log('[XBL] No valid MSAAUTH token extracted');
            return null;
        }

        console.log('[XBL] Attempting Tier 1 (SISU Flow)...');
        try {
            const res1 = await sisuFlow(token);
            if (res1 && res1.XBL) {
                console.log('[XBL] Tier 1 SISU success!');
                return res1;
            }
        } catch (err) {
            console.log('[XBL] Tier 1 SISU failed:', err.message);
        }

        console.log('[XBL] Attempting Tier 2 (PPFT Form Post Flow)...');
        try {
            const res2 = await ppftPostFlow(token);
            if (res2 && res2.XBL) {
                console.log('[XBL] Tier 2 PPFT success!');
                return res2;
            }
        } catch (err) {
            console.log('[XBL] Tier 2 PPFT failed:', err.message);
        }

        console.log('[XBL] Attempting Tier 3 (Direct MSAL/Xbox Live OAuth Flow)...');
        try {
            const res3 = await msalXboxLiveFlow(token);
            if (res3 && res3.XBL) {
                console.log('[XBL] Tier 3 MSAL Xbox Live success!');
                return res3;
            }
        } catch (err) {
            console.log('[XBL] Tier 3 MSAL Xbox Live failed:', err.message);
        }

        console.log('[XBL] Attempting Tier 4 (getmxbl Flow)...');
        try {
            const { getmxbl } = require('../secure/getxbl3');
            const res4 = await getmxbl(token);
            if (res4 && res4.xbl) {
                console.log('[XBL] Tier 4 getmxbl success!');
                const uhsMatch = res4.xbl.match(/x=([^;]+)/);
                return {
                    XBL: res4.xbl,
                    gtg: null,
                    xuid: null,
                    playxbl: null,
                    purchasingtoken: null,
                    uhs: uhsMatch ? uhsMatch[1] : null
                };
            }
        } catch (err) {
            console.log('[XBL] Tier 4 getmxbl failed:', err.message);
        }

        console.log('[XBL] All Xbox Live authentication tiers failed');
        return null;
    } catch (e) {
        console.error('[XBL] Unexpected error in XBL resolver:', e.message);
        return null;
    }
};