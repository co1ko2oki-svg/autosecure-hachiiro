const { purchasethread } = require("../../utils/purchase/purchasethread");


module.exports = {
    name: "purchaseslot",
    callback: async (client, interaction) => {
    return await purchasethread(interaction, "slot")
    }
};
