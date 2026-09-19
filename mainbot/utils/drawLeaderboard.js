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

async function generateLeaderboardImage(title, data, client) {
    const width = 800;
    const height = 460;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- BACKGROUND ---
    const bgPath = path.join(__dirname, '..', '..', 'autosecure', 'utils', 'assets', 'images', 'backgrounds', 'lead.png');
    if (fs.existsSync(bgPath)) {
        try {
            const bgImg = await loadImage(bgPath);
            // Cover
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

    // Set text baseline to middle cho de can chuan y
    ctx.textBaseline = "middle";

    // --- TITLE HEADER ---
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "22px Minecraftia";
    ctx.textAlign = "center";
    ctx.fillText(`___ ${title} ___`, width / 2, boxY + 35);

    // --- COLUMNS ---
    ctx.font = "16px Minecraftia";
    ctx.fillStyle = "#DDDDDD";

    const rankX = 80;
    const userX = 160;
    const accX = 480;
    const netX = 640;

    const headerY = boxY + 85;
    
    ctx.textAlign = "left";
    ctx.fillText("Rank", rankX, headerY);
    ctx.fillText("Player", userX, headerY);
    
    // Can giua 2 cot gia tri
    ctx.textAlign = "center";
    ctx.fillText("Accounts", accX, headerY);
    ctx.fillText("Networth", netX, headerY);

    // --- ROWS ---
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

        // Kich thuoc Avatar
        const avatarSize = 18;
        
        if (avatarImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(userX + (avatarSize/2), currentY, avatarSize/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImg, userX, currentY - (avatarSize/2), avatarSize, avatarSize);
            ctx.restore();
        } else {
            ctx.fillStyle = "#555555";
            ctx.beginPath();
            ctx.arc(userX + (avatarSize/2), currentY, avatarSize/2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.fillStyle = "#FFFFFF";
        // Can Ten cach Avatar 10px
        ctx.fillText(username, userX + avatarSize + 10, currentY);

        // Values
        ctx.textAlign = "center";
        ctx.fillText(row.amount ? row.amount.toString() : "0", accX, currentY);
        ctx.fillText(row.networthStr || "0", netX, currentY);
    }

    return canvas.toBuffer("image/png");
}

module.exports = { generateLeaderboardImage };
