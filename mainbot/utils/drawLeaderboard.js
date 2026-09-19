const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

const fontDir = path.join(__dirname, '..', '..', 'autosecure', 'utils', 'assets', 'fonts');
let fontLoaded = false;
try {
    const mcFont = path.join(fontDir, 'Minecraftia.ttf');
    if (fs.existsSync(mcFont)) {
        registerFont(mcFont, { family: 'Minecraftia' });
        fontLoaded = true;
    } else {
        const mcFont2 = path.join(fontDir, 'Minecraft.ttf');
        if (fs.existsSync(mcFont2)) {
            registerFont(mcFont2, { family: 'Minecraftia' });
            fontLoaded = true;
        }
    }
} catch(e) {
    console.error("Failed to load Minecraft font", e);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

async function generateLeaderboardImage(data, client) {
    const width = 800;
    const height = 460;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- BACKGROUND ---
    const bgPath = path.join(__dirname, '..', '..', 'autosecure', 'utils', 'assets', 'images', 'backgrounds', 'lead.png');
    if (fs.existsSync(bgPath)) {
        try {
            const bgImg = await loadImage(bgPath);
            const imgRatio = bgImg.width / bgImg.height;
            const canvasRatio = width / height;
            let drawW = width, drawH = height, drawX = 0, drawY = 0;
            if (imgRatio > canvasRatio) {
                drawW = height * imgRatio;
                drawX = (width - drawW) / 2;
            } else {
                drawH = width / imgRatio;
                drawY = (height - drawH) / 2;
            }
            ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);
            ctx.fillStyle = "rgba(15, 10, 5, 0.75)"; 
            ctx.fillRect(0, 0, width, height);
        } catch(e) {
            ctx.fillStyle = "#1e1a14";
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        ctx.fillStyle = "#1e1a14";
        ctx.fillRect(0, 0, width, height);
    }

    // --- MAIN PANEL ---
    ctx.textBaseline = "middle";

    const boxX = 40;
    const boxY = 40;
    const boxW = width - 80;
    const boxH = height - 80;

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 15);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "22px Minecraftia";
    ctx.textAlign = "center";
    ctx.fillText(`___ Accounts Leaderboard ___`, boxX + (boxW / 2), boxY + 35);

    ctx.font = "16px Minecraftia";
    ctx.fillStyle = "#DDDDDD";

    const rankX = boxX + 40;
    const userX = boxX + 120;
    const accX = boxX + boxW - 220;
    const netX = boxX + boxW - 80;

    const headerY = boxY + 85;
    
    ctx.textAlign = "left";
    ctx.fillText("Rank", rankX, headerY);
    ctx.fillText("Player", userX, headerY);
    
    ctx.textAlign = "center";
    ctx.fillText("Accounts", accX, headerY);
    ctx.fillText("Networth", netX, headerY);

    const startY = headerY + 40;
    const spacingY = 26;
    ctx.font = "14px Minecraftia";

    for (let i = 0; i < 10; i++) {
        if (!data[i]) break;
        const row = data[i];
        const currentY = startY + (i * spacingY);

        ctx.textAlign = "left";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(`${i + 1}.`, rankX, currentY);

        let username = "Anonymous User";
        let avatarImg = null;

        if (!row.hidden && client) {
            try {
                let user = client.users.cache.get(row.user_id);
                if (!user) {
                    user = await client.users.fetch(row.user_id).catch(() => null);
                }
                if (user) {
                    username = user.username;
                    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 64 });
                    avatarImg = await loadImage(avatarUrl);
                }
            } catch(e) {}
        }

        const avatarSize = 18;
        if (avatarImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(userX + (avatarSize/2), currentY, avatarSize/2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatarImg, userX, currentY - (avatarSize/2), avatarSize, avatarSize);
            ctx.restore();
        }

        let textX = avatarImg ? (userX + avatarSize + 10) : userX;
        ctx.fillText(username, textX, currentY);

        ctx.textAlign = "center";
        ctx.fillStyle = "#55FF55";
        ctx.fillText(row.amount.toString(), accX, currentY);

        ctx.fillStyle = "#FFAA00";
        ctx.fillText(row.networthStr, netX, currentY);
    }

    return canvas.toBuffer("image/png");
}

module.exports = { generateLeaderboardImage };
