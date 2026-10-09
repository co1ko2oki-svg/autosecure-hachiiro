const { queryParams } = require('../../../db/database');
const { EmbedBuilder } = require("discord.js");
const { parsePurchases } = require('../../../autosecure/utils/info/parsePurchases');

module.exports = {
    name: "purchases",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            let [_, uid] = interaction.customId.split("|");

            const result = await queryParams('SELECT purchases FROM extrainformation WHERE uid = ?', [uid]);
            const rawPurchases = result?.[0]?.purchases || null;
            const { orders, redeemedCapes } = parsePurchases(rawPurchases);

            const embed = new EmbedBuilder()
                .setTitle(`Order History & Purchases (${uid})`)
                .setColor('#b2c7e0');

            if (orders.length === 0) {
                embed.setDescription("❌ Không tìm thấy giao dịch mua hàng hoặc áo choàng đã đổi nào cho tài khoản này.");
                return interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                });
            }

            // 1. Highlight Redeemed Capes
            if (redeemedCapes.length > 0) {
                const capesText = redeemedCapes.map(cape => `✨ **${cape}** \`[Đã đổi mã / Redeemed]\``).join('\n');
                embed.addFields({
                    name: `✨ Áo choàng đã đổi / Redeemed Capes (${redeemedCapes.length})`,
                    value: capesText,
                    inline: false
                });
            }

            // 2. All Orders
            const capeOrders = orders.filter(o => o.isCape);
            const otherOrders = orders.filter(o => !o.isCape);

            let descLines = [];
            if (capeOrders.length > 0) {
                descLines.push("**🏆 Chi tiết áo choàng đã đổi:**");
                capeOrders.slice(0, 10).forEach((order, idx) => {
                    descLines.push(
                        `**${idx + 1}. ${order.title}**\n` +
                        `• Giá: \`$${order.price} (Đã đổi mã)\` | Ngày: \`${order.date}\`\n` +
                        `• Mã đơn hàng: \`${order.orderId}\``
                    );
                });
            }

            if (otherOrders.length > 0) {
                if (descLines.length > 0) descLines.push("\n**📦 Các đơn hàng khác:**");
                otherOrders.slice(0, 15).forEach((order, idx) => {
                    const statusText = order.isRedeemed ? "Đã đổi mã / Free" : `$${order.price}`;
                    descLines.push(
                        `**${idx + 1}. ${order.title}**\n` +
                        `• Giá: \`${statusText}\` | Ngày: \`${order.date}\`\n` +
                        `• Mã đơn hàng: \`${order.orderId}\``
                    );
                });
            }

            if (orders.length > 25) {
                descLines.push(`\n*...và ${orders.length - 25} đơn hàng khác.*`);
            }

            embed.setDescription(descLines.join('\n'));

            await interaction.reply({ 
                embeds: [embed], 
                ephemeral: true 
            });
        } catch (error) {
            console.error("Error in purchases command:", error);
            return interaction.reply({
                content: "There was an error processing your request.",
                ephemeral: true,
            });
        }
    }
};
