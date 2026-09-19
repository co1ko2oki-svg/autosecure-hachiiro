const config = require("../../config.json");
const { createhelppanel } = require("./guidepanel");
const featurepanel = require("./featurepanel");
const purchasepanel = require("./purchasepanel");
const { mainclaimembed } = require("./usernotifications");
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

async function autoPostPanel(client, channelId, panelName, generateContent) {
    if (!channelId || typeof channelId !== 'string' || channelId.trim() === '') return;
    try {
        const channel = await client.channels.fetch(channelId.trim());
        if (!channel || !channel.isTextBased()) return;

        const messages = await channel.messages.fetch({ limit: 15 });
        const existingMessage = messages.find(m => m.author.id === client.user.id);

        const content = await generateContent();
        if (!content) return;

        if (existingMessage) {
            console.log(`[AUTOPANEL] Found existing ${panelName} panel message (${existingMessage.id}) in channel ${channelId}. Updating...`);
            await existingMessage.edit(content);
        } else {
            console.log(`[AUTOPANEL] No existing ${panelName} panel found in channel ${channelId}. Sending new message...`);
            await channel.send(content);
        }
    } catch (error) {
        console.warn(`[AUTOPANEL] Skipping ${panelName} panel (channel ${channelId}): ${error.message}`);
    }
}

async function initializeAutoPanels(client) {
    console.log("[AUTOPANEL] Checking and initializing auto-panels from config.json...");

    // 1. Guide Panel
    const guideCh = config.guidechannel || config.guide;
    if (guideCh) {
        await autoPostPanel(client, guideCh, "Guide", async () => createhelppanel());
    }

    // 2. Features Panel
    const featCh = config.featureschannel || config.features;
    if (featCh) {
        await autoPostPanel(client, featCh, "Features", async () => featurepanel());
    }

    // 3. Purchase Panel
    const purCh = config.purchasechannel || config.purchase;
    if (purCh) {
        await autoPostPanel(client, purCh, "Purchase", async () => purchasepanel());
    }

    // 4. Ticket Support Panel
    const tickCh = config.ticketchannel || config.ticket;
    if (tickCh) {
        await autoPostPanel(client, tickCh, "Ticket", async () => {
            const ticketEmbed = new EmbedBuilder()
                .setTitle('VinGr0ups3cur3 Support')
                .setDescription('Select the type of support ticket you need from the menu below:')
                .setColor(0xC8A2C8);

            const ticketOptions = new StringSelectMenuBuilder()
                .setCustomId(`createticket|system`)
                .setPlaceholder('Select ticket type...')
                .addOptions([
                    { label: 'License Support', description: 'Help with license / purchase', value: 'license' },
                    { label: 'General Support', description: 'General questions and help', value: 'support' },
                    { label: 'Bug Report', description: 'Report a problem or bug', value: 'bug' }
                ]);

            return {
                embeds: [ticketEmbed],
                components: [new ActionRowBuilder().addComponents(ticketOptions)]
            };
        });
    }

    // 5. Unclaimed / Draw Hit Panel
    const claimCh = config.claimchannel || config.claim;
    if (claimCh) {
        await autoPostPanel(client, claimCh, "Unclaimed/Draw Hit", async () => mainclaimembed(client));
    }
}

module.exports = { initializeAutoPanels, autoPostPanel };
