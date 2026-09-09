const { 
    ApplicationCommandOptionType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require("discord.js");
const config = require("../../../config.json");

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

module.exports = {
    name: "donut",
    description: "Generate a Donut gift checkout link",
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
                    description: "Domain for the link (default from config)",
                    type: ApplicationCommandOptionType.String,
                    required: false
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
        }
    ],

    callback: async (client, interaction) => {
        try {
            const orderKey = interaction.options.getString("order");
            const prod = products[orderKey] || { name: "Donut+ (30 days)", price: "$4.99", pkgId: "5999412" };
            
            // Domain selection
            let customDomain = interaction.options.getString("domain");
            let domain = customDomain || (config.domains && config.domains[0]) || config.vpsip || "donutmp.store";
            domain = domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');

            const isLocal = domain.includes("localhost") || domain.includes("127.0.0.1") || /:\d+$/.test(domain);
            const protocol = isLocal ? "http" : "https";

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

            // Save to gift_links table for web activity tracking
            const botUserId = client.username || client.user.id;
            const botNumber = client.botnumber || 1;
            try {
                await client.queryParams(
                    `INSERT OR REPLACE INTO gift_links (code, bot_user_id, bot_number, order_name, original_price, sale_price, coupon, domain, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [giftCode, botUserId, botNumber, prod.name, prod.price, salePrice, couponCode, domain, Date.now()]
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
                    `**Expires:** 5 giờ tới\n\n` +
                    `**Link:** ${claimUrl}`
                )
                .setFooter({
                    text: `Gift ${giftCode} • one claim • manage with /donut web • Hôm nay lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
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
