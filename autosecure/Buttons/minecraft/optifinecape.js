const { EmbedBuilder } = require("discord.js");
const axios = require('axios');
const profile = require('../../utils/minecraft/profile');

module.exports = {
  name: "optifinecape",
  ownerOnly: true,
  callback: async (client, interaction) => {
    try {
      await interaction.deferReply({ ephemeral: true });
      const parts = interaction.customId.split("|");
      const ssid = parts[1];
      const fallbackName = parts[2];
      let name = null;

      try {
        const minecraft = await profile(ssid);
        if (minecraft?.name) {
          name = minecraft.name;
        }
      } catch {}

      if (!name) name = fallbackName;

      if (!name || name === "Couldn't find!" || name === "No Minecraft!") {
        return interaction.editReply({ content: "No Minecraft username found for this account." });
      }

      const link = `http://s.optifine.net/capes/${encodeURIComponent(name)}.png`;
      let isValid = false;

      try {
        const isvalidreq = await axios.get(link, { timeout: 5000 });
        if (isvalidreq && isvalidreq.status === 200) {
          isValid = true;
        }
      } catch {
        isValid = false;
      }

      const content = isValid ? link : `Couldn't find an OptiFine Cape for ${name}.`;
      await interaction.editReply({ content });
    } catch (err) {
      console.error("[OPTIFINECAPE] Error:", err.message || err);
      const method = (interaction.deferred || interaction.replied) ? 'editReply' : 'reply';
      await interaction[method]({
        ephemeral: true,
        content: `An error occurred: ${err.message}`
      }).catch(() => {});
    }
  }
};