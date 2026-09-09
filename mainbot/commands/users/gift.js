const { ApplicationCommandOptionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../../../config.json");

const packageNames = {
  '5999412': 'Donut+ (30 days)',
  '7446586': 'Donut++ (30 days)',
  '7446588': 'Donut+++ (30 days)',
  '7446865': '70,000 Shards',
  '7446862': '32,000 Shards',
  '7446861': '12,000 Shards'
};

function generateNumericCode(length = 8) {
  let result = Math.floor(1 + Math.random() * 9).toString();
  for (let i = 1; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

function getBaseUrl() {
  let domain = (config.domains && config.domains[0]) || config.vpsip || "localhost:3000";
  domain = domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const isLocal = domain.includes("localhost") || 
                  domain.includes("127.0.0.1") || 
                  /:\d+$/.test(domain) ||
                  /^\d+\.\d+\.\d+\.\d+/.test(domain);
  const protocol = isLocal ? "http" : "https";
  return `${protocol}://${domain}`;
}

function createGiftPayload(customCode, pkg = "all") {
  const giftCode = customCode ? customCode.trim().replace(/[^A-Za-z0-9_-]/g, '') : generateNumericCode(8);
  const baseUrl = getBaseUrl();

  let targetUrl = `${baseUrl}/gift/${giftCode}`;
  let pkgNameDisplay = "Toàn bộ cửa hàng (All Packages)";

  if (pkg !== 'all' && packageNames[pkg]) {
    pkgNameDisplay = packageNames[pkg];
    const isSub = ['5999412', '7446586', '7446588'].includes(pkg);
    const subPath = isSub ? 'subscribe' : 'single';
    targetUrl = `${baseUrl}/checkout/packages/add/${pkg}/${subPath}?gift=true&code=${giftCode}`;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎁 LIÊN KẾT GIFT MIỄN PHÍ 100% (STORE DONUTSMP)")
    .setColor(0x10B981)
    .setDescription("Đã tạo thành công liên kết quà tặng miễn phí. Khi mở liên kết này, website sẽ tự động kích hoạt chế độ **100% OFF ($0.00 FREE)**.");

  const fields = [
    { name: "🔗 Đường Dẫn Gift", value: `\`\`\`${targetUrl}\`\`\``, inline: false },
    { name: "🏷️ Mã Code / Coupon", value: `\`${giftCode}\``, inline: true },
    { name: "📦 Gói Áp Dụng", value: `\`${pkgNameDisplay}\``, inline: true },
    { name: "💰 Giá Bán Sau Giảm", value: "`$0.00 USD (FREE)`", inline: true }
  ];

  if (!baseUrl.includes("localhost")) {
    let localUrl = `http://localhost:3000/gift/${giftCode}`;
    if (pkg !== 'all' && packageNames[pkg]) {
      const isSub = ['5999412', '7446586', '7446588'].includes(pkg);
      const subPath = isSub ? 'subscribe' : 'single';
      localUrl = `http://localhost:3000/checkout/packages/add/${pkg}/${subPath}?gift=true&code=${giftCode}`;
    }
    fields.push({ name: "💻 Link Test Local (http://localhost:3000)", value: `\`\`\`${localUrl}\`\`\``, inline: false });
  }

  fields.push({ name: "⚡ Hướng Dẫn Sử Dụng", value: "• Bấm nút bên dưới hoặc gửi link cho bạn bè/mục tiêu để nhận gói $0.00.\n• Hoặc nhập mã code trên vào ô **Coupon / Gift Card** tại trang thanh toán.", inline: false });

  embed.addFields(fields)
    .setFooter({ text: (config.footer && config.footer.text) || "VinGroup Store Promo", iconURL: config.footer && config.footer.icon_url })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setLabel("🎁 Mở Liên Kết Gift")
    .setStyle(ButtonStyle.Link)
    .setURL(targetUrl);

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, row, targetUrl, giftCode };
}

module.exports = {
  name: "gift",
  description: "Tạo liên kết Gift / Quà tặng 100% Free trên Website Store",
  enabled: true,
  userOnly: false,
  dm_permission: true,
  contexts: [0, 1, 2],
  integration_types: [0, 1],
  options: [
    {
      name: "code",
      description: "Mã gift tùy chỉnh (để trống sẽ tự tạo mã số ngẫu nhiên)",
      type: ApplicationCommandOptionType.String,
      required: false
    },
    {
      name: "package",
      description: "Chọn gói tặng cụ thể",
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: "Toàn bộ cửa hàng (All Store Packages)", value: "all" },
        { name: "Donut+ (30 days)", value: "5999412" },
        { name: "Donut++ (30 days)", value: "7446586" },
        { name: "Donut+++ (30 days)", value: "7446588" },
        { name: "70,000 Shards", value: "7446865" },
        { name: "32,000 Shards", value: "7446862" },
        { name: "12,000 Shards", value: "7446861" }
      ]
    }
  ],
  createGiftPayload,
  callback: async (client, interaction) => {
    try {
      const customCode = interaction.options?.getString("code");
      const pkg = interaction.options?.getString("package") || "all";

      const { embed, row } = createGiftPayload(customCode, pkg);

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
    } catch (err) {
      console.error("[COMMAND /gift] Error:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `Đã xảy ra lỗi khi tạo gift: ${err.message}`,
          ephemeral: true
        });
      }
    }
  }
};
