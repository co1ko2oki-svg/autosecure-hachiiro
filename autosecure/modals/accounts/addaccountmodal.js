const accountsmsg = require('../../utils/accounts/accountsmsg');
const insertaccount = require('../../../db/insertaccount');
const generateuid = require('../../utils/generateuid');
const isOwner = require('../../../db/isOwner');

module.exports = {
    name: "addaccountmodal",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            const [t, userId] = interaction.customId.split("|");
            const isUserOwner = await isOwner(interaction.user.id);
            if (userId && interaction.user.id !== userId && !isUserOwner) {
                return interaction.reply({
                    content: "You do not have permission to add accounts for this user.",
                    ephemeral: true
                });
            }
            const effectiveUserId = isUserOwner && userId ? userId : interaction.user.id;

            const oldName = interaction.fields.getTextInputValue('oldName');
            const password = interaction.fields.getTextInputValue('password');
           

            const combinedEmail = interaction.fields.getTextInputValue('email');
            let email, secEmail;
           
            if (combinedEmail.includes(',')) {
                [email, secEmail] = combinedEmail.split(',');
            } else {
                email = combinedEmail;
                secEmail = "Not set";
            }
           
            const secretkey = interaction.fields.getTextInputValue('secretkey');
            const recoveryCode = interaction.fields.getTextInputValue('recoveryCode');
           

            const uid = await generateuid();
           

            const accountData = {
                oldName: oldName,
                password: password,
                email: email,
                secEmail: secEmail || "Not set",
                secretkey: secretkey || "Not set",
                recoveryCode: recoveryCode || "Not set",
                mc: "Not set",  // Default value since removed from modal
                capes: "Not set", // Default value since removed from modal
            };
           

            const success = await insertaccount(accountData, uid, effectiveUserId, null, true);
            if (success) {
                await interaction.reply({
                    content: "Account added successfully!",
                    ephemeral: true
                });

                const updatedMsg = await accountsmsg(effectiveUserId, 1);
                await interaction.editReply(updatedMsg);
            } else {
                return interaction.reply({
                    content: "Failed to add account. Please try again.",
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error("Error in addaccountmodal:", error);
            return interaction.reply({
                content: "An error occurred while adding the account.",
                ephemeral: true
            });
        }
    }
};