const crypto = require('crypto');
const axios = require('axios');
const qs = require('querystring');
const HttpClient = require('../process/HttpClient');

/**
 * Generates a dynamic PKCE code_verifier and S256 code_challenge.
 */
function generatePkce() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

/**
 * Extracts OAuth Authorization Code using Live Login endpoint with dynamic PKCE & state.
 * @param {string} hostCookie - The __Host-MSAAUTH / __Host-MSAAUTHP token value
 * @returns {Promise<{ code: string, verifier: string }|null>}
 */
async function getOAuthCode(hostCookie, axiosInstance = axios) {
    try {
        if (!hostCookie) return null;
        let cleanToken = hostCookie;
        if (typeof cleanToken === 'string') {
            cleanToken = cleanToken.replace(/^__Host-MSAAUTH(P)?=/, '').split(';')[0].trim();
        }

        const { verifier, challenge } = generatePkce();
        const stateId = crypto.randomUUID();
        const nonce = crypto.randomUUID();
        const uaid = crypto.randomBytes(16).toString('hex');

        const response = await axiosInstance.get('https://login.live.com/oauth20_authorize.srf', {
            params: {
                client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
                scope: 'openid profile offline_access',
                redirect_uri: 'https://www.xbox.com/auth/msa/blank.html',
                response_type: 'code',
                state: JSON.stringify({
                    id: stateId,
                    meta: { interactionType: 'silent' }
                }),
                response_mode: 'fragment',
                nonce: nonce,
                prompt: 'none',
                code_challenge: challenge,
                code_challenge_method: 'S256',
                'x-client-SKU': 'msal.js.browser',
                'x-client-Ver': '3.20.0',
                uaid: uaid,
                msproxy: '1',
                issuer: 'mso',
                tenant: 'consumers',
                client_info: '1'
            },
            headers: {
                'Cookie': `__Host-MSAAUTHP=${cleanToken}; __Host-MSAAUTH=${cleanToken}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Sec-Fetch-Site': 'cross-site',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Dest': 'iframe',
                'Referer': 'https://www.xbox.com/'
            },
            maxHeaderSize: 131072,
            maxRedirects: 0,
            timeout: 10000,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const location = response.headers?.location;
        if (location) {
            const fragment = location.split('#')[1] || location.split('?')[1] || '';
            if (fragment) {
                const params = new URLSearchParams(fragment);
                const code = params.get('code');
                if (code) {
                    return { code, verifier };
                }
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Exchanges OAuth authorization code for MSAL Refresh Token.
 * @param {string|{ code: string, verifier?: string }} codeOrObj - Auth code or object with verifier
 * @param {string} [customVerifier] - Optional PKCE code_verifier if passed separately
 * @returns {Promise<string|null>}
 */
async function getRefreshToken(codeOrObj, customVerifier, axiosInstance = axios) {
    if (!codeOrObj) return null;
    const code = typeof codeOrObj === 'object' ? codeOrObj.code : codeOrObj;
    const verifier = typeof codeOrObj === 'object' ? codeOrObj.verifier : customVerifier;

    if (!code || !verifier) return null;

    const url = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    const data = {
        client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
        redirect_uri: 'https://www.xbox.com/auth/msa/blank.html',
        scope: 'openid profile offline_access',
        code: code,
        code_verifier: verifier,
        grant_type: 'authorization_code'
    };

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Origin': 'https://www.xbox.com',
        'Referer': 'https://www.xbox.com/'
    };

    try {
        const response = await axiosInstance.post(url, qs.stringify(data), {
            headers,
            maxHeaderSize: 131072,
            timeout: 10000
        });
        return response.data?.refresh_token || null;
    } catch {
        return null;
    }
}

/**
 * Exchanges MSAL Refresh Token for RPS Ticket (access_token prefixed with 'd=').
 * @param {string} refreshToken
 * @returns {Promise<string|null>}
 */
async function getRpsTicket(refreshToken, axiosInstance = axios) {
    if (!refreshToken) return null;

    const url = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    const data = {
        client_id: '1f907974-e22b-4810-a9de-d9647380c97e',
        redirect_uri: 'https://www.xbox.com/auth/msa/blank.html',
        scope: 'xboxlive.signin openid profile offline_access',
        grant_type: 'refresh_token',
        client_info: '1',
        x_client_SKU: 'msal.js.browser',
        x_client_VER: '3.20.0',
        client_request_id: crypto.randomUUID(),
        refresh_token: refreshToken
    };

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Origin': 'https://www.xbox.com',
        'Referer': 'https://www.xbox.com/'
    };

    try {
        const response = await axiosInstance.post(url, qs.stringify(data), {
            headers,
            maxHeaderSize: 131072,
            timeout: 10000
        });
        if (response.data?.access_token) {
            return `d=${response.data.access_token}`;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Authenticates RPS Ticket with Xbox Live user authentication service.
 * @param {string} rpsTicket
 * @returns {Promise<string|null>} userToken
 */
async function getUserToken(rpsTicket, axiosInstance = axios) {
    if (!rpsTicket) return null;

    try {
        const response = await axiosInstance.post('https://user.auth.xboxlive.com/user/authenticate', {
            Properties: {
                AuthMethod: 'RPS',
                RpsTicket: rpsTicket,
                SiteName: 'user.auth.xboxlive.com'
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Origin': 'https://www.xbox.com',
                'Referer': 'https://www.xbox.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'X-Xbl-Contract-Version': '1'
            },
            maxHeaderSize: 131072,
            timeout: 10000
        });

        return response.data?.Token || null;
    } catch {
        return null;
    }
}

/**
 * Authorizes XSTS token for a specific relying party.
 * Defaults to 'http://mp.microsoft.com/' for marketplace/purchasing, or 'rp://api.minecraftservices.com/' for Minecraft.
 * @param {string} userToken
 * @param {string} [relyingParty='http://mp.microsoft.com/']
 * @returns {Promise<string|null>} Formatted 'XBL3.0 x=<uhs>;<token>' string
 */
async function getXBL3(userToken, relyingParty = 'rp://api.minecraftservices.com/', axiosInstance = axios) {
    if (!userToken) return null;

    try {
        const response = await axiosInstance.post('https://xsts.auth.xboxlive.com/xsts/authorize', {
            Properties: { "SandboxId": "RETAIL", "UserTokens": [userToken] },
            RelyingParty: relyingParty,
            TokenType: 'JWT'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Origin': 'https://www.xbox.com',
                'Referer': 'https://www.xbox.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'X-Xbl-Contract-Version': '1'
            },
            maxHeaderSize: 131072,
            timeout: 10000
        });

        const token = response.data?.Token;
        const uhs = response.data?.DisplayClaims?.xui?.[0]?.uhs;
        if (!token || !uhs) return null;

        return `XBL3.0 x=${uhs};${token}`;
    } catch {
        return null;
    }
}

/**
 * Fetches Xbox User ID (XUID) given an authorized Xbox Live token.
 * @param {string} xblTokengtg - Formatted XBL token
 * @returns {Promise<string|null>}
 */
async function getXUID(xblTokengtg) {
    if (!xblTokengtg) return null;

    const headers = {
        Authorization: xblTokengtg,
        'x-xbl-contract-version': '2',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    };

    try {
        const res = await axios.get(
            'https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag',
            { headers, maxHeaderSize: 131072, timeout: 8000 }
        );

        return res.data?.profileUsers?.[0]?.id || null;
    } catch {
        return null;
    }
}

/**
 * Enables or disables Xbox Online Safety / Multiplayer settings.
 * @param {string} xbl3 - Formatted XBL token
 * @param {boolean} [disable=true] - True to disable, false to enable
 * @returns {Promise<number|null>} Response status code or null
 */
async function disableMulti(xbl3, disable = true) {
    if (!xbl3) return null;

    const requestBody = disable === true
        ? {
            setOnlineSafetySettings: [],
            clearOnlineSafetySettings: [185, 188, 190, 198, 199, 220, 254, 255]
        }
        : {
            setOnlineSafetySettings: [254, 185],
            clearOnlineSafetySettings: [188, 190, 198, 199, 220, 255]
        };

    try {
        const response = await axios.post('https://emerald.xboxservices.com/xboxcomfd/settings/privacyonlinesafety', requestBody, {
            headers: {
                'Host': 'emerald.xboxservices.com',
                'Authorization': xbl3,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Origin': 'https://www.xbox.com',
                'Referer': 'https://www.xbox.com/'
            },
            maxHeaderSize: 131072,
            timeout: 10000
        });

        return response.status;
    } catch {
        return null;
    }
}

/**
 * Full MSAL/Xbox Live token generator preserving caller contract.
 * Supports generating from hostCookie or refreshing using saved MSAL refreshToken / userToken.
 * @param {string} [hostCookie] - __Host-MSAAUTH token value
 * @param {string} [refreshTokenOrUserToken] - Saved MSAL refresh token or legacy user token
 * @returns {Promise<{ xbl: string, refresh: string }|null>}
 */
async function getmxbl(hostCookie, refreshTokenOrUserToken) {
    const http = new HttpClient();
    const axiosInstance = http.axios || http;

    let refreshToken = null;
    let userToken = null;

    if (refreshTokenOrUserToken) {
        const isJwt = typeof refreshTokenOrUserToken === 'string' && refreshTokenOrUserToken.split('.').length === 3;

        if (isJwt) {
            userToken = refreshTokenOrUserToken;
            const xbl3 = await getXBL3(userToken, 'rp://api.minecraftservices.com/', axiosInstance);
            if (xbl3) {
                return {
                    xbl: xbl3,
                    refresh: userToken
                };
            }
            return null;
        } else {
            refreshToken = refreshTokenOrUserToken;
            const rpsTicket = await getRpsTicket(refreshToken, axiosInstance);
            if (!rpsTicket) return null;

            userToken = await getUserToken(rpsTicket, axiosInstance);
            if (!userToken) return null;
        }
    } else {
        const oauthResult = await getOAuthCode(hostCookie, axiosInstance);
        if (!oauthResult) return null;

        refreshToken = await getRefreshToken(oauthResult, undefined, axiosInstance);
        if (!refreshToken) return null;

        const rpsTicket = await getRpsTicket(refreshToken, axiosInstance);
        if (!rpsTicket) return null;

        userToken = await getUserToken(rpsTicket, axiosInstance);
        if (!userToken) return null;
    }

    const xbl3 = await getXBL3(userToken, 'rp://api.minecraftservices.com/', axiosInstance);
    if (!xbl3) return null;

    return {
        xbl: xbl3,
        refresh: refreshToken || userToken
    };
}

module.exports = {
    getmxbl,
    getXBL3,
    getXUID,
    getOAuthCode,
    getRefreshToken,
    getRpsTicket,
    getUserToken,
    disableMulti
};
