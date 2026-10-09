/**
 * Utility to parse Microsoft purchases and extract redeemed codes & capes.
 */

function parsePurchases(rawPurchases) {
    if (!rawPurchases) {
        return { orders: [], redeemedCapes: [], totalOrders: 0 };
    }

    let data = rawPurchases;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
        } catch (e) {
            return { orders: [], redeemedCapes: [], totalOrders: 0 };
        }
    }

    let allOrders = [];
    if (Array.isArray(data)) {
        allOrders = data;
    } else if (data && typeof data === 'object') {
        if (Array.isArray(data.orders)) {
            allOrders = data.orders;
        } else if (Array.isArray(data.paymentTransactions)) {
            allOrders = data.paymentTransactions;
        } else if (Array.isArray(data.items)) {
            allOrders = data.items;
        }
    }

    const parsedItems = [];
    const redeemedCapes = [];

    for (const order of allOrders) {
        if (!order) continue;
        const orderId = order.orderId || order.id || order.transactionId || 'N/A';
        const rawDate = order.orderDate || order.date || order.creationDate || order.orderDateTime;
        let formattedDate = 'N/A';
        if (rawDate) {
            try {
                formattedDate = new Date(rawDate).toLocaleDateString('vi-VN');
            } catch (e) {
                formattedDate = String(rawDate).slice(0, 10);
            }
        }

        const lineItems = Array.isArray(order.orderLineItems) && order.orderLineItems.length > 0 
            ? order.orderLineItems 
            : [order];

        for (const item of lineItems) {
            if (!item) continue;
            const title = item.description || item.title || item.productName || item.name || order.description || 'Unknown Item';
            const price = typeof item.totalAmount === 'number' ? item.totalAmount : (typeof item.price === 'number' ? item.price : 0);
            const productType = item.productType || order.productType || '';
            const paymentMethod = String(order.paymentMethod || order.paymentInstrument || '').toLowerCase();
            const isRedeemed = price === 0 || 
                paymentMethod.includes('token') || 
                paymentMethod.includes('code') || 
                paymentMethod.includes('đã đổi') ||
                String(productType).toLowerCase().includes('token');

            const isCape = /cape/i.test(title);
            if (isCape && !redeemedCapes.includes(title)) {
                redeemedCapes.push(title);
            }

            parsedItems.push({
                orderId,
                date: formattedDate,
                title,
                price: price.toFixed(2),
                isRedeemed,
                isCape,
                productType
            });
        }
    }

    return {
        orders: parsedItems,
        redeemedCapes,
        totalOrders: parsedItems.length
    };
}

module.exports = {
    parsePurchases
};
