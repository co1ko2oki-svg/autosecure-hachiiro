

/**
 * Safely extracts user PUID from Microsoft Family home page or API response.
 * Handles both JSON object responses and HTML string responses without assuming string type or line count.
 * @param {HttpClient} axios 
 * @returns {Promise<string|null>}
 */
module.exports = async (axios) => {
    try {
        const response = await axios.get(`https://account.microsoft.com/family/home`, {
            headers: {
                "X-Requested-With": "XMLHttpRequest",
            }
        });

        const data = response?.data;
        if (!data) return null;

        // 1. Direct object shape inspection (when axios auto-deserializes JSON response)
        if (typeof data === 'object') {
            const directPuid = data?.userPuid?.value || data?.userPuid || data?.puid || data?.memberId ||
                               data?.areaConfig?.userPuid?.value || data?.areaConfig?.userPuid;
            if (directPuid && typeof directPuid === 'string') {
                return directPuid;
            }
        }

        // 2. String conversion for regex inspection (HTML page or stringified body)
        const text = typeof data === 'string' ? data : JSON.stringify(data);

        // Pattern A: Direct JSON properties inside HTML or script blocks
        const directMatch = text.match(/"userPuid"\s*:\s*\{\s*"value"\s*:\s*"([^"]+)"/i) ||
                            text.match(/"userPuid"\s*:\s*"([^"]+)"/i) ||
                            text.match(/"puid"\s*:\s*"([^"]+)"/i);
        if (directMatch && directMatch[1]) {
            return directMatch[1];
        }

        // Pattern B: var areaConfig = JSON.stringify(...);
        const areaConfigMatch = text.match(/var\s+areaConfig\s*=\s*(?:JSON\.stringify\()?(\{[\s\S]*?\})\)?;/i) ||
                                text.match(/var\s+areaConfig\s*=\s*JSON\.stringify\(([\s\S]*?)\);/i);
        if (areaConfigMatch && areaConfigMatch[1]) {
            try {
                let parsed = JSON.parse(areaConfigMatch[1]);
                if (typeof parsed === 'string') {
                    parsed = JSON.parse(parsed);
                }
                const puid = parsed?.userPuid?.value || parsed?.userPuid || parsed?.puid;
                if (puid) return String(puid);
            } catch (_) {}
        }
    } catch (error) {
        console.error('[GET_PUID] Error fetching family home data:', error?.message || error);
    }

    return null;
};