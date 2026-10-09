/**
 * Fetches Microsoft Account order history and payment transactions.
 * Retrieves digital purchases, redeemed item codes (e.g. Aurora Cape, Anniversary capes),
 * and store transactions from Microsoft Store API.
 * 
 * @param {import('../process/HttpClient')} axios 
 * @param {string} msatoken 
 * @returns {Promise<string|null>}
 */
async function getpurchases(axios, msatoken) {
  if (!msatoken) return null;

  const authHeader = msatoken.startsWith('Bearer ') || msatoken.startsWith('MSAToken ') ? msatoken : `Bearer ${msatoken}`;
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://account.microsoft.com/billing/orders',
    'Content-Type': 'application/json',
    'Authorization': authHeader,
    'Origin': 'https://account.microsoft.com',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };

  let orders = [];
  let paymentTransactions = [];

  // 1. Fetch Microsoft Store Orders (Redeemed codes, Capes, Games, DLCs)
  const orderEndpoints = [
    'https://purchase.mp.microsoft.com/v8.0/users/me/orders',
    'https://orders.mp.microsoft.com/v7.0/users/me/orders'
  ];

  for (const endpoint of orderEndpoints) {
    try {
      const orderRes = await axios.get(endpoint, {
        headers: baseHeaders,
        timeout: 10000
      });
      if (orderRes?.data) {
        if (Array.isArray(orderRes.data.orders)) {
          orders = orderRes.data.orders;
          break;
        } else if (Array.isArray(orderRes.data)) {
          orders = orderRes.data;
          break;
        }
      }
    } catch (e) {
      // Continue to next endpoint or fallback
    }
  }

  // 2. Fetch Payment Transactions (Billing & card transactions)
  try {
    const paymentRes = await axios.get('https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentTransactions', {
      headers: {
        ...baseHeaders,
        'Authorization': msatoken
      },
      timeout: 10000
    });
    if (paymentRes?.data) {
      if (Array.isArray(paymentRes.data.paymentTransactions)) {
        paymentTransactions = paymentRes.data.paymentTransactions;
      } else if (Array.isArray(paymentRes.data)) {
        paymentTransactions = paymentRes.data;
      } else if (paymentRes.data.orders && orders.length === 0) {
        orders = paymentRes.data.orders;
      }
    }
  } catch (e) {
    // Non-fatal if payment transactions endpoint fails
  }

  const combined = {
    orders: orders,
    paymentTransactions: paymentTransactions
  };

  return JSON.stringify(combined);
}

module.exports = getpurchases;
