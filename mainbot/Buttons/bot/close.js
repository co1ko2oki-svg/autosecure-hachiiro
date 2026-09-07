const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../../config.json');
const { createTranscript } = require('discord-html-transcripts');

module.exports = {
    name: "close",
    callback: async (client, interaction) => {
        try {
            const channel = interaction.channel;
            const parts = interaction.customId.split('|');
            const userId = parts[1];
            const reason = parts[2] || "No reason provided";

            if (!channel) {
                return await interaction.reply({ 
                    content: "❌ Channel not found!", 
                    ephemeral: true 
                });
            }

            await interaction.deferReply();


            let creator = "Unknown";
            let creatorTag = "Unknown";
            try {
                const user = await client.users.fetch(userId);
                creator = user.username;
                creatorTag = user.tag;
            } catch (error) {
                console.error('Error fetching user:', error);
            }


            const transcript = await createTranscript(channel, {
                limit: -1,
                fileName: `${channel.name}_transcript.html`,
                returnBuffer: false,
                saveImages: true,
                poweredBy: false,
                footerText: `Ticket closed by ${interaction.user.tag} | ${new Date().toLocaleString()}`
            });


            const transcriptEmbed = new EmbedBuilder()
                .setColor(0xc8a2c8)
                .setTitle('Transcript')
                .setDescription(`\`${channel.name}\` has been closed`)
                .addFields(
                    { name: 'Creator', value: creatorTag, inline: true },
                    { name: 'Closed by', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { 
                        name: 'Timestamps', 
                        value: `Created: <t:${Math.floor(channel.createdTimestamp / 1000)}:f>\nClosed: <t:${Math.floor(Date.now() / 1000)}:f>`,
                        inline: false 
                    }
                )
                .setTimestamp();


            const tempDir = path.join(__dirname, '../../../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const transcriptPath = path.join(tempDir, transcript.name);
            fs.writeFileSync(transcriptPath, transcript.attachment);


            if (config.transcripts) {
                const transcriptsChannel = await client.channels.fetch(config.transcripts).catch(() => null);
                if (transcriptsChannel) {
                    await transcriptsChannel.send({
                        embeds: [transcriptEmbed],
                        files: [new AttachmentBuilder(transcriptPath)]
                    });
                }
            }


            await interaction.editReply({
                content: `✅ Successfully closed ticket \`${channel.name}\``
            });


            if (client.tickets && client.tickets.has(userId)) {
                client.tickets.delete(userId);
            }


            setTimeout(() => {
                if (fs.existsSync(transcriptPath)) {
                    fs.unlinkSync(transcriptPath);
                }
            }, 30000);


            await channel.delete().catch(error => {
                console.error('Error deleting channel:', error);
            });
            
        } catch (error) {
            console.error('Close Error:', error);
            await interaction.editReply({ 
                content: "❌ Failed to close the ticket. Please try again or contact support.", 
                ephemeral: true 
            });
        }
    }
};