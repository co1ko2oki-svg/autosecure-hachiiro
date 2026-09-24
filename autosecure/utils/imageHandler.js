const { makeCard } = require('./drawhit.js');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const https = require('https');
const crypto = require('crypto');

async function generateAndSendImage(acc, interaction) {
    try {
        // Only generate image if account has Minecraft
        if (!acc.newName || acc.newName === "No Minecraft!") {
            console.log('[IMAGE_HANDLER] Account has no Minecraft, skipping image generation');
            return;
        }

        console.log(`[IMAGE_HANDLER] Generating image for ${acc.newName}`);

        // Prepare stats data for image generation
        const stats = {
            username: acc.newName || acc.username,
            rank: acc.rank || 'NONE',
            networth: acc.networth || "Unknown",
            bedwars: acc.bedwarsLevel || acc.bedwars || "0",
            networkLevel: acc.networkLevel || "1",
            sbLevel: acc.sbLevel || "0",
            skywarsLevel: acc.skywarsLevel || "0",
            duelKDR: acc.duelKDR || "0",
            duelWinstreak: acc.duelWinstreak || "0",
            plusColour: acc.plusColour || "None",
            gifted: acc.gifted || "0",
            capes: acc.capes || [],
            donut: acc.donut || null,
            donutMoney: acc.donutMoney || acc.donut?.moneyFormatted || acc.donut?.money || null,
            donutShards: acc.donutShards || acc.donut?.shardsFormatted || acc.donut?.shards || null,
            donutPlaytime: acc.donutPlaytime || acc.donut?.playtime || null,
            donutRank: acc.donutRank || acc.donut?.rank || null,
            donutKDR: acc.donutKDR || acc.donut?.kdr || null
        };

        // Generate image
        const obscureName = (acc.newName || acc.username || "").length > 3
            ? (acc.newName || acc.username).substring(0, 2) + "x".repeat((acc.newName || acc.username).length - 2)
            : "account";
        const filename = `hit_${obscureName}_${Date.now()}.png`;
        const outputPath = path.join(__dirname, 'temp', filename);

        // Create temp directory if it doesn't exist
        const tempDir = path.dirname(outputPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const buffer = await makeCard(stats, outputPath);

        // Create Discord attachment
        const attachment = new AttachmentBuilder(buffer, { name: filename });

        // Send the image
        await interaction.user.send({
            content: `🎮 **Minecraft Account Stats for ${acc.newName}**`,
            files: [attachment]
        });

        console.log(`[IMAGE_HANDLER] Successfully sent image for ${acc.newName}`);

        // Clean up temp file
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

    } catch (error) {
        console.error('[IMAGE_HANDLER] Error generating/sending image:', error);
    }
}

async function getSkinAttachment(username, hideUsername = false) {
    try {
        console.log(`[IMAGE_HANDLER] Generating skin attachment for ${hideUsername ? 'HIDDEN' : username}`);
        const randomId = crypto.randomBytes(8).toString('hex');
        const filename = `${randomId}.png`;
        const tempPath = path.join(__dirname, '../temp/skins', filename);

        // Create temp directory if it doesn't exist
        const tempDir = path.dirname(tempPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Download the image with fallbacks
        const urls = [
            `https://visage.surgeplay.com/bust/${encodeURIComponent(username)}.png?y=-40&quality=lossless`,
            `https://minotar.net/bust/${encodeURIComponent(username)}/100.png`,
            `https://visage.surgeplay.com/bust/X-Steve.png?y=-40&quality=lossless`
        ];

        let downloaded = false;
        for (const url of urls) {
            downloaded = await new Promise((resolve) => {
                const req = https.get(url, { timeout: 4000 }, (response) => {
                    if (response.statusCode !== 200) {
                        response.resume();
                        resolve(false);
                        return;
                    }

                    const fileStream = fs.createWriteStream(tempPath);
                    response.pipe(fileStream);

                    fileStream.on('finish', () => {
                        fileStream.close();
                        resolve(true);
                    });

                    fileStream.on('error', () => resolve(false));
                });
                req.on('error', () => resolve(false));
                req.on('timeout', () => { req.destroy(); resolve(false); });
            });

            if (downloaded) break;
        }

        if (!downloaded) {
            return null;
        }

        // Create attachment
        const attachment = new AttachmentBuilder(tempPath);
        console.log(`[IMAGE_HANDLER] Successfully created skin attachment with ID: ${randomId}`);

        // Clean up the file after 1 minute
        setTimeout(() => {
            fs.unlink(tempPath, (err) => {
                if (err) {
                    console.error('[IMAGE_HANDLER] Error deleting temp skin file:', err);
                } else {
                    console.log(`[IMAGE_HANDLER] Cleaned up temp skin file: ${randomId}`);
                }
            });
        }, 60000);

        return attachment;
    } catch (error) {
        console.error('Error handling skin image:', error);
        return null;
    }
}

module.exports = { generateAndSendImage, getSkinAttachment };
