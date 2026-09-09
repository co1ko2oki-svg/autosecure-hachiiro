const { createGiftPayload } = require("../../commands/users/gift");

module.exports = async (client, message) => {
  try {
    if (!message || message.author?.bot) return;

    const content = (message.content || "").trim();
    if (!content.toLowerCase().startsWith("!gift") && !content.toLowerCase().startsWith("/gift")) {
      return;
    }

    // Parse arguments: e.g. "!gift FREEVIP" or "/gift FREEVIP 7446865"
    const parts = content.split(/\s+/);
    const customCode = parts[1] || null;
    const pkg = parts[2] || "all";

    const { embed, row } = createGiftPayload(customCode, pkg);

    await message.reply({
      embeds: [embed],
      components: [row]
    });
  } catch (err) {
    console.error("[EVENT giftTextCommand] Error:", err.message);
  }
};
