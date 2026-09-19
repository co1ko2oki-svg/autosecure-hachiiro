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
    const width = 900;
    const height = 550;
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
    const boxX = 40;
    const boxY = 40;
    const boxW = width - 80;
    const boxH = height - 80;

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "middle";

    // --- HEADER SECTION ---
    // Badge LIVE STATUS
    ctx.fillStyle = "rgba(46, 204, 113, 0.2)";
    drawRoundedRect(ctx, boxX + 30, boxY + 25, 120, 24, 12);
    ctx.fill();
    ctx.fillStyle = "#2ecc71"; // Xanh ngọc
    ctx.beginPath();
    ctx.arc(boxX + 42, boxY + 37, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = "12px Minecraftia, sans-serif";
    ctx.fillStyle = "#2ecc71";
    ctx.textAlign = "left";
    ctx.fillText("LIVE STATUS", boxX + 54, boxY + 37);

    // Top Right Date
    ctx.font = "12px Minecraftia, sans-serif";
    ctx.fillStyle = "#A3A3A3";
    ctx.textAlign = "right";
    ctx.fillText(data.currentDate || new Date().toLocaleString(), boxX + boxW - 30, boxY + 37);

    // Title
    ctx.font = "28px Minecraftia, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText("Autosecure Command Center", boxX + 30, boxY + 80);

    // Subtitle
    ctx.font = "14px Minecraftia, sans-serif";
    ctx.fillStyle = "#A3A3A3";
    ctx.fillText("Realtime controller snapshot - refreshed every 60 seconds", boxX + 30, boxY + 110);

    // --- 4 STAT BOXES ---
    const boxStartY = boxY + 140;
    const statBoxW = (boxW - 90) / 2;
    const statBoxH = 80;

    const drawStatBox = (x, y, label, value, color) => {
        // Box background
        ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
        drawRoundedRect(ctx, x, y, statBoxW, statBoxH, 8);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();

        // Left accent bar
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 16);
        ctx.lineTo(x + 4, y + statBoxH - 16);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.closePath();

        // Label
        ctx.font = "12px Minecraftia";
        ctx.fillStyle = "#A3A3A3";
        ctx.textAlign = "left";
        ctx.fillText(label.toUpperCase(), x + 20, y + 25);

        // Value
        let fontSize = 26;
        ctx.font = `${fontSize}px Minecraftia`;
        while (ctx.measureText(value).width > statBoxW - 40 && fontSize > 10) {
            fontSize -= 1;
            ctx.font = `${fontSize}px Minecraftia`;
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(value, x + 20, y + 55);
    };

    // Box 1: Accounts Secured (Blue)
    drawStatBox(boxX + 30, boxStartY, "Accounts Secured", data.accountsSecured || "0", "#3b82f6");
    
    // Box 2: Total Users (Green)
    drawStatBox(boxX + 60 + statBoxW, boxStartY, "Total Users", data.totalUsers || "0", "#10b981");

    // Box 3: Launch Date (Yellow)
    drawStatBox(boxX + 30, boxStartY + statBoxH + 20, "Launch Date", data.launchDate || "Jul 01, 2026", "#f59e0b");

    // Box 4: Current Date (Pink)
    drawStatBox(boxX + 60 + statBoxW, boxStartY + statBoxH + 20, "Current Date", data.currentDate || "Unknown", "#ec4899");


    // --- RUNTIME DETAILS SECTION ---
    const bottomY = boxStartY + (statBoxH * 2) + 60;
    
    // Divider
    ctx.beginPath();
    ctx.moveTo(boxX + 30, bottomY);
    ctx.lineTo(boxX + boxW - 30, bottomY);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Headers
    ctx.font = "14px Minecraftia, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText("Runtime Details", boxX + 30, bottomY + 25);

    ctx.font = "12px Minecraftia, sans-serif";
    ctx.fillStyle = "#A3A3A3";
    ctx.textAlign = "right";
    ctx.fillText("live process, memory and latency", boxX + boxW - 30, bottomY + 25);

    // Grid details
    const textYStart = bottomY + 55;
    const lineSpacing = 25;
    
    ctx.textAlign = "left";
    const drawDetail = (label, value, x, y) => {
        ctx.font = "12px Minecraftia, sans-serif";
        ctx.fillStyle = "#A3A3A3";
        ctx.fillText(label, x, y);
        
        ctx.font = "12px Minecraftia, sans-serif";
        ctx.fillStyle = "#FFFFFF";
        // Fixed offset for alignment
        ctx.fillText(value, x + 150, y);
    };

    // Col 1
    drawDetail("Running Processes :", data.processes || "0", boxX + 30, textYStart);
    drawDetail("CPU Usage         :", data.cpu || "0.0%", boxX + 30, textYStart + lineSpacing);
    drawDetail("RAM Usage         :", data.ram || "0 MB", boxX + 30, textYStart + (lineSpacing * 2));

    // Col 2
    drawDetail("Heap Usage        :", data.heap || "0 MB / 0 MB", boxX + 60 + statBoxW, textYStart);
    drawDetail("Ping              :", data.ping || "0 ms", boxX + 60 + statBoxW, textYStart + lineSpacing);
    drawDetail("Bot Uptime        :", data.uptime || "0s", boxX + 60 + statBoxW, textYStart + (lineSpacing * 2));

    return canvas.toBuffer("image/png");
}

module.exports = { generateStatsImage };
