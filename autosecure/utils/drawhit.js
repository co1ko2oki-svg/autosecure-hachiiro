const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

// Register fonts if available
const fontDir = path.join(__dirname, 'assets', 'fonts');
const mcFont = path.join(fontDir, 'minecraftia.ttf');
if (fs.existsSync(mcFont)) {
  try {
    registerFont(mcFont, { family: 'Minecraftia' });
  } catch (e) {}
}

const DESIGN = {
  width: 1280,
  height: 680,
  radius: {
    card: 18,
    pill: 999,
    badge: 8
  },
  colors: {
    bgDark: '#06080E',
    panelBg: 'rgba(13, 18, 32, 0.82)',
    panelBgHover: 'rgba(18, 26, 46, 0.92)',
    borderTop: 'rgba(255, 255, 255, 0.22)',
    borderBottom: 'rgba(255, 255, 255, 0.04)',
    textPrimary: '#FFFFFF',
    textSecondary: '#E2E8F0',
    textMuted: '#94A3B8',
    textDim: '#64748B',
    accentGold: '#FBBF24',
    accentGoldDeep: '#D97706',
    accentGreen: '#10B981',
    accentEmerald: '#34D399',
    accentBlue: '#38BDF8',
    accentSky: '#0284C7',
    accentPurple: '#C084FC',
    accentViolet: '#8B5CF6',
    accentRed: '#F87171',
    accentRose: '#FB7185'
  },
  fonts: {
    family: '"Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Display", Arial, sans-serif',
    mcFamily: '"Minecraftia", "Segoe UI", sans-serif'
  }
};

const RANK_CONFIG = {
  'OWNER': { tag: 'OWNER', bracket: '#FF5555', body: '#FF5555', plus: '#FF5555', aura: 'rgba(255, 85, 85, 0.5)' },
  'ADMIN': { tag: 'ADMIN', bracket: '#FF5555', body: '#FF5555', plus: '#FF5555', aura: 'rgba(255, 85, 85, 0.5)' },
  'GM': { tag: 'GM', bracket: '#00AA00', body: '#00AA00', plus: '#00AA00', aura: 'rgba(0, 170, 0, 0.45)' },
  'MOD': { tag: 'MOD', bracket: '#00AA00', body: '#00AA00', plus: '#00AA00', aura: 'rgba(0, 170, 0, 0.45)' },
  'HELPER': { tag: 'HELPER', bracket: '#5555FF', body: '#5555FF', plus: '#5555FF', aura: 'rgba(85, 85, 255, 0.45)' },
  'YOUTUBE': { tag: 'YOUTUBE', bracket: '#FF5555', body: '#FFFFFF', plus: '#FF5555', aura: 'rgba(255, 85, 85, 0.5)' },
  'PIG+++': { tag: 'PIG+++', bracket: '#FF69B4', body: '#FFB6C1', plus: '#55FFFF', aura: 'rgba(255, 105, 180, 0.5)' },
  'MVP++': { tag: 'MVP++', bracket: '#FFAA00', body: '#00FFFF', plus: '#FF5555', aura: 'rgba(255, 170, 0, 0.5)' },
  'MVP+': { tag: 'MVP+', bracket: '#00FFFF', body: '#00FFFF', plus: '#FF5555', aura: 'rgba(0, 255, 255, 0.5)' },
  'MVP': { tag: 'MVP', bracket: '#00FFFF', body: '#00FFFF', plus: '', aura: 'rgba(0, 255, 255, 0.4)' },
  'VIP+': { tag: 'VIP+', bracket: '#55FF55', body: '#55FF55', plus: '#FFAA00', aura: 'rgba(85, 255, 85, 0.45)' },
  'VIP': { tag: 'VIP', bracket: '#55FF55', body: '#55FF55', plus: '', aura: 'rgba(85, 255, 85, 0.4)' },
  'NONE': { tag: 'DEFAULT', bracket: '#94A3B8', body: '#94A3B8', plus: '', aura: 'rgba(148, 163, 184, 0.25)' },
};

// ===========================================================================
// GEOMETRIC & DRAWING HELPERS
// ===========================================================================

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

/**
 * Premium Glassmorphic Panel with dual-stop gradient and specular top highlight
 */
function drawGlassPanel(ctx, x, y, width, height, radius = DESIGN.radius.card, options = {}) {
  const {
    bgGradient = null,
    borderColor = null,
    glowColor = null,
    glowBlur = 0,
    fillAlpha = 0.85
  } = options;

  ctx.save();

  // Glow shadow if specified
  if (glowColor && glowBlur > 0) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
  }

  // Background gradient fill
  if (bgGradient) {
    ctx.fillStyle = bgGradient;
  } else {
    const bg = ctx.createLinearGradient(x, y, x, y + height);
    bg.addColorStop(0, `rgba(15, 22, 38, ${fillAlpha})`);
    bg.addColorStop(1, `rgba(8, 12, 22, ${Math.min(1, fillAlpha + 0.1)})`);
    ctx.fillStyle = bg;
  }

  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  // Reset shadow for crisp border
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Multi-tier specular border
  if (borderColor) {
    ctx.strokeStyle = borderColor;
  } else {
    const borderGrad = ctx.createLinearGradient(x, y, x, y + height);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    borderGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.07)');
    borderGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.02)');
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
    ctx.strokeStyle = borderGrad;
  }

  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();

  ctx.restore();
}

function fitText(ctx, text, maxWidth, initialSize = 16, minSize = 10, weight = 'bold', family = DESIGN.fonts.family) {
  let str = String(text ?? '');
  let size = initialSize;
  ctx.font = `${weight} ${size}px ${family}`;

  while (ctx.measureText(str).width > maxWidth && size > minSize) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }

  if (ctx.measureText(str).width > maxWidth) {
    while (str.length > 3 && ctx.measureText(str + '...').width > maxWidth) {
      str = str.slice(0, -1);
    }
    str = str + '...';
  }

  return { fontSize: size, text: str, font: `${weight} ${size}px ${family}` };
}

function fitFontSize(ctx, text, maxWidth, initialSize, minSize, weight, family) {
  return fitText(ctx, text, maxWidth, initialSize, minSize, weight, family).fontSize;
}

function cleanCurrency(val) {
  if (!val && val !== 0) return '$0';
  const str = String(val).trim();
  if (!str) return '$0';
  if (str.toLowerCase() === 'unknown') return 'Unknown';
  const clean = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return str;
  return `$${Math.floor(num).toLocaleString('en-US')}`;
}

function formatCompactNumber(val) {
  if (!val && val !== 0) return '$0';
  const str = String(val).trim();
  if (str.toLowerCase() === 'unknown') return 'Unknown';
  const clean = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return str;

  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${Math.floor(num).toLocaleString('en-US')}`;
}

function obscureUsername(username) {
  if (!username) return 'Unknown';
  if (username.length <= 3) return username;
  const first = username.slice(0, 2);
  const last = username.slice(-2);
  return `${first}${'*'.repeat(Math.max(4, username.length - 4))}${last}`;
}

// ===========================================================================
// VECTOR ICONS (Drawn natively on Canvas)
// ===========================================================================

function drawIconShield(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const w = size;
  const h = size * 1.15;
  const top = cy - h / 2;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const bottom = cy + h / 2;

  ctx.moveTo(cx, top);
  ctx.lineTo(right, top + h * 0.2);
  ctx.lineTo(right, cy + h * 0.1);
  ctx.quadraticCurveTo(right, bottom - h * 0.1, cx, bottom);
  ctx.quadraticCurveTo(left, bottom - h * 0.1, left, cy + h * 0.1);
  ctx.lineTo(left, top + h * 0.2);
  ctx.closePath();
  ctx.fill();

  // Inner subtle checkmark
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = size * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.22, cy);
  ctx.lineTo(cx - size * 0.05, cy + size * 0.18);
  ctx.lineTo(cx + size * 0.25, cy - size * 0.16);
  ctx.stroke();

  ctx.restore();
}

function drawIconCoin(ctx, cx, cy, radius, primaryColor = '#FBBF24') {
  ctx.save();
  const r = radius;

  // Outer glowing coin
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, '#FEF08A');
  grad.addColorStop(0.5, primaryColor);
  grad.addColorStop(1, '#B45309');
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner rim
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.76, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = r * 0.15;
  ctx.stroke();

  // Center Dollar sign
  ctx.font = `900 ${Math.round(r * 1.1)}px ${DESIGN.fonts.family}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', cx, cy + 1);

  ctx.restore();
}

function drawIconStar(ctx, cx, cy, r, color = '#FBBF24') {
  ctx.save();
  ctx.beginPath();
  const spikes = 5;
  const innerR = r * 0.45;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.moveTo(cx, cy - r);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - r);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawIconCrystal(ctx, cx, cy, size, color = '#C084FC') {
  ctx.save();
  const w = size * 0.8;
  const h = size * 1.1;

  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy - h * 0.1);
  ctx.lineTo(cx + w * 0.3, cy + h / 2);
  ctx.lineTo(cx - w * 0.3, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy - h * 0.1);
  ctx.closePath();

  const grad = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
  grad.addColorStop(0, '#E879F9');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, '#7E22CE');
  ctx.fillStyle = grad;
  ctx.fill();

  // Facet highlight
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx, cy + h / 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawIconSwords(ctx, cx, cy, size, color = '#38BDF8') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.15;
  ctx.lineCap = 'round';

  const len = size * 0.6;
  // Blade 1
  ctx.beginPath();
  ctx.moveTo(cx - len, cy - len);
  ctx.lineTo(cx + len, cy + len);
  ctx.stroke();

  // Crossguard 1
  ctx.beginPath();
  ctx.moveTo(cx - len * 0.4, cy - len * 0.1);
  ctx.lineTo(cx - len * 0.1, cy - len * 0.4);
  ctx.stroke();

  // Blade 2
  ctx.beginPath();
  ctx.moveTo(cx + len, cy - len);
  ctx.lineTo(cx - len, cy + len);
  ctx.stroke();

  // Crossguard 2
  ctx.beginPath();
  ctx.moveTo(cx + len * 0.4, cy - len * 0.1);
  ctx.lineTo(cx + len * 0.1, cy - len * 0.4);
  ctx.stroke();

  ctx.restore();
}

function drawIconDonut(ctx, cx, cy, size, color = '#F472B6') {
  ctx.save();
  const r = size * 0.55;
  const holeR = r * 0.38;

  // Donut base
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#F59E0B';
  ctx.fill();

  // Frosting top
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Hole cut
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.fillStyle = DESIGN.colors.bgDark;
  ctx.fill();

  // Sprinkles
  const sprinkles = [
    { x: cx - r * 0.5, y: cy - r * 0.2, c: '#38BDF8' },
    { x: cx + r * 0.45, y: cy - r * 0.35, c: '#34D399' },
    { x: cx + r * 0.35, y: cy + r * 0.4, c: '#FEF08A' },
    { x: cx - r * 0.25, y: cy + r * 0.5, c: '#F87171' }
  ];
  for (const s of sprinkles) {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ===========================================================================
// BACKGROUND & AMBIENT ATMOSPHERE
// ===========================================================================

function drawImageCover(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let drawWidth, drawHeight, offsetX, offsetY;
  if (imageRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
    offsetX = x + (width - drawWidth) / 2;
    offsetY = y;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
    offsetX = x;
    offsetY = y + (height - drawHeight) / 2;
  }
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

async function drawAtmosphericBackground(ctx, selectedBg, stats, width, height) {
  // 1. Deep midnight gradient base
  const bgBase = ctx.createLinearGradient(0, 0, width, height);
  bgBase.addColorStop(0, '#06080E');
  bgBase.addColorStop(0.5, '#090D18');
  bgBase.addColorStop(1, '#040508');
  ctx.fillStyle = bgBase;
  ctx.fillRect(0, 0, width, height);

  // 2. Load and overlay background image if available
  let bgImg = null;
  if (selectedBg && selectedBg.path) {
    try { bgImg = await loadImage(selectedBg.path); } catch (err) {}
  }
  if (!bgImg) {
    const fallbackTemplate = path.join(__dirname, 'assets', 'template.png');
    if (fs.existsSync(fallbackTemplate)) {
      try { bgImg = await loadImage(fallbackTemplate); } catch (err) {}
    }
  }

  if (bgImg) {
    ctx.save();
    drawImageCover(ctx, bgImg, 0, 0, width, height);

    // Multi-layer dark cinematic overlay
    const overlayGrad = ctx.createLinearGradient(0, 0, width, 0);
    overlayGrad.addColorStop(0, 'rgba(4, 7, 14, 0.40)');
    overlayGrad.addColorStop(0.28, 'rgba(4, 7, 14, 0.65)');
    overlayGrad.addColorStop(0.55, 'rgba(6, 10, 20, 0.88)');
    overlayGrad.addColorStop(1, 'rgba(4, 7, 14, 0.94)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);

    // Bottom dark gradient to anchor cards
    const bottomVignette = ctx.createLinearGradient(0, height * 0.5, 0, height);
    bottomVignette.addColorStop(0, 'rgba(4, 6, 12, 0)');
    bottomVignette.addColorStop(1, 'rgba(4, 6, 12, 0.85)');
    ctx.fillStyle = bottomVignette;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }

  // 3. Ambient Rank-Themed Backlight
  const rankKey = (stats.rank || 'NONE').toUpperCase();
  const rankInfo = RANK_CONFIG[rankKey] || RANK_CONFIG['NONE'];
  const auraColor = rankInfo.aura || 'rgba(0, 255, 255, 0.35)';

  ctx.save();
  // Hero avatar aura burst
  const skinAura = ctx.createRadialGradient(180, 360, 20, 180, 360, 320);
  skinAura.addColorStop(0, auraColor);
  skinAura.addColorStop(0.6, auraColor.replace(/[\d.]+\)$/, '0.12)'));
  skinAura.addColorStop(1, 'transparent');
  ctx.fillStyle = skinAura;
  ctx.fillRect(0, 0, 500, height);

  // Subtle top-right accent glow
  const topAccent = ctx.createRadialGradient(width - 150, 120, 10, width - 150, 120, 380);
  topAccent.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
  topAccent.addColorStop(1, 'transparent');
  ctx.fillStyle = topAccent;
  ctx.fillRect(width - 550, 0, 550, 450);

  // Subtle decorative stars/motes on background
  const seed = (stats.username || 'default').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  for (let i = 0; i < 20; i++) {
    const px = (seed * (i + 13) * 79) % (width - 60) + 30;
    const py = (seed * (i + 37) * 43) % (height - 60) + 30;
    const pr = ((i % 3) + 1) * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Card outer perimeter border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 12, 12, width - 24, height - 24, 22);
  ctx.stroke();

  ctx.restore();
}

// ===========================================================================
// 3D CHARACTER WITH HOLOGRAPHIC PEDESTAL & SPARKS
// ===========================================================================

async function drawCharacterStage(ctx, stats, x, y, width, height) {
  const username = stats.username || "Steve";
  const usernameForAvatar = username.toLowerCase();
  const imageDir = path.join(__dirname, 'db', 'image');
  if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

  const localImagePath = path.join(imageDir, `${usernameForAvatar}.png`);
  let avt = null;

  try {
    if (fs.existsSync(localImagePath)) {
      avt = await loadImage(localImagePath);
    } else {
      const avatarUrls = [
        `https://nmsr.nickac.dev/fullbody/${encodeURIComponent(username)}`,
        `https://mc-heads.net/body/${encodeURIComponent(username)}/512`,
        `https://minotar.net/armor/body/${encodeURIComponent(username)}/512.png`
      ];
      let downloadSuccess = false;
      for (const url of avatarUrls) {
        try {
          const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (response.data && response.data.length > 500) {
            fs.writeFileSync(localImagePath, response.data);
            downloadSuccess = true;
            break;
          }
        } catch (e) {}
      }
      if (downloadSuccess) avt = await loadImage(localImagePath);
    }
  } catch (e) {}

  if (!avt) {
    try {
      const defaultPath = path.join(imageDir, 'steve.png');
      if (fs.existsSync(defaultPath)) avt = await loadImage(defaultPath);
    } catch (err) {}
  }

  const rankKey = (stats.rank || 'NONE').toUpperCase();
  const rankInfo = RANK_CONFIG[rankKey] || RANK_CONFIG['NONE'];
  const auraColor = rankInfo.bracket || '#38BDF8';

  const pedestalX = x + width / 2;
  const pedestalY = y + height - 55;

  ctx.save();

  // 1. Holographic Pedestal Base
  // Deep ground contact shadow
  const shadowGrad = ctx.createRadialGradient(pedestalX, pedestalY, 15, pedestalX, pedestalY, 140);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
  shadowGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)');
  shadowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(pedestalX, pedestalY, 135, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer glowing light ring
  ctx.beginPath();
  ctx.ellipse(pedestalX, pedestalY - 2, 115, 20, 0, 0, Math.PI * 2);
  ctx.strokeStyle = auraColor;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = auraColor;
  ctx.shadowBlur = 20;
  ctx.stroke();

  // Inner bright core ring
  ctx.beginPath();
  ctx.ellipse(pedestalX, pedestalY - 2, 75, 12, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Holographic beam and sparks removed for a cleaner, modern look
  ctx.restore();

  // 2. Render Minecraft Avatar
  if (avt) {
    ctx.save();
    // Ambient character shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 35;
    ctx.shadowOffsetY = 15;

    const avtRatio = avt.width / avt.height;
    const targetH = height * 0.85;
    const targetW = targetH * avtRatio;
    const targetX = x + (width - targetW) / 2;
    const targetY = pedestalY - targetH + 8;

    ctx.drawImage(avt, targetX, targetY, targetW, targetH);
    ctx.restore();
  }

  // 3. Floating Player Pill Badge under pedestal
  const badgeW = 200;
  const badgeH = 28;
  const badgeX = x + (width - badgeW) / 2;
  const badgeY = pedestalY + 16;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 28, 0.90)';
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.stroke();

  // Dot indicator
  ctx.beginPath();
  ctx.arc(badgeX + 18, badgeY + 14, 4, 0, Math.PI * 2);
  ctx.fillStyle = DESIGN.colors.accentGreen;
  ctx.shadowColor = DESIGN.colors.accentGreen;
  ctx.shadowBlur = 8;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.font = `800 11px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textSecondary;
  ctx.textAlign = 'left';
  ctx.fillText('MINECRAFT VERIFIED', badgeX + 30, badgeY + 18);
  ctx.restore();
}

// ===========================================================================
// TOP HEADER BAR (Rank Badge + Large Username + Hit Status)
// ===========================================================================

function drawHeaderBar(ctx, stats, x, y, width, height) {
  drawGlassPanel(ctx, x, y, width, height, 16, {
    fillAlpha: 0.84
  });

  const cy = y + height / 2;
  let curX = x + 24;

  const rankKey = (stats.rank || 'NONE').toUpperCase();
  const rankInfo = RANK_CONFIG[rankKey] || RANK_CONFIG['NONE'];
  const tagText = rankInfo.tag;
  const fullTag = `[${tagText}]`;

  // 1. Rank Badge
  ctx.font = `900 16px ${DESIGN.fonts.family}`;
  const tagWidth = ctx.measureText(fullTag).width + 24;
  const tagHeight = 38;
  const badgeY = cy - tagHeight / 2;

  ctx.save();
  // Rank badge container
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundedRect(ctx, curX, badgeY, tagWidth, tagHeight, 8);
  ctx.fill();

  ctx.strokeStyle = rankInfo.bracket;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = rankInfo.bracket;
  ctx.shadowBlur = 12;
  drawRoundedRect(ctx, curX, badgeY, tagWidth, tagHeight, 8);
  ctx.stroke();

  // Render bracket, body, plus
  let textX = curX + 12;
  const textY = badgeY + 25;
  const baseMatch = tagText.match(/^([A-Z\s]+)(\+*)$/i);
  const baseText = baseMatch ? baseMatch[1] : tagText;
  const plusText = baseMatch ? baseMatch[2] : '';

  ctx.shadowBlur = 0;
  ctx.fillStyle = rankInfo.bracket;
  ctx.fillText('[', textX, textY);
  textX += ctx.measureText('[').width;

  ctx.fillStyle = rankInfo.body;
  ctx.fillText(baseText, textX, textY);
  textX += ctx.measureText(baseText).width;

  if (plusText) {
    ctx.fillStyle = rankInfo.plus || '#FF5555';
    ctx.fillText(plusText, textX, textY);
    textX += ctx.measureText(plusText).width;
  }

  ctx.fillStyle = rankInfo.bracket;
  ctx.fillText(']', textX, textY);
  ctx.restore();

  curX += tagWidth + 22;

  // 2. Player Username + Subtitle
  const username = stats.username || 'Player';
  const displayName = stats.showFullUsername ? username : obscureUsername(username);

  ctx.save();
  const maxUserWidth = width - tagWidth - 260;
  const userFit = fitText(ctx, displayName, maxUserWidth, 32, 22, '900');

  // Primary Username
  ctx.font = userFit.font;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
  ctx.shadowBlur = 14;
  ctx.fillText(userFit.text, curX, cy + 2);

  // Subtitle
  ctx.shadowBlur = 0;
  ctx.font = `700 11px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textDim;
  ctx.fillText('Hypixel Network & DonutSMP Account Verified', curX, cy + 20);
  ctx.restore();

  // 3. Right Status Pill (⚡ HIT SECURED)
  const statusW = 165;
  const statusH = 36;
  const statusX = x + width - statusW - 20;
  const statusY = cy - statusH / 2;

  ctx.save();
  const statusGrad = ctx.createLinearGradient(statusX, statusY, statusX + statusW, statusY);
  statusGrad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
  statusGrad.addColorStop(1, 'rgba(6, 182, 212, 0.18)');
  ctx.fillStyle = statusGrad;
  drawRoundedRect(ctx, statusX, statusY, statusW, statusH, 18);
  ctx.fill();

  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 1.4;
  ctx.shadowColor = '#10B981';
  ctx.shadowBlur = 12;
  drawRoundedRect(ctx, statusX, statusY, statusW, statusH, 18);
  ctx.stroke();

  ctx.shadowBlur = 0;
  drawIconShield(ctx, statusX + 22, cy, 14, '#10B981');

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = '#34D399';
  ctx.textAlign = 'left';
  ctx.fillText('HIT SECURED', statusX + 38, cy + 4);

  ctx.restore();
}

// ===========================================================================
// STAT CARDS (High-Density, Luxury Aesthetics)
// ===========================================================================

/**
 * Featured Networth Hero Card (Top of Column 1)
 */
function drawNetworthHeroCard(ctx, stats, x, y, width, height) {
  const heroGrad = ctx.createLinearGradient(x, y, x, y + height);
  heroGrad.addColorStop(0, 'rgba(32, 26, 16, 0.90)');
  heroGrad.addColorStop(1, 'rgba(14, 16, 28, 0.94)');

  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card, {
    bgGradient: heroGrad,
    borderColor: 'rgba(251, 191, 36, 0.40)',
    glowColor: 'rgba(245, 158, 11, 0.28)',
    glowBlur: 16
  });

  // Top header: Icon + Label + Tag
  drawIconCoin(ctx, x + 24, y + 26, 11, '#FBBF24');

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = '#FBBF24';
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL NETWORTH', x + 44, y + 30);

  // Top Right Tag
  const tagText = 'SKYBLOCK';
  ctx.font = `800 10px ${DESIGN.fonts.family}`;
  const tagW = ctx.measureText(tagText).width + 14;
  const tagX = x + width - tagW - 16;
  const tagY = y + 16;

  ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
  drawRoundedRect(ctx, tagX, tagY, tagW, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#FDE68A';
  ctx.fillText(tagText, tagX + 7, tagY + 14);

  // Formatted values
  const exactNw = cleanCurrency(stats.networth);
  const compactNw = formatCompactNumber(stats.networth);
  const numClean = parseFloat(String(stats.networth).replace(/[^0-9.]/g, '')) || 0;
  const primaryDisplay = (numClean >= 100000) ? compactNw : exactNw;
  const secondaryDisplay = (numClean >= 100000) ? `Exact: ${exactNw}` : 'Estimated Skyblock Networth';

  ctx.save();
  const nwFit = fitText(ctx, primaryDisplay, width - 40, 44, 28, '900');

  const goldTextGrad = ctx.createLinearGradient(x, y + 45, x, y + 105);
  goldTextGrad.addColorStop(0, '#FFFBEB');
  goldTextGrad.addColorStop(0.3, '#FEF08A');
  goldTextGrad.addColorStop(1, '#F59E0B');

  ctx.font = nwFit.font;
  ctx.fillStyle = goldTextGrad;
  ctx.shadowColor = 'rgba(245, 158, 11, 0.65)';
  ctx.shadowBlur = 18;
  ctx.fillText(nwFit.text, x + 20, y + 84);
  ctx.restore();

  // Bottom Sub-detail bar
  const subY = y + height - 24;
  ctx.font = `700 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.fillText(secondaryDisplay, x + 20, subY);
}

/**
 * Skyblock Level Card (Column 1, Card 2)
 */
function drawSkyblockLevelCard(ctx, stats, x, y, width, height) {
  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card);

  // Icon + Header
  drawIconCrystal(ctx, x + 24, y + 26, 16, DESIGN.colors.accentPurple);

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText('SKYBLOCK LEVEL', x + 44, y + 30);

  // Badge
  const bW = 68;
  const bX = x + width - bW - 16;
  const bY = y + 16;
  ctx.fillStyle = 'rgba(192, 132, 252, 0.15)';
  drawRoundedRect(ctx, bX, bY, bW, 20, 6);
  ctx.fill();
  ctx.fillStyle = DESIGN.colors.accentPurple;
  ctx.font = `800 10px ${DESIGN.fonts.family}`;
  ctx.fillText('HYPIXEL', bX + 11, bY + 14);

  // Big Level Value + "LVL" tag
  const sbLvl = parseInt(String(stats.sbLevel).replace(/[^0-9]/g, ''), 10) || 0;
  const sbProgress = Math.min(1, sbLvl / 480);
  const percent = Math.round(sbProgress * 100);

  ctx.save();
  ctx.font = `900 42px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.accentPurple;
  ctx.shadowColor = DESIGN.colors.accentPurple;
  ctx.shadowBlur = 16;
  ctx.fillText(`${sbLvl}`, x + 20, y + 84);
  const numW = ctx.measureText(`${sbLvl}`).width;

  // Small "LEVEL" label next to number
  ctx.shadowBlur = 0;
  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = '#E9D5FF';
  ctx.fillText('LEVEL', x + 24 + numW, y + 80);
  ctx.restore();

  // Progress bar
  const barW = width - 40;
  const barH = 7;
  const barX = x + 20;
  const barY = y + 106;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundedRect(ctx, barX, barY, barW, barH, 4);
  ctx.fill();

  if (sbProgress > 0) {
    const barGrad = ctx.createLinearGradient(barX, barY, barX + barW * sbProgress, barY);
    barGrad.addColorStop(0, '#A855F7');
    barGrad.addColorStop(1, '#EC4899');
    ctx.fillStyle = barGrad;
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 8;
    drawRoundedRect(ctx, barX, barY, Math.max(8, barW * sbProgress), barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Bottom text: Progression ratio + percentage
  const bottomY = y + height - 24;
  ctx.font = `700 11px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.fillText(`Progression: ${sbLvl} / 480`, x + 20, bottomY);

  ctx.textAlign = 'right';
  ctx.fillStyle = DESIGN.colors.accentPurple;
  ctx.fillText(`${percent}%`, x + width - 20, bottomY);
  ctx.textAlign = 'left';
}

/**
 * Bedwars Stars Card (Column 1, Card 3)
 */
function drawBedwarsStarsCard(ctx, stats, x, y, width, height) {
  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card);

  // Icon + Header
  drawIconStar(ctx, x + 24, y + 26, 10, DESIGN.colors.accentGold);

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText('BEDWARS STARS', x + 44, y + 30);

  // Badge
  const bW = 62;
  const bX = x + width - bW - 16;
  const bY = y + 16;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
  drawRoundedRect(ctx, bX, bY, bW, 20, 6);
  ctx.fill();
  ctx.fillStyle = DESIGN.colors.accentGold;
  ctx.font = `800 10px ${DESIGN.fonts.family}`;
  ctx.fillText('COMBAT', bX + 8, bY + 14);

  // Big Stars Value
  const bwStars = parseInt(String(stats.bedwars).replace(/[^0-9]/g, ''), 10) || 0;
  const bwTarget = Math.max(1000, Math.ceil((bwStars + 1) / 500) * 500);
  const bwProgress = Math.min(1, bwStars / bwTarget);
  const percent = Math.round(bwProgress * 100);

  ctx.save();
  ctx.font = `900 40px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.accentGold;
  ctx.shadowColor = DESIGN.colors.accentGold;
  ctx.shadowBlur = 16;
  ctx.fillText(`${bwStars} ★`, x + 20, y + 84);
  ctx.restore();

  // Progress bar
  const barW = width - 40;
  const barH = 7;
  const barX = x + 20;
  const barY = y + 106;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundedRect(ctx, barX, barY, barW, barH, 4);
  ctx.fill();

  if (bwProgress > 0) {
    const barGrad = ctx.createLinearGradient(barX, barY, barX + barW * bwProgress, barY);
    barGrad.addColorStop(0, '#F59E0B');
    barGrad.addColorStop(1, '#EF4444');
    ctx.fillStyle = barGrad;
    ctx.shadowColor = '#F59E0B';
    ctx.shadowBlur = 8;
    drawRoundedRect(ctx, barX, barY, Math.max(8, barW * bwProgress), barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Bottom text: Prestige Goal + percentage
  const bottomY = y + height - 24;
  ctx.font = `700 11px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.fillText(`Milestone: ${bwStars} / ${bwTarget} ★`, x + 20, bottomY);

  ctx.textAlign = 'right';
  ctx.fillStyle = DESIGN.colors.accentGold;
  ctx.fillText(`${percent}%`, x + width - 20, bottomY);
  ctx.textAlign = 'left';
}

/**
 * Cyber Radial Gauge Card (Bedwars / Network)
 */
function drawRadialGaugeCard(ctx, title, current, max, unit, x, y, width, height, color) {
  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card);

  const numVal = parseFloat(String(current).replace(/[^0-9.]/g, '')) || 0;
  const numMax = parseFloat(String(max).replace(/[^0-9.]/g, '')) || 100;
  const ratio = numMax > 0 ? Math.max(0, Math.min(1, numVal / numMax)) : 0;
  const percent = Math.round(ratio * 100);

  // Left Content
  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText(title.toUpperCase(), x + 20, y + 30);

  // Main Ratio / Value
  ctx.font = `900 26px ${DESIGN.fonts.family}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`${current} ${unit || ''}`, x + 20, y + 70);

  // Subtitle / Target
  ctx.font = `700 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textDim;
  ctx.fillText(`Target: ${numMax} ${unit || ''}`, x + 20, y + 96);

  // Status tag
  ctx.fillStyle = color;
  ctx.font = `800 11px ${DESIGN.fonts.family}`;
  ctx.fillText(`${percent}% Completed`, x + 20, y + 130);

  // Right Side: Cyber Radial Gauge
  const r = 42;
  const cx = x + width - r - 26;
  const cy = y + height / 2;

  ctx.save();
  // Outer subtle background track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 7;
  ctx.stroke();

  // Progress Arc
  if (ratio > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + ratio * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.stroke();

    // End point glowing pip
    const pipX = cx + Math.cos(endAngle) * r;
    const pipY = cy + Math.sin(endAngle) * r;
    ctx.beginPath();
    ctx.arc(pipX, pipY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
  }

  // Percentage inside gauge
  ctx.shadowBlur = 0;
  ctx.font = `900 17px ${DESIGN.fonts.family}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${percent}%`, cx, cy);

  ctx.restore();
}

/**
 * Detailed Stats Card (General / PvP / Donut)
 */
function drawStatsListCard(ctx, title, items, x, y, width, height, iconType = 'swords') {
  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card);

  // Header
  const iconX = x + 24;
  const iconY = y + 26;
  if (iconType === 'swords') drawIconSwords(ctx, iconX, iconY, 14, '#38BDF8');
  else if (iconType === 'donut') drawIconDonut(ctx, iconX, iconY, 16, '#F472B6');

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText(title.toUpperCase(), x + 44, y + 30);

  // Divider
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 42);
  ctx.lineTo(x + width - 20, y + 42);
  ctx.stroke();

  // Rows
  const count = items.length;
  const availableH = height - 56;
  const rowH = availableH / count;

  for (let i = 0; i < count; i++) {
    const item = items[i];
    const rowY = y + 54 + i * rowH + rowH * 0.45;

    // Alternating subtle row backdrop
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      drawRoundedRect(ctx, x + 16, rowY - 14, width - 32, rowH - 2, 6);
      ctx.fill();
    }

    // Label with mini dot
    ctx.beginPath();
    ctx.arc(x + 24, rowY - 4, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = item.color || DESIGN.colors.accentBlue;
    ctx.fill();

    ctx.font = `700 12px ${DESIGN.fonts.family}`;
    ctx.fillStyle = DESIGN.colors.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(item.label, x + 34, rowY);

    // Value
    const valStr = String(item.value ?? '');
    ctx.font = `900 13px ${DESIGN.fonts.family}`;
    ctx.fillStyle = item.color || '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText(valStr, x + width - 20, rowY);
  }
}

/**
 * DonutSMP Balance Card (Column 3, Card 1)
 */
function drawDonutBalanceCard(ctx, donutMoney, x, y, width, height) {
  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card);

  // Icon + Title
  drawIconCoin(ctx, x + 24, y + 26, 10, DESIGN.colors.accentGreen);

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText('DONUT BALANCE', x + 44, y + 30);

  // Badge
  const bW = 76;
  const bX = x + width - bW - 16;
  const bY = y + 16;
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  drawRoundedRect(ctx, bX, bY, bW, 20, 6);
  ctx.fill();
  ctx.fillStyle = DESIGN.colors.accentGreen;
  ctx.font = `800 10px ${DESIGN.fonts.family}`;
  ctx.fillText('DONUTSMP', bX + 9, bY + 14);

  // Big Value
  const exactMoney = cleanCurrency(donutMoney);
  const compactMoney = formatCompactNumber(donutMoney);
  const numClean = parseFloat(String(donutMoney).replace(/[^0-9.]/g, '')) || 0;
  const primaryMoney = (numClean >= 100000) ? compactMoney : exactMoney;
  const secondaryMoney = (numClean >= 100000) ? `Exact: ${exactMoney}` : 'Server In-Game Cash';

  ctx.save();
  const valFit = fitText(ctx, primaryMoney, width - 40, 42, 26, '900');
  ctx.font = valFit.font;
  ctx.fillStyle = DESIGN.colors.accentGreen;
  ctx.shadowColor = DESIGN.colors.accentGreen;
  ctx.shadowBlur = 14;
  ctx.fillText(valFit.text, x + 20, y + 84);
  ctx.restore();

  // Bottom Subtext
  const bottomY = y + height - 24;
  ctx.font = `700 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textDim;
  ctx.fillText(secondaryMoney, x + 20, bottomY);
}

/**
 * DonutSMP Shards Card (Column 3, Card 2)
 */
function drawDonutShardsCard(ctx, donutShards, x, y, width, height) {
  drawGlassPanel(ctx, x, y, width, height, DESIGN.radius.card);

  // Icon + Title
  drawIconCrystal(ctx, x + 24, y + 26, 16, DESIGN.colors.accentPurple);

  ctx.font = `800 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText('DONUT SHARDS', x + 44, y + 30);

  // Badge
  const bW = 66;
  const bX = x + width - bW - 16;
  const bY = y + 16;
  ctx.fillStyle = 'rgba(192, 132, 252, 0.15)';
  drawRoundedRect(ctx, bX, bY, bW, 20, 6);
  ctx.fill();
  ctx.fillStyle = DESIGN.colors.accentPurple;
  ctx.font = `800 10px ${DESIGN.fonts.family}`;
  ctx.fillText('PREMIUM', bX + 9, bY + 14);

  // Big Shards Value
  ctx.save();
  const shardStr = String(donutShards || '0');
  const valFit = fitText(ctx, shardStr, width - 40, 42, 26, '900');
  ctx.font = valFit.font;
  ctx.fillStyle = DESIGN.colors.accentPurple;
  ctx.shadowColor = DESIGN.colors.accentPurple;
  ctx.shadowBlur = 14;
  ctx.fillText(valFit.text, x + 20, y + 84);
  ctx.restore();

  // Bottom Subtext
  const bottomY = y + height - 24;
  ctx.font = `700 12px ${DESIGN.fonts.family}`;
  ctx.fillStyle = DESIGN.colors.textDim;
  ctx.fillText('Hardcore Economy Shards', x + 20, bottomY);
}

// ===========================================================================
// BACKGROUND RESOLUTION
// ===========================================================================

function loadBackgrounds() {
  const possibleDirs = [
    path.join(__dirname, 'assets', 'backgrounds'),
    path.join(__dirname, 'assets'),
    path.join(process.cwd(), 'assets', 'backgrounds'),
    path.join(process.cwd(), 'autosecure', 'utils', 'assets', 'backgrounds')
  ];
  const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
  const backgrounds = [];
  const visitedPaths = new Set();
  for (const dir of possibleDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (validExts.includes(ext)) {
          const fullPath = path.join(dir, file);
          if (!visitedPaths.has(fullPath)) {
            visitedPaths.add(fullPath);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isFile()) backgrounds.push({ name: file, path: fullPath, dir });
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
  return backgrounds;
}

function selectBackground(stats, backgrounds) {
  if (!backgrounds || backgrounds.length === 0) return null;
  if (stats.background && typeof stats.background === 'string') {
    const target = stats.background.toLowerCase();
    const found = backgrounds.find(b => b.name.toLowerCase() === target || b.path.toLowerCase().endsWith(target));
    if (found) return found;
  }
  if (typeof stats.backgroundIndex === 'number' && Number.isInteger(stats.backgroundIndex)) {
    const idx = Math.abs(stats.backgroundIndex) % backgrounds.length;
    return backgrounds[idx];
  }
  const user = stats.username || 'default';
  let hash = 0;
  for (let i = 0; i < user.length; i++) {
    hash = ((hash << 5) - hash) + user.charCodeAt(i);
    hash |= 0;
  }
  const selectedIdx = Math.abs(hash) % backgrounds.length;
  return backgrounds[selectedIdx];
}

async function fetchPlayerRank(username) {
  try {
    let cleanUsername = (username || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\w\d_\-]/g, '').slice(0, 16);
    if (!cleanUsername) return 'NONE';
    let correctedName = cleanUsername;
    try {
      const { data } = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${cleanUsername}`, { timeout: 4000 });
      if (data && data.name) correctedName = data.name;
    } catch (e) {}
    try {
      const { data } = await axios.get(`https://track.wreeper.com/player/${correctedName}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 4000
      });
      const $ = cheerio.load(data);
      const rankRaw = $("div").first().text();
      const rankMatch = rankRaw.match(/\[([^\]]+)\]/);
      if (rankMatch && rankMatch[1]) return rankMatch[1].trim();
    } catch (e) {}
    return 'NONE';
  } catch (err) {
    return 'NONE';
  }
}

function isValidMinecraftUsername(name) {
  if (!name || typeof name !== 'string') return false;
  const invalidKeywords = ["couldn't find!", "couldn't change!", "no minecraft!", "xbl failed", "none", "unknown", "failed"];
  if (invalidKeywords.includes(name.trim().toLowerCase())) return false;
  return /^[a-zA-Z0-9_]{2,16}$/.test(name.trim());
}

// ===========================================================================
// MAIN CARD GENERATOR
// ===========================================================================

async function makeCard(stats, outputPath = "output.png") {
  if (!stats || !isValidMinecraftUsername(stats.username)) return null;

  const width = DESIGN.width;
  const height = DESIGN.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgrounds = loadBackgrounds();
  const selectedBg = selectBackground(stats, backgrounds);

  // Auto-fetch DonutSMP stats if missing
  if (!stats.donut && !stats.donutMoney && stats.username) {
    try {
      const getDonutStats = require('./donutapi/getDonutStats');
      const donutRes = await getDonutStats(stats.username);
      if (donutRes && donutRes.hasData) stats.donut = donutRes;
    } catch (e) {}
  }

  // 1. Draw Atmospheric Multi-Layer Background
  await drawAtmosphericBackground(ctx, selectedBg, stats, width, height);

  // Geometry layout
  const pad = 24;
  const gap = 16;
  const skinW = 320;

  // Left 3D Character Stage
  await drawCharacterStage(ctx, stats, pad, pad, skinW, height - pad * 2);

  // Right Side Grid Area
  const gridX = pad + skinW + gap;
  const gridW = width - gridX - pad;
  const headerH = 78;

  // 2. Draw Top Profile Header Bar
  drawHeaderBar(ctx, stats, gridX, pad, gridW, headerH);

  // 3 Columns layout
  const colsY = pad + headerH + gap;
  const colsH = height - pad - colsY;
  const colW = (gridW - gap * 2) / 3;
  const cardH = (colsH - gap * 2) / 3;

  const col1X = gridX;
  const col2X = col1X + colW + gap;
  const col3X = col2X + colW + gap;

  const row1Y = colsY;
  const row2Y = colsY + cardH + gap;
  const row3Y = colsY + (cardH + gap) * 2;

  // -------------------------------------------------------------------------
  // COLUMN 1: Hypixel Wealth & Progression
  // -------------------------------------------------------------------------
  // Card 1.1: Total Networth (Hero Featured Card)
  drawNetworthHeroCard(ctx, stats, col1X, row1Y, colW, cardH);

  // Card 1.2: Skyblock Level
  drawSkyblockLevelCard(ctx, stats, col1X, row2Y, colW, cardH);

  // Card 1.3: Bedwars Stars
  drawBedwarsStarsCard(ctx, stats, col1X, row3Y, colW, cardH);

  // -------------------------------------------------------------------------
  // COLUMN 2: PvP & Gauges
  // -------------------------------------------------------------------------
  // Card 2.1: General & Duel PvP Stats
  const pvpItems = [
    { label: 'Network Level', value: String(stats.networkLevel || '0'), color: DESIGN.colors.accentBlue },
    { label: 'Duel KDR', value: String(stats.duelKDR || '0.00'), color: DESIGN.colors.accentGreen },
    { label: 'Duel Winstreak', value: `${stats.duelWinstreak || '0'} 🔥`, color: '#F97316' },
    { label: 'Plus Color', value: String(stats.plusColour || 'None'), color: '#38BDF8' }
  ];
  drawStatsListCard(ctx, 'PvP & Network Info', pvpItems, col2X, row1Y, colW, cardH, 'swords');

  // Card 2.2: Bedwars Cyber Gauge
  const rawBedwars = parseInt(String(stats.bedwars).replace(/[^0-9]/g, ''), 10) || 0;
  const bedwarsTarget = Math.max(1000, Math.ceil((rawBedwars + 1) / 500) * 500);
  drawRadialGaugeCard(ctx, 'Bedwars Milestone', rawBedwars, bedwarsTarget, '★', col2X, row2Y, colW, cardH, DESIGN.colors.accentEmerald);

  // Card 2.3: Network Level Cyber Gauge
  const rawNetwork = parseInt(String(stats.networkLevel).replace(/[^0-9]/g, ''), 10) || 0;
  const networkTarget = Math.max(250, Math.ceil((rawNetwork + 1) / 100) * 100);
  drawRadialGaugeCard(ctx, 'Network Level', rawNetwork, networkTarget, 'Lvl', col2X, row3Y, colW, cardH, DESIGN.colors.accentBlue);

  // -------------------------------------------------------------------------
  // COLUMN 3: Donut SMP Economy
  // -------------------------------------------------------------------------
  const donutData = stats.donut || {};
  const donutMoney = stats.donutMoney || donutData.moneyFormatted || (donutData.money ? `$${donutData.money}` : '$0');
  const donutShards = stats.donutShards || donutData.shardsFormatted || String(donutData.shards || '0');

  // Card 3.1: Donut Balance
  drawDonutBalanceCard(ctx, donutMoney, col3X, row1Y, colW, cardH);

  // Card 3.2: Donut Shards
  drawDonutShardsCard(ctx, donutShards, col3X, row2Y, colW, cardH);

  // Card 3.3: Donut Profile Info
  const donutItems = [
    { label: 'Playtime', value: stats.donutPlaytime || donutData.playtime || '0m', color: DESIGN.colors.textSecondary },
    { label: 'K/D Ratio', value: stats.donutKDR || donutData.kdr || '0.00', color: DESIGN.colors.accentGreen },
    { label: 'Server Rank', value: (stats.donutRank || donutData.rank || 'Default').toUpperCase(), color: DESIGN.colors.accentGold }
  ];
  drawStatsListCard(ctx, 'DonutSMP Profile', donutItems, col3X, row3Y, colW, cardH, 'donut');

  // Write output
  const buffer = canvas.toBuffer("image/png");
  if (outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  }

  return buffer;
}

module.exports = {
  makeCard,
  generateHitCard: makeCard,
  fetchPlayerRank,
  obscureUsername,
  loadBackgrounds,
  selectBackground,
  DESIGN,
  RANK_CONFIG,
  fitText,
  fitFontSize
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const dummyStats = {
    username: args[0] || "Technoblade",
    rank: args[1] || "MVP++",
    networth: args[2] || "$15,450,000,000",
    bedwars: args[3] || "1250",
    networkLevel: "480",
    sbLevel: "420",
    duelKDR: "12.50",
    duelWinstreak: "150",
    plusColour: "Aqua",
    gifted: "50",
    donutMoney: "$2,450,000",
    donutShards: "1,250",
    donutPlaytime: "148h",
    donutRank: "Vip",
    donutKDR: "3.45",
    showFullUsername: true
  };
  const testFile = path.join(__dirname, `../../test_output_premium_v2.png`);
  makeCard(dummyStats, testFile).then(() => {
    console.log(`Test completed: ${testFile}`);
  }).catch(console.error);
}
