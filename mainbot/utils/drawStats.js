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

async function generateStatsImage(data) {
    const width = 1600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- BACKGROUND ---
    const bgPath = path.join(__dirname, '..', '..', 'autosecure', 'utils', 'assets', 'images', 'backgrounds', 'stast.png');
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
            
            // Lớp phủ đen để nổi bật nội dung
            ctx.fillStyle = "rgba(10, 15, 20, 0.75)"; 
            ctx.fillRect(0, 0, width, height);
        } catch(e) {
            ctx.fillStyle = "#0a0f14";
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        ctx.fillStyle = "#0a0f14";
        ctx.fillRect(0, 0, width, height);
    }

    // --- MAIN PANEL ---
    const boxX = 50;
    const boxY = 50;
    const boxW = width - 100;
    const boxH = height - 100;

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 16);
    ctx.fill();
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "middle";

    // --- HEADER SECTION ---
    ctx.fillStyle = "rgba(46, 204, 113, 0.2)";
    drawRoundedRect(ctx, boxX + 40, boxY + 30, 160, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#2ecc71";
    ctx.beginPath();
    ctx.arc(boxX + 56, boxY + 45, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = "16px Minecraftia";
    ctx.fillStyle = "#2ecc71";
    ctx.textAlign = "left";
    ctx.fillText("LIVE STATUS", boxX + 70, boxY + 45);

    // Top Right Date
    ctx.font = "16px Minecraftia";
    ctx.fillStyle = "#A3A3A3";
    ctx.textAlign = "right";
    ctx.fillText(data.currentDate || new Date().toLocaleString(), boxX + boxW - 40, boxY + 45);

    // Title
    ctx.font = "36px Minecraftia";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText("Autosecure Command Center", boxX + 40, boxY + 100);

    // Subtitle
    ctx.font = "18px Minecraftia";
    ctx.fillStyle = "#A3A3A3";
    ctx.fillText("Realtime controller snapshot - refreshed every 60 seconds", boxX + 40, boxY + 140);

    // --- 4 STAT BOXES ---
    const boxStartY = boxY + 175;
    const statBoxW = (boxW - 120) / 2;
    const statBoxH = 100;

    const drawStatBox = (x, y, label, value, color) => {
        ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
        drawRoundedRect(ctx, x, y, statBoxW, statBoxH, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 20);
        ctx.lineTo(x + 5, y + statBoxH - 20);
        ctx.lineWidth = 4;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.closePath();

        ctx.font = "16px Minecraftia";
        ctx.fillStyle = "#A3A3A3";
        ctx.textAlign = "left";
        ctx.fillText(label.toUpperCase(), x + 25, y + 32);

        let fontSize = 34;
        ctx.font = `${fontSize}px Minecraftia`;
        while (ctx.measureText(value).width > statBoxW - 50 && fontSize > 12) {
            fontSize -= 1;
            ctx.font = `${fontSize}px Minecraftia`;
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(value, x + 25, y + 70);
    };

    drawStatBox(boxX + 40, boxStartY, "Accounts Secured", data.accountsSecured || "0", "#3b82f6");
    drawStatBox(boxX + 80 + statBoxW, boxStartY, "Total Users", data.totalUsers || "0", "#10b981");
    drawStatBox(boxX + 40, boxStartY + statBoxH + 25, "Launch Date", data.launchDate || "Jul 01, 2026", "#f59e0b");
    drawStatBox(boxX + 80 + statBoxW, boxStartY + statBoxH + 25, "Current Date", data.currentDate || "Unknown", "#ec4899");

    // --- RUNTIME DETAILS SECTION ---
    const bottomY = boxStartY + (statBoxH * 2) + 75;
    
    ctx.beginPath();
    ctx.moveTo(boxX + 40, bottomY);
    ctx.lineTo(boxX + boxW - 40, bottomY);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "18px Minecraftia";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText("Runtime Details", boxX + 40, bottomY + 30);

    ctx.font = "14px Minecraftia";
    ctx.fillStyle = "#A3A3A3";
    ctx.textAlign = "right";
    ctx.fillText("live process, memory and latency", boxX + boxW - 40, bottomY + 30);

    const textYStart = bottomY + 65;
    const lineSpacing = 30;
    
    ctx.textAlign = "left";
    const drawDetail = (label, value, x, y) => {
        ctx.font = "14px Minecraftia";
        ctx.fillStyle = "#A3A3A3";
        ctx.fillText(label, x, y);
        
        ctx.font = "14px Minecraftia";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(value, x + 190, y);
    };

    drawDetail("Running Processes :", data.processes || "0", boxX + 40, textYStart);
    drawDetail("CPU Usage         :", data.cpu || "0.0%", boxX + 40, textYStart + lineSpacing);
    drawDetail("RAM Usage         :", data.ram || "0 MB", boxX + 40, textYStart + (lineSpacing * 2));

    drawDetail("Heap Usage        :", data.heap || "0 MB / 0 MB", boxX + 80 + statBoxW, textYStart);
    drawDetail("Ping              :", data.ping || "0 ms", boxX + 80 + statBoxW, textYStart + lineSpacing);
    drawDetail("Bot Uptime        :", data.uptime || "0s", boxX + 80 + statBoxW, textYStart + (lineSpacing * 2));

    return canvas.toBuffer("image/png");
}

module.exports = { generateStatsImage };
