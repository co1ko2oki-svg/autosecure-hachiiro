const config = require("../../../config.json");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ThreadChannel,
  PermissionsBitField
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const bip39 = require('bip39');
const generateuid = require("../../../autosecure/utils/generateuid");
const {
  Invoice,
  invoicesMap,
  fetchLtcPrice,
  INVOICE_STATUS,
  getAddressFromMnemonic,
  addInvoice
} = require("./combined");

const TRANSACTION_TIMEOUT = 60 * 60 * 1000;

async function purchasethread(interaction, mode) {
  try {
    await interaction.deferReply({ ephemeral: true });

    if (!['slot', 'license'].includes(mode)) {
      return interaction.editReply({
        content: "Invalid purchase mode."
      });
    }

    const ltcPrice = await fetchLtcPrice();
    if (ltcPrice <= 0) {
      return interaction.editReply({
        content: "❌ Could not fetch LTC price. Please try again later."
      });
    }

    const usdPrice = 0.05;
    if (isNaN(usdPrice) || usdPrice <= 0) {
      return interaction.editReply({
        content: "❌ Invalid price configuration."
      });
    }

    const ltcAmount = usdPrice / ltcPrice;

    const threadName = `${mode === 'slot' ? 'Slot' : 'License'} Purchase - ${interaction.user.username}`;
    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: 60,
      reason: `${mode} purchase transaction`,
    });

    const uid = await generateuid(8);
    const invoiceId = `INV-${uid}-${mode.toUpperCase().slice(0, 3)}`;

    const mnemonic = bip39.generateMnemonic();
    const addressResult = getAddressFromMnemonic(mnemonic);

    if (!addressResult.success) {
      return interaction.editReply({
        content: "❌ Failed to generate payment address."
      });
    }

    const invoice = new Invoice(
      interaction.user.id,
      thread.id,
      invoiceId
    );

    invoice.price = ltcAmount;
    invoice.address = addressResult.address;
    invoice.mnemonic = mnemonic;
    invoice.availableUntil = Date.now() + TRANSACTION_TIMEOUT;
    invoice.status = INVOICE_STATUS.PENDING;
    invoice.product_type = mode;

    await addInvoice(invoice);

    await thread.members.add(interaction.user.id);
    await sendInvoiceMessage(thread, interaction.user, invoice, mode, usdPrice);

    return interaction.editReply({
      content: `✅ Purchase thread created: <#${thread.id}>`
    });

  } catch (error) {
    console.error('Error creating purchase thread:', error);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({
        content: '❌ An error occurred while creating the purchase thread.'
      });
    } else {
      return interaction.reply({
        content: '❌ An error occurred while creating the purchase thread.',
        ephemeral: true
      });
    }
  }
}

async function sendInvoiceMessage(thread, user, invoice, mode, usdPrice) {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=litecoin:${invoice.address}?amount=${invoice.price.toFixed(8)}`;

  const embed = new EmbedBuilder()
    .setTitle(`${mode === 'slot' ? 'Bot Slot' : 'License'} Purchase`)
    .setDescription(`Please send **${invoice.price.toFixed(8)} LTC** ($${usdPrice.toFixed(2)} USD) to the address below.`)
    .addFields(
      { name: 'LTC Address', value: `\`${invoice.address}\``, inline: false },
      { name: 'Amount', value: `${invoice.price.toFixed(8)} LTC`, inline: true },
      { name: 'USD Value', value: `$${usdPrice.toFixed(2)}`, inline: true },
      { name: 'Invoice ID', value: invoice.invoiceId, inline: true },
      { name: 'Status', value: '🟡 Awaiting Payment', inline: true },
      { name: 'Expires', value: `<t:${Math.floor(invoice.availableUntil / 1000)}:R>`, inline: true }
    )
    .setColor('#F7931A')
    .setThumbnail(qrCodeUrl)
    .setFooter({ text: 'Payments are automatically verified.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`purchaseclose|${invoice.invoiceId}`)
      .setLabel('Close Invoice')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`purchasecopy|${invoice.invoiceId}`)
      .setLabel('Copy Details')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setURL(`https://blockchair.com/litecoin/address/${invoice.address}`)
      .setLabel('View on Explorer')
      .setStyle(ButtonStyle.Link)
  );

  await thread.send({
    content: `${user}, here are your payment details:`,
    embeds: [embed],
    components: [row],
    files: [{
      attachment: qrCodeUrl,
      name: 'qrcode.png'
    }]
  });
}

async function handleCopyButton(interaction, invoiceId) {
  try {
    const invoice = invoicesMap.get(invoiceId);

    if (!invoice) {
      return interaction.reply({
        content: '❌ Invoice not found or expired.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `💳 Send exactly ${invoice.price.toFixed(8)} LTC to:\n\`${invoice.address}\`\n\nInvoice ID: ${invoiceId}\n\nExpires: <t:${Math.floor(invoice.availableUntil / 1000)}:R>`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error handling copy button:', error);
    return interaction.reply({
      content: '❌ Failed to fetch invoice details.',
      ephemeral: true
    });
  }
}

async function handleCloseButton(interaction, invoiceId) {
  try {
    const invoice = invoicesMap.get(invoiceId);

    if (!invoice) {
      return interaction.reply({
        content: '❌ Invoice not found or already closed.',
        ephemeral: true
      });
    }

    if (interaction.user.id !== invoice.user_id && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageThreads)) {
      return interaction.reply({
        content: '❌ Only the buyer or moderators can close invoices.',
        ephemeral: true
      });
    }

    const hasTransactions = await invoice.checkForTransactions();
    if (hasTransactions && invoice.paidAmount > 0) {
      return interaction.reply({
        content: `⚠️ This invoice has received ${invoice.paidAmount.toFixed(8)} LTC. Are you sure you want to close it?`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`confirmclose|${invoiceId}`)
              .setLabel('Close Anyway')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`purchase-cancelclose|${invoiceId}`)
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          )
        ],
        ephemeral: true
      });
    }

    await closeInvoice(invoiceId, interaction);
    return interaction.reply({
      content: '✅ Invoice closed successfully.',
      ephemeral: true
    });

  } catch (error) {
    console.error('Error handling close button:', error);
    return interaction.reply({
      content: '❌ Failed to process your request.',
      ephemeral: true
    });
  }
}

async function handleConfirmClose(interaction, invoiceId) {
  try {
    await closeInvoice(invoiceId, interaction);
    return interaction.reply({
      content: '✅ Invoice force-closed successfully.',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error confirming close:', error);
    return interaction.reply({
      content: '❌ Failed to close invoice.',
      ephemeral: true
    });
  }
}

async function closeInvoice(invoiceId, interaction) {
  const invoice = invoicesMap.get(invoiceId);
  if (!invoice) return;

  try {
    invoice.status = INVOICE_STATUS.CLOSED;
    await invoice.updateInvoiceStatus();
    invoicesMap.delete(invoiceId);

    if (interaction.channel instanceof ThreadChannel) {
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('Invoice Closed')
            .setDescription(`This purchase was closed by ${interaction.user}`)
            .setColor('#FF0000')
        ]
      });
      await interaction.channel.setArchived(true);
    }

    if (invoice.paidAmount > 0) {
      await invoice.sendToMain();
    }
  } catch (error) {
    console.error('Error closing invoice:', error);
    throw error;
  }
}

module.exports = {
  purchasethread,
  handleCopyButton,
  handleCloseButton,
  handleConfirmClose
};
