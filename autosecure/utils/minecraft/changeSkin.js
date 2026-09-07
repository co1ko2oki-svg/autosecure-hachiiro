const axios = require('axios');
const FormData = require('form-data');
const HttpClient = require('../process/HttpClient');

const DEFAULT_SKIN_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARQAAAFwCAYAAAB5FYQ1AAAQAElEQVR4Aex9e5Acx3nfNzM7u7e3dwcc3gAJgAcQJE2KokVbZesV3omhXLZCWkyiP5yUHceOXJFd+sMVOXFSkXGIq1xxxXbkYmyVrdiuiuM4NiODpOKUKYq6Y1kPWw9KpASRIgERJEi8gXs/9jWT/ua292Zn59Ez0/Pa/a7utzPT/fXXX/9693c93b1zKtAPMUAMEAOSGCBBkUQkuSEGiAEAEhR6FxADxIA0BkhQpFFJjorOAMUfnwESlPgckgdigBjoMECC0iGCDsQAMRCfARKU+BySB2KAGOgwQILSIaLoB4qfGMgDAyQoeegFioEYGBAGSFAGpCOpGcRAHhggQclDL1AMxMCAMJALQRkQLqkZxMDQM0CCMvRvASKAGJDHAAmKPC7JEzEw9AyQoAz9W4AIyBUDBQ+GBKXgHUjhEwN5YoAEJU+9QbEQAwVngASl4B1I4RMDeWKABCVPvVH0WCj+oWeABGXo3wJEADEgjwESFHlckidiYOgZIEEZ+rcAEUAMyGOABIVzSUdigBiIzQAJSmwKyQExQAxwBkhQOBN0JAaIgdgMkKDEppAcEAODxkD09pCgROeOShIDxICDARIUByF0SQwQA9EZIEGJzh2VJAaIAQcDJCgOQgbh8vTp09McL7zwwsmFhYW5BTGcLH77qQVZMkCCkiX7nbo/+9nPnrTw5JMnnzr9xByD+dQTTyDm2NEFT7K8LTx5+gnzyb863QNNUU4iWOc+AC0Da5lmLyKYfeqpp+YEYDKbIIj4cbd54olum588ffrk6ccfn0bgOeI0E0zki4mkGQAupCSU7A2Qxi97z6VRzfDWcfqxT00/+alPn+R44vf/cI7BZLCOT/7P/2Wyn9ktwCwA4AcfzHoDjItXPXBl3rh4Zd68dHUWLl+bhSvXZ423Ls9wtC9cOoUw3rz8HKyvQ5ifRx55ZEYACrMJQo+f";

/**
 * Uploads a skin buffer directly to Minecraft Services via multipart/form-data.
 * @param {string} ssid - Minecraft Bearer access token
 * @param {Buffer} buffer - PNG image buffer
 * @param {string} variant - "classic" or "slim"
 * @returns {Promise<any>}
 */
async function uploadSkinBuffer(ssid, buffer, variant = 'classic') {
    const form = new FormData();
    form.append('variant', variant);
    form.append('file', buffer, {
        filename: 'skin.png',
        contentType: 'image/png'
    });

    const response = await axios.post(
        'https://api.minecraftservices.com/minecraft/profile/skins',
        form,
        {
            headers: {
                'Authorization': `Bearer ${ssid}`,
                ...form.getHeaders()
            },
            validateStatus: (status) => status >= 200 && status < 505
        }
    );

    return response;
}

/**
 * Resolves a skin input (URL, NameMC link, or Player IGN) into a direct Minecraft texture URL & variant.
 * @param {string} input - Direct image URL, NameMC link, or Minecraft Player IGN (e.g. "Dream")
 * @returns {Promise<{url: string, variant: string, playerName?: string, buffer?: Buffer}|null>}
 */
