const { ButtonStyle, ButtonBuilder } = require("discord.js");

module.exports = (type, obj) => {
  switch (type) {
    case "oauth":
      return new ButtonBuilder()
        .setEmoji("✅")
        .setStyle(ButtonStyle.Link)
        .setLabel(`Link`)
        .setURL(obj.url);

    case "howto":
      return new ButtonBuilder()
        .setCustomId("howto|")
        .setEmoji("📙")
        .setLabel("How to Add Security Email?")
        .setStyle(ButtonStyle.Primary);

    case "continue":
      return new ButtonBuilder()
        .setCustomId("continue|")
        .setLabel("Continue")
        .setStyle(ButtonStyle.Primary);

    case "retry":
      return new ButtonBuilder()
        .setCustomId("link account")
        .setLabel("Retry")
        .setEmoji("🔁")
        .setStyle(ButtonStyle.Success);

    case "howtoauth":
      return new ButtonBuilder()
        .setCustomId("howtoauthbutton|")
        .setEmoji("📱")
        .setLabel("How to Remove 2FA / Verify?")
        .setStyle(ButtonStyle.Primary);
    
      case "entercodepreset":
          return new ButtonBuilder()
            .setCustomId("submitpreset|")
            .setLabel(`Enter Code`)
            .setStyle(ButtonStyle.Primary);

    case "link account":
      return new ButtonBuilder()
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setLabel(`Link Account`)
        .setCustomId(`link account`);

        case "continuedm":
      return new ButtonBuilder()
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setLabel(`Continue`)
        .setCustomId(`SplitVerification`);

    case "code":
      return new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel(`Enter Code`)
        .setCustomId(`submit`);

    case "alternative":
      return new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel(`Alternative Method`)
        .setCustomId(`alternative`);
    
        case "extrabutton":
      return new ButtonBuilder()
        .setStyle(ButtonStyle.Primary)
        .setLabel(`Extra Info`)
        .setCustomId(`extrabutton`);


    default:
      console.log(`Invalid button type ${type}`);
      return null;
  }
};
