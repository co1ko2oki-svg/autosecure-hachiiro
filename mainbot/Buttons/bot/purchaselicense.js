const { purchasethread } = require("../../utils/purchase/purchasethread");


module.exports = {
    name: "purchaselicense",
    callback: async (client, interaction) => {
      return await purchasethread(interaction, "license")
    }
};