async function resolveSkinUrl(input) {
    if (!input || typeof input !== 'string') {
        input = DEFAULT_SKIN_DATA;
    }
    input = input.trim();
    if (!input) {
        input = DEFAULT_SKIN_DATA;
    }

    // 1. Base64 Data URL or raw base64
    if (input.startsWith('data:image/') || input.startsWith('iVBORw0KGgo')) {
        try {
            const cleanBase64 = input.includes(',') ? input.split(',')[1] : input;
            const buffer = Buffer.from(cleanBase64, 'base64');
            return {
                url: DEFAULT_SKIN_DATA,
                buffer: buffer,
                variant: 'classic'
            };
        } catch (e) {
            console.error('[CHANGE_SKIN] Error decoding base64 skin:', e.message);
        }
    }

    // 2. NameMC skin link: https://namemc.com/skin/xxxxxxxx
    if (input.includes('namemc.com/skin/')) {
        const hash = input.split('/skin/')[1]?.split('?')[0]?.split('/')[0];
        if (hash) {
            return {
                url: `https://texture.namemc.com/${hash}.png`,
                variant: 'classic'
            };
        }
    }

    // 3. Direct HTTP/HTTPS Image URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
        return {
            url: input,
            variant: 'classic'
        };
    }

    // 4. Minecraft Player Username (IGN) - e.g. "Dream", "Notch", "Technoblade"
    if (/^[a-zA-Z0-9_]{1,16}$/.test(input)) {
        try {
            const uuidRes = await axios.get(
                `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(input)}`,
                { timeout: 7000 }
            );

            if (uuidRes.data && uuidRes.data.id) {
                const uuid = uuidRes.data.id;
                const sessionRes = await axios.get(
                    `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
                    { timeout: 7000 }
                );

                const texturesProp = sessionRes.data?.properties?.find(p => p.name === 'textures');
                if (texturesProp && texturesProp.value) {
                    const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'));
                    const skinData = decoded?.textures?.SKIN;
                    if (skinData && skinData.url) {
                        return {
                            url: skinData.url,
                            variant: skinData.metadata?.model === 'slim' ? 'slim' : 'classic',
                            playerName: input
                        };
                    }
                }
            }
        } catch (err) {
            console.error(`[CHANGE_SKIN] Error resolving IGN "${input}":`, err.message);
        }
    }

    // Fallback: return as URL
    return {
        url: input,
        variant: 'classic'
    };
}

/**
 * Changes a Minecraft account's skin using their Bearer SSID token.
 * If skinInput is empty/omitted, falls back to the default base64 skin image.
 * @param {string} ssid - Minecraft Bearer access token
 * @param {string} skinInput - Direct skin URL, base64 data URI, or Minecraft IGN
 * @param {string} variant - "classic" (Steve 4px) or "slim" (Alex 3px)
 * @returns {Promise<{success: boolean, url?: string, variant?: string, playerName?: string, reason?: string}>}
 */
async function changeSkin(ssid, skinInput, variant = 'classic') {
    try {
        if (!ssid) {
            return { success: false, reason: 'Missing SSID token' };
        }

        const resolved = await resolveSkinUrl(skinInput || DEFAULT_SKIN_DATA);
        if (!resolved) {
            return { success: false, reason: 'Invalid Skin URL or Player Username' };
        }

        let modelVariant = (variant || '').toLowerCase().trim();
        if (modelVariant !== 'slim' && modelVariant !== 'classic') {
            modelVariant = resolved.variant || 'classic';
        }

        // Case A: Upload Buffer directly (for base64 / local skin files)
        if (resolved.buffer) {
            const response = await uploadSkinBuffer(ssid, resolved.buffer, modelVariant);
            if (response.status === 200 || response.status === 204) {
                return {
                    success: true,
                    url: resolved.url,
                    variant: modelVariant,
                    playerName: resolved.playerName || null
                };
            } else if (response.status === 401) {
                return { success: false, reason: 'Unauthorized (SSID token expired)' };
            } else if (response.status === 429) {
                return { success: false, reason: 'Rate limited by Minecraft API (Too many requests)' };
            } else {
                return { success: false, reason: `Minecraft API error (${response.status})` };
            }
        }

        // Case B: URL via JSON
        const client = new HttpClient();
        const response = await client.post(
            'https://api.minecraftservices.com/minecraft/profile/skins',
            JSON.stringify({
                variant: modelVariant,
                url: resolved.url
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ssid}`
                },
                validateStatus: (status) => status >= 200 && status < 505
            }
        );

        if (response.status === 200 || response.status === 204) {
            return {
                success: true,
                url: resolved.url,
                variant: modelVariant,
                playerName: resolved.playerName || null
            };
        } else if (response.status === 400) {
            // Fallback: try fetching image and uploading as buffer
            try {
                const imgRes = await axios.get(resolved.url, { responseType: 'arraybuffer', timeout: 5000 });
                if (imgRes.data) {
                    const fallbackRes = await uploadSkinBuffer(ssid, Buffer.from(imgRes.data), modelVariant);
                    if (fallbackRes.status === 200 || fallbackRes.status === 204) {
                        return {
                            success: true,
                            url: resolved.url,
                            variant: modelVariant,
                            playerName: resolved.playerName || null
                        };
                    }
                }
            } catch (e) { }

            return { success: false, reason: 'Invalid Skin URL format (Must be a valid direct PNG URL)' };
        } else if (response.status === 401) {
            return { success: false, reason: 'Unauthorized (SSID token expired)' };
        } else if (response.status === 429) {
            return { success: false, reason: 'Rate limited by Minecraft API (Too many requests)' };
        } else if (response.status >= 500) {
            return { success: false, reason: 'Minecraft Services API is currently unavailable' };
        } else {
            return { success: false, reason: `Minecraft API error (${response.status})` };
        }
    } catch (err) {
        console.error('[CHANGE_SKIN] Unexpected error:', err.message);
        return { success: false, reason: err.message };
    }
}

/**
 * Resets a Minecraft account's skin to default.
 * @param {string} ssid - Minecraft Bearer access token
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function resetSkin(ssid) {
    try {
        if (!ssid) return { success: false, reason: 'Missing SSID token' };

        const client = new HttpClient();
        const response = await client.delete(
            'https://api.minecraftservices.com/minecraft/profile/skins/active',
            {
                headers: {
                    'Authorization': `Bearer ${ssid}`
                },
                validateStatus: (status) => status >= 200 && status < 505
            }
        );

        if (response.status === 200 || response.status === 204) {
            return { success: true };
        } else {
            return { success: false, reason: `API error (${response.status})` };
        }
    } catch (err) {
        return { success: false, reason: err.message };
    }
}

module.exports = {
    DEFAULT_SKIN_DATA,
    resolveSkinUrl,
    changeSkin,
    resetSkin
};
