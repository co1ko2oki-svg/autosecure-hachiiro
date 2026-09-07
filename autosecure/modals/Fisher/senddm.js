const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { queryParams } = require("../../../db/database");
const getButton = require("../../utils/responses/getButton");

const senddm = {
  name: "senddm",
  usedmbuttons: true,
  callback: async (client, interaction) => {
    try {
      let msg = interaction.fields.getTextInputValue("msg") || "";
      let presetname = interaction.fields.getTextInputValue("preset") || "";
      let userid = interaction.customId.split("|")[1];

      if (!msg && !presetname) {
        await interaction.reply({ content: "Please enter at least one option (message or preset).", ephemeral: true });
        return;
      }

      let preset = [];
      if (presetname) {
        preset = await client.queryParams("SELECT * FROM presets WHERE user_id=? AND name=?", [client.username, presetname]);
      }

      let presetMsg = preset.length > 0 ? preset[0].preset : null;
      let buttonlabel = preset.length > 0 ? preset[0].buttonlabel : null;
      let buttonlink = preset.length > 0 ? preset[0].buttonlink : null;

      if (!presetMsg && !msg) {
        await interaction.reply({ content: "Non-existing preset.", ephemeral: true });
        return;
      }

      let user = await client.users.fetch(userid);
      if (!user) {
        await interaction.reply({ content: "User not found.", ephemeral: true });
        return;
      }

      if (presetMsg) {
        let embed = new EmbedBuilder(JSON.parse(presetMsg));
        let responseOptions = { embeds: [embed] };

        // Add button if both label and link exist
        if (buttonlabel && buttonlink) {
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setLabel(buttonlabel)
                .setURL(buttonlink)
                .setStyle(ButtonStyle.Link)
            );
          responseOptions.components = [row];
        }

        await user.send(responseOptions);
      } else {
        await user.send(msg);
      }

      await interaction.reply({ content: "Message sent successfully!", ephemeral: true });
    } catch (error) {
    
      console.error(error);
      await interaction.reply({ 
        content: "Failed to send the message. The user may have DMs disabled or the bot doesn't share a server with them.", 
        ephemeral: true 
      });
    }
  }
};

module.exports = senddm;