const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Register fonts if available
const fontDir = path.join(__dirname, 'assets', 'fonts');
const mcFont = path.join(fontDir, 'Minecraftia.ttf');
if (fs.existsSync(mcFont)) {
  try {
    registerFont(mcFont, { family: 'Minecraftia' });
  } catch (e) {
    console.error("Font load error:", e);
  }
} else {
    // try fallback
    const mcFont2 = path.join(fontDir, 'Minecraft.ttf');
    if (fs.existsSync(mcFont2)) {
        try {
            registerFont(mcFont2, { family: 'Minecraftia' });
        } catch (e) {}
    }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function getLocalBackground(username) {
    const bgDir = path.join(__dirname, 'assets', 'images', 'backgrounds');
    if (fs.existsSync(bgDir)) {
        const files = fs.readdirSync(bgDir).filter(f => f.match(/\.(png|jpg|jpeg|webp)$/i));
        if (files.length > 0) {
            let hash = 0;
            const str = username || 'default';
            for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i) | 0;
            const idx = Math.abs(hash) % files.length;
            return path.join(bgDir, files[idx]);
        }
    }
    return null;
}

async function makeCard(stats, outputPath = "output.png") {
  if (!stats) return null;
  
  const width = 1000;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  // Background
  drawRoundedRect(ctx, 0, 0, width, height, 15);
  ctx.clip(); 

  const username = stats.username || "Steve";
  let bgPath = getLocalBackground(username);
  // --- BACKGROUND ---
  bgPath = path.join(__dirname, 'assets', 'images', 'backgrounds', 'hit.png');
  
  if (fs.existsSync(bgPath)) {
      try {
          const bgImg = await loadImage(bgPath);
          // Fill background
          ctx.drawImage(bgImg, 0, 0, width, height);
          
          // Add a dark overlay to make text readable (tối màu nền)
          ctx.fillStyle = "rgba(10, 10, 15, 0.75)";
          ctx.fillRect(0, 0, width, height);
      } catch (e) {
          ctx.fillStyle = "#0a0a0f";
          ctx.fillRect(0, 0, width, height);
      }
  } else {
      ctx.fillStyle = "#0a0a0f"; // Đen xám nếu không có ảnh
      ctx.fillRect(0, 0, width, height);
  }
  
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.stroke();
  
  // Mask username (VD: "Sarge_Iaw" -> "Sa*******")
  const obscureName = username.length > 3 
      ? username.substring(0, 2) + "*".repeat(username.length - 2) 
      : (username && username.length > 1 ? username[0] + "*".repeat(username.length - 1) : "******");

  // Title
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "32px Minecraftia, sans-serif";
  
  // Format tên đã ẩn danh (VD: [MVP+] Sa*******)
  let displayName = obscureName;
  if (stats.rank && stats.rank !== 'NONE') {
      displayName = `[${stats.rank}] ${obscureName}`;
  }
  ctx.fillText(displayName, 30, 55);
  
  // Subtitle
  ctx.fillStyle = "#888888";
  ctx.font = "14px sans-serif";
  ctx.fillText("hypixel - skyblock - bedwars - duels", 32, 85);
  
  // Columns setup
  const col1X = 30;
  const col2X = 350;
  const boxWidth = 300;
  const boxHeight = 50;
  const startY = 110;
  const spacingY = 58; 
  
  const rows = [
    [
      { label: "NETWORK LVL", value: stats.networkLevel || "0" },
      { label: "NETWORTH", value: stats.networth || "0" }
    ],
    [
      { label: "SKYBLOCK LVL", value: stats.sbLevel || "0" },
      { label: "BEDWARS", value: stats.bedwars || "0" }
    ],
    [
      { label: "SKYWARS LVL", value: stats.skywarsLevel || "0" },
      { label: "DUELS KDR", value: stats.duelKDR || "0" }
    ],
    [
      { label: "WINSTREAK", value: stats.duelWinstreak || "0" },
      { label: "GIFTED", value: stats.gifted || "0" }
    ],
    [
      { label: "PLUS COLOUR", value: stats.plusColour || "None" },
      { label: "RANK", value: stats.rank || "NONE" }
    ]
  ];
  
  rows.forEach((row, rowIndex) => {
    const currentY = startY + (rowIndex * spacingY);
    // Draw Col 1 box
    drawStatBox(ctx, col1X, currentY, boxWidth, boxHeight, row[0].label, row[0].value);
    // Draw Col 2 box
    drawStatBox(ctx, col2X, currentY, boxWidth, boxHeight, row[1].label, row[1].value);
  });
  
  // Capes Section
  const capesY = startY + (5 * spacingY); 
  const capesWidth = 620; 
  const capesHeight = 85;
  
  const capesList = stats.capes || [];
  
  await drawCapesBox(ctx, col1X, capesY, capesWidth, capesHeight, capesList);
  
  // Right side 3D Render
  await drawSkin(ctx, username, 690, 40, 270, 420);
  
  // Bottom Right Watermark
  ctx.fillStyle = "#888888";
  ctx.font = "14px Minecraftia, sans-serif";
  ctx.textAlign = "right";
  
  ctx.fillText(`[${stats.rank || 'NONE'}] ${obscureName} SECURED`, 970, 480);
  
  // Reset text align for safety
  ctx.textAlign = "left";
  
  // Save or Return buffer
  const buffer = canvas.toBuffer("image/png");
  if (outputPath) {
    fs.writeFileSync(outputPath, buffer);
  }
  return buffer;
}

function drawStatBox(ctx, x, y, width, height, label, value) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  drawRoundedRect(ctx, x, y, width, height, 8);
  ctx.fill();
  
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.fillStyle = "#888888";
  ctx.font = "11px Minecraftia, sans-serif";
  ctx.fillText(label, x + 15, y + 20);
  
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "20px Minecraftia, sans-serif";
  let valStr = String(value);
  if (valStr.length > 20) valStr = valStr.substring(0, 18) + "...";
  ctx.fillText(valStr, x + 15, y + 43);
}

async function drawCapesBox(ctx, x, y, width, height, capesList) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  drawRoundedRect(ctx, x, y, width, height, 8);
  ctx.fill();
  
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.fillStyle = "#888888";
  ctx.font = "11px Minecraftia, sans-serif";
  ctx.fillText(`CAPES (${capesList.length})`, x + 15, y + 20);
  
  const slotCount = 8;
  const slotWidth = 34; // Hình chữ nhật đứng (tỷ lệ chuẩn cape 10x16)
  const slotHeight = 54;
  const slotSpacing = 20;
  const startX = x + 15;
  const startY = y + 24;
  
  // Hàm chuẩn hoá tên: bỏ hết dấu cách, gạch nối và viết thường
  const normalizeName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  for (let i = 0; i < slotCount; i++) {
    const currentX = startX + (i * (slotWidth + slotSpacing));
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    drawRoundedRect(ctx, currentX, startY, slotWidth, slotHeight, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.stroke();
    
    if (i < capesList.length) {
      try {
        const rawName = capesList[i];
        const capeName = normalizeName(rawName);
        let capeFile = null;
        
        const fs = require('fs');
        const capesDir = path.join(__dirname, 'assets', 'images', 'capes');
        
        if (fs.existsSync(capesDir)) {
             const allFiles = fs.readdirSync(capesDir);
             
             // 1. Tìm file match chính xác sau khi chuẩn hoá
             let found = allFiles.find(f => {
                 const fNorm = normalizeName(f.replace('.png', ''));
                 return fNorm === capeName || capeName.includes(fNorm) || fNorm.includes(capeName);
             });
             
             // 2. Fallback tìm file mặc định nếu không khớp
             if (!found) {
                 if (capeName.includes("optifine")) found = allFiles.find(f => normalizeName(f).includes("optifine"));
                 if (!found && capeName.includes("migrator")) found = allFiles.find(f => normalizeName(f).includes("migrator"));
                 if (!found) found = allFiles.find(f => normalizeName(f).includes("vanilla")); 
             }
             
             if (found) capeFile = found;
        }
        
        if (capeFile) {
            const localPath = path.join(__dirname, 'assets', 'images', 'capes', capeFile);
            if (fs.existsSync(localPath)) {
                const img = await loadImage(localPath);
                ctx.drawImage(img, currentX + 2, startY + 2, slotWidth - 4, slotHeight - 4);
            }
        }
      } catch(e) {}
    }
  }
}

async function drawSkin(ctx, username, x, y, width, height) {
    try {
        const url = `https://visage.surgeplay.com/full/512/${encodeURIComponent(username)}.png`;
        const response = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const img = await loadImage(Buffer.from(response.data));
        
        const ratio = img.width / img.height;
        const targetW = height * ratio;
        const targetX = x + (width - targetW) / 2;
        
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 15;
        
        ctx.drawImage(img, targetX, y, targetW, height);
        
        ctx.shadowBlur = 0; 
    } catch(e) {
        console.error("Failed to load skin image", e);
    }
}

module.exports = {
  makeCard
};
