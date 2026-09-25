const { EmbedBuilder } = require("discord.js");
const config = require("../../../config.json");

function getDnsRecordsEmbed() {
    const gateway = config.smtpGateway || (config.domains && config.domains[0] ? `smtp.${config.domains[0]}` : "smtp.hotwar.asia");

    return new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(
            `Cấu hình 2 bản ghi sau tại trang quản lý DNS tên miền:\n\n` +
            `Type: **MX** | Host: **@** | Priority: **10** | Giá trị:\n` +
            `\`\`\`\n${gateway}\n\`\`\`\n` +
            `Type: **TXT** | Host: **@** | Giá trị: \`v=spf1 mx -all\``
        );
}

module.exports = { getDnsRecordsEmbed };
