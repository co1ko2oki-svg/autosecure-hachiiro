const { ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { queryParams } = require("../../../db/database");
const { footer } = require('../../../config.json');
const config = require('../../../config.json');
const { fetchEmails, fetchEmailDetail } = require("../../../autosecure/utils/emails/mailApiClient");

module.exports = async (email, id, current) => {
    let owndomain;
    let embed = {
        title: email,
        color: 0x808080
    };

    let buttons = [];
    let msg = {
        ephemeral: true
    };

    if (!email || !email.includes("@")) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setTitle("Invalid email!")
                    .setColor(0xADD8E6)
            ],
            ephemeral: true
        };
    }

    const emaildomain = (email.split('@')[1] || "").toLowerCase();

    const publicEmailProviders = [
        "gmail.com", "googlemail.com", "icloud.com", "me.com", "mac.com",
        "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com",
        "ymail.com", "aol.com", "proton.me", "protonmail.com", "zoho.com",
        "mail.com", "gmx.com", "yandex.com", "1secmail.com", "1secmail.org",
        "1secmail.net", "kzccv.com", "qiott.com", "wuuvo.com", "igjys.com", "oosnx.com"
    ];

    function isconfigdomain(domain) {
        return (config.domains || []).includes(domain);
    }

    if (email.includes("@") && !isconfigdomain(emaildomain) && !publicEmailProviders.includes(emaildomain)) {
        owndomain = true;
    }

    const normalizedEmail = email.toLowerCase().trim();
    let emails = [];

    // 1. Fetch live emails from the Web Mail API
    try {
        const apiList = await fetchEmails(normalizedEmail);
        if (Array.isArray(apiList) && apiList.length > 0) {
            emails = apiList.map(item => {
                const otpMatch = item.otp_code || (item.subject && item.subject.match(/\b\d{6,7}\b/)?.[0]) || null;
                return {
                    id: item.id,
                    sender: item.sender || "unknown",
                    receiver: item.recipient || normalizedEmail,
                    subject: item.subject || "(No Subject)",
                    description: item.body_text || item.subject || "",
                    otp: otpMatch,
                    time: item.created_at || Date.now()
                };
            });
        }
    } catch (err) {
        console.warn(`[MAIL_MSG] Failed to fetch emails from API for ${normalizedEmail}:`, err.message);
    }

    // 2. Fallback to local SQLite database if API returned empty
    if (emails.length === 0) {
        const localRows = await queryParams(
            `SELECT * FROM emails WHERE LOWER(TRIM(receiver))=? ORDER BY CAST(time AS INTEGER) DESC`,
            [normalizedEmail]
        );

        if (localRows.length > 0) {
            emails = localRows.map(r => ({
                id: r.id,
                sender: r.sender || "unknown",
                receiver: r.receiver || normalizedEmail,
                subject: r.subject || "(No Subject)",
                description: r.description || "",
                otp: r.description ? r.description.match(/\b\d{6,7}\b/)?.[0] : null,
                time: r.time || Date.now()
            }));
        } else {
            const broadSearch = await queryParams(
                `SELECT * FROM emails WHERE LOWER(receiver) LIKE ? ORDER BY CAST(time AS INTEGER) DESC`,
                [`%${normalizedEmail}%`]
            );
            if (broadSearch.length > 0) {
                emails = broadSearch.map(r => ({
                    id: r.id,
                    sender: r.sender || "unknown",
                    receiver: r.receiver || normalizedEmail,
                    subject: r.subject || "(No Subject)",
                    description: r.description || "",
                    otp: r.description ? r.description.match(/\b\d{6,7}\b/)?.[0] : null,
                    time: r.time || Date.now()
                }));
            }
        }
    }

    console.log(`[DEBUG] Email query for ${email}: found ${emails.length} emails`);

    current = Number(current) || 1;

    let isNotified = await queryParams(
        `SELECT * FROM email_notifier WHERE user_id=? AND email=?`,
        [id, email]
    );

    let notificationButton;
    if (isNotified.length == 0) {
        notificationButton = new ButtonBuilder()
            .setCustomId("notifier|" + email + "|" + current)
            .setLabel("Enable Notifications & Save")
            .setEmoji({ name: "🔔" })
            .setStyle(ButtonStyle.Success);
    } else {
        notificationButton = new ButtonBuilder()
            .setCustomId("notifier|" + email + "|" + current)
            .setLabel("Disable Notifications & Remove")
            .setEmoji({ name: "🔔" })
            .setStyle(ButtonStyle.Danger);
    }

    if (emails.length === 0) {
        if (owndomain) {
            embed.description = `No emails yet. You seem to be using a different (own) domain.`;

            let refreshButton = new ButtonBuilder()
                .setCustomId("refresh|" + email + "|" + current)
                .setLabel("Refresh")
                .setEmoji({ name: "🔄" })
                .setStyle(ButtonStyle.Primary);

            let setupDomainButton = new ButtonBuilder()
                .setCustomId("setupdomain")
                .setLabel("Setup mail forwarding")
                .setEmoji({ name: "📧" })
                .setStyle(ButtonStyle.Secondary);

            buttons.push(new ActionRowBuilder().addComponents(refreshButton, setupDomainButton));
        } else {
            embed.description = `This address hasn't received any emails yet.`;

            let refreshButton = new ButtonBuilder()
                .setCustomId("refresh|" + email + "|" + current)
                .setLabel("Refresh")
                .setEmoji({ name: "🔄" })
                .setStyle(ButtonStyle.Primary);

            buttons.push(new ActionRowBuilder().addComponents(refreshButton));
        }

        buttons.push(new ActionRowBuilder().addComponents(notificationButton));
    } else {
        current = Math.max(1, Math.min(current, emails.length));
        const activeMail = emails[current - 1];

        // If activeMail has an id, attempt to fetch full detail if body is brief
        if (activeMail?.id && (!activeMail.description || activeMail.description === activeMail.subject)) {
            try {
                const detail = await fetchEmailDetail(activeMail.id);
                if (detail) {
                    if (detail.body_text) activeMail.description = detail.body_text;
                    if (detail.otp_code) activeMail.otp = detail.otp_code;
                }
            } catch (detailErr) {}
        }

        msg.content = `${email}`;
        embed.title = activeMail?.subject
            ? activeMail.subject.replaceAll("*", "\\*")
            : `No Subject!`;

        let description = activeMail?.description
            ? activeMail.description.replaceAll("*", "\\*")
            : `No description!`;

        // If an OTP code was extracted, highlight it prominently at the top of description
        const detectedOtp = activeMail?.otp || description.match(/\b\d{6,7}\b/)?.[0] || null;
        if (detectedOtp) {
            description = `🔐 **Mã OTP**: \`\`\`${detectedOtp}\`\`\`\n\n` + description;
        }

        if (description.length > 4096) {
            description = description.substring(0, 4093) + "...";
        }

        embed.description = description;

        const mailTimestamp = parseInt(activeMail.time);
        if (!isNaN(mailTimestamp)) {
            const d = new Date(mailTimestamp);
            embed.timestamp = d.toISOString();
        }
        embed.footer = footer;

        let next = (current + 1).toString();
        let back = (current - 1).toString();
        let fastforward = emails.length.toString();

        buttons.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`move|${email}|1|fastbackward`)
                    .setEmoji({ name: "⏪" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === 1),
                new ButtonBuilder()
                    .setCustomId(`move|${email}|${back}|backward`)
                    .setEmoji({ name: "◀️" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === 1),
                new ButtonBuilder()
                    .setCustomId(`current|${email}`)
                    .setLabel(`${current}/${emails.length}`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`move|${email}|${next}|forward`)
                    .setEmoji({ name: "➡️" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === emails.length),
                new ButtonBuilder()
                    .setCustomId(`move|${email}|${fastforward}|fastforward`)
                    .setEmoji({ name: "⏩" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === emails.length)
            )
        );

        let refreshButton = new ButtonBuilder()
            .setCustomId("refresh|" + email + "|" + current)
            .setLabel("Refresh")
            .setEmoji({ name: "🔄" })
            .setStyle(ButtonStyle.Primary);

        const controlRow = new ActionRowBuilder().addComponents(notificationButton, refreshButton);

        // Add 1-tap Copy OTP button if an OTP was detected
        if (detectedOtp) {
            const copyOtpButton = new ButtonBuilder()
                .setCustomId(`copycode|${detectedOtp}`)
                .setLabel("Copy OTP")
                .setEmoji({ name: "📋" })
                .setStyle(ButtonStyle.Success);
            controlRow.addComponents(copyOtpButton);
        }

        buttons.push(controlRow);
    }

    msg.embeds = [embed];
    msg.components = buttons;

    return msg;
};
