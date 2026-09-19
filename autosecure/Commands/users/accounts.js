const accountsmsg = require('../../utils/accounts/accountsmsg')
const config = require("../../../config.json");

module.exports={
    name:"accounts",
    userOnly: true,
    description: 'List all your accounts',
    callback:async (client,interaction)=>{
      if (!config.owners.includes(interaction.user.id)) {
          return interaction.reply({ content: "Only admins can use this command.", ephemeral: true });
      }
      let id = interaction.user.id
      await interaction.reply(await accountsmsg(id,"1"))
    }
}