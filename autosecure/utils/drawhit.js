const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

// ===========================================================================
// 0. DESIGN SYSTEM TOKENS & RESPONSIVE GRID LAYOUT
// ===========================================================================

const DESIGN = {
  radius: {
    panel: 14,
    card: 10,
    badge: 7,
    sm: 4
  },
  padding: {
    panel: 16,
    card: 14
  },
  colors: {
    bgDark: '#080c14',
    panelBg: 'rgba(10, 16, 30, 0.78)',
    panelBorder: 'rgba(255, 255, 255, 0.10)',
    cardBg: 'rgba(14, 22, 40, 0.76)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    divider: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    accentGold: '#FBBF24',
    accentGreen: '#34D399',
    accentBlue: '#38BDF8',
    accentPurple: '#C084FC',
    accentRed: '#F87171'
  },
  fonts: {
    family: '"Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif'
  }
};

/**
 * Computes a unified 3-column layout grid for 1200x600 canvas.
 * Outer padding: 36px | Gaps: 14px
 * Content width: 1128px (Hero 330px + Gap 14px + Center 440px + Gap 14px + Right 330px)
 * Content height: 520px (from Y=36 to Y=556)
 */
function computeLayout(canvasWidth = 1200, canvasHeight = 600) {
  const padding = 36;
  const gap = 14;
  const contentHeight = 520;
  const topY = padding;

  const heroWidth = 330;
  const centerWidth = 440;
  const rightWidth = 330;

  const heroX = padding;
  const centerX = heroX + heroWidth + gap;
  const rightX = centerX + centerWidth + gap;

  return {
    canvasWidth,
    canvasHeight,
    padding,
    gap,
    contentHeight,
    hero: {
      x: heroX,
      y: topY,
      width: heroWidth,
      height: contentHeight,
      bottom: topY + contentHeight
    },
    center: {
      x: centerX,
      y: topY,
      width: centerWidth,
      height: contentHeight,
      bottom: topY + contentHeight
    },
    right: {
      x: rightX,
      y: topY,
      width: rightWidth,
      height: contentHeight,
      bottom: topY + contentHeight
    },
    footer: {
      y: canvasHeight - 16,
      leftX: padding,
      rightX: canvasWidth - padding
    }
  };
}

// Rank visual configurations with authentic Hypixel colors & glow tags
const RANK_CONFIG = {
  'OWNER': { tag: 'OWNER', bracket: '#FF5555', body: '#FF5555', plus: '#FF5555', bg: 'rgba(255, 85, 85, 0.18)', border: '#FF5555' },
  'ADMIN': { tag: 'ADMIN', bracket: '#FF5555', body: '#FF5555', plus: '#FF5555', bg: 'rgba(255, 85, 85, 0.18)', border: '#FF5555' },
  'GM': { tag: 'GM', bracket: '#00AA00', body: '#00AA00', plus: '#00AA00', bg: 'rgba(0, 170, 0, 0.18)', border: '#00AA00' },
  'MOD': { tag: 'MOD', bracket: '#00AA00', body: '#00AA00', plus: '#00AA00', bg: 'rgba(0, 170, 0, 0.18)', border: '#00AA00' },
  'HELPER': { tag: 'HELPER', bracket: '#5555FF', body: '#5555FF', plus: '#5555FF', bg: 'rgba(85, 85, 255, 0.18)', border: '#5555FF' },
  'YOUTUBE': { tag: 'YOUTUBE', bracket: '#FF5555', body: '#FFFFFF', plus: '#FF5555', bg: 'rgba(255, 85, 85, 0.20)', border: '#FF5555' },
  'PIG+++': { tag: 'PIG+++', bracket: '#FF69B4', body: '#FFB6C1', plus: '#55FFFF', bg: 'rgba(255, 105, 180, 0.20)', border: '#FF69B4' },
  'MVP++': { tag: 'MVP++', bracket: '#FFAA00', body: '#00FFFF', plus: '#FF5555', bg: 'rgba(255, 170, 0, 0.20)', border: '#FFAA00' },
  'MVP+': { tag: 'MVP+', bracket: '#00FFFF', body: '#00FFFF', plus: '#FF5555', bg: 'rgba(0, 255, 255, 0.18)', border: '#00FFFF' },
  'MVP': { tag: 'MVP', bracket: '#00FFFF', body: '#00FFFF', plus: '', bg: 'rgba(0, 255, 255, 0.14)', border: '#00FFFF' },
  'VIP+': { tag: 'VIP+', bracket: '#55FF55', body: '#55FF55', plus: '#FFAA00', bg: 'rgba(85, 255, 85, 0.18)', border: '#55FF55' },
  'VIP': { tag: 'VIP', bracket: '#55FF55', body: '#55FF55', plus: '', bg: 'rgba(85, 255, 85, 0.14)', border: '#55FF55' },
  'NONE': { tag: 'DEFAULT', bracket: '#AAAAAA', body: '#AAAAAA', plus: '', bg: 'rgba(170, 170, 170, 0.10)', border: '#666666' },
};

// ===========================================================================
// 1. GLOBAL DRAWING & TEXT FITTING HELPERS
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
 * Draws a glassmorphic container panel.
 */
function drawPanel(ctx, x, y, width, height, radius = DESIGN.radius.panel, options = {}) {
  ctx.save();
  ctx.fillStyle = options.bg || DESIGN.colors.panelBg;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  ctx.strokeStyle = options.border || DESIGN.colors.panelBorder;
  ctx.lineWidth = options.borderWidth || 1;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws an internal card component.
 */
function drawCard(ctx, x, y, width, height, radius = DESIGN.radius.card, options = {}) {
  ctx.save();
  ctx.fillStyle = options.bg || DESIGN.colors.cardBg;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  ctx.strokeStyle = options.border || DESIGN.colors.cardBorder;
  ctx.lineWidth = options.borderWidth || 1;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * Dynamic text fitting helper: scales down font size and truncates with ellipsis if necessary.
 * Guarantees zero text overflow.
 */
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

  return {
    fontSize: size,
    text: str,
    font: `${weight} ${size}px ${family}`
  };
}

function fitFontSize(ctx, text, maxWidth, initialSize = 16, minSize = 10, weight = 'bold', family = DESIGN.fonts.family) {
  return fitText(ctx, text, maxWidth, initialSize, minSize, weight, family).fontSize;
}

function obscureUsername(username) {
  if (!username) return 'Unknown';
  if (username.length <= 3) return username;
  const first = username.slice(0, 2);
  const last = username.slice(-2);
  return `${first}${'*'.repeat(Math.max(4, username.length - 4))}${last}`;
}

async function fetchPlayerRank(username) {
  try {
    let cleanUsername = (username || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\w\d_\-]/g, '').slice(0, 16);
    if (!cleanUsername) return 'NONE';

    let correctedName = cleanUsername;
    try {
      const { data } = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${cleanUsername}`, { timeout: 4000 });
      if (data && data.name) correctedName = data.name;
    } catch (e) { }

    try {
      const { data } = await axios.get(`https://track.wreeper.com/player/${correctedName}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 4000
      });
      const $ = cheerio.load(data);
      const rankRaw = $("div").first().text();
      const rankMatch = rankRaw.match(/\[([^\]]+)\]/);
      if (rankMatch && rankMatch[1]) {
        return rankMatch[1].trim();
      }
    } catch (e) { }

    return 'NONE';
  } catch (err) {
    return 'NONE';
  }
}

// ===========================================================================
// 2. BACKGROUND LOADER & DETERMINISTIC SELECTION
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
              if (stat.isFile()) {
                backgrounds.push({ name: file, path: fullPath, dir });
              }
            } catch (e) { }
          }
        }
      }
    } catch (e) { }
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

function drawImageCover(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;

  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

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

async function drawBackground(ctx, selectedBg, stats, width, height) {
  ctx.fillStyle = DESIGN.colors.bgDark;
  ctx.fillRect(0, 0, width, height);

  let imageLoaded = false;
  let bgImg = null;

  if (selectedBg && selectedBg.path) {
    try {
      bgImg = await loadImage(selectedBg.path);
      imageLoaded = true;
    } catch (err) {
      imageLoaded = false;
    }
  }

  const overlayOpacity = stats.overlayOpacity !== undefined ? stats.overlayOpacity : 0.40;

  if (imageLoaded && bgImg) {
    ctx.save();
    // 1. Draw Real Artwork with COVER mode
    drawImageCover(ctx, bgImg, 0, 0, width, height);

    // 2. Localized horizontal gradient shield:
    // Left (Hero) retains vivid artwork visibility; Center and Right panels have high text contrast
    const darkOverlay = ctx.createLinearGradient(0, 0, width, 0);
    darkOverlay.addColorStop(0, `rgba(5, 8, 15, ${overlayOpacity * 0.35})`);
    darkOverlay.addColorStop(0.32, `rgba(7, 10, 18, ${overlayOpacity * 0.70})`);
    darkOverlay.addColorStop(0.66, `rgba(6, 9, 16, ${overlayOpacity + 0.30})`);
    darkOverlay.addColorStop(1, `rgba(4, 7, 13, ${overlayOpacity + 0.45})`);

    ctx.fillStyle = darkOverlay;
    ctx.fillRect(0, 0, width, height);

    // Subtle edge vignette
    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.35, width * 0.5, height * 0.5, width * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  } else {
    const fallbackGrad = ctx.createLinearGradient(0, 0, width, height);
    fallbackGrad.addColorStop(0, '#0f172a');
    fallbackGrad.addColorStop(0.6, '#111827');
    fallbackGrad.addColorStop(1, '#030712');
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // Single subtle outer border frame
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 12, 12, width - 24, height - 24, 16);
  ctx.stroke();
  ctx.restore();
}

// ===========================================================================
// 3. MINECRAFT CHARACTER (HERO ELEMENT)
// ===========================================================================

async function drawCharacter(ctx, stats, heroX, heroY, heroW, heroH) {
  // Support either (ctx, stats, layout.hero) or individual coordinates
  let x, y, width, height;
  if (typeof heroX === 'object' && heroX !== null) {
    x = heroX.x;
    y = heroX.y;
    width = heroX.width;
    height = heroX.height;
  } else {
    x = heroX;
    y = heroY;
    width = heroW;
    height = heroH;
  }

  const username = stats.username || "Steve";
  const usernameForAvatar = username.toLowerCase();
  const imageDir = path.join(__dirname, 'db', 'image');
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  const localImagePath = path.join(imageDir, `${usernameForAvatar}.png`);
  let avt;

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
        } catch (e) { }
      }

      if (downloadSuccess) {
        avt = await loadImage(localImagePath);
      } else {
        throw new Error('Avatar download fallback');
      }
    }
  } catch (e) {
    try {
      const defaultPath = path.join(imageDir, 'steve.png');
      if (fs.existsSync(defaultPath)) {
        avt = await loadImage(defaultPath);
      }
    } catch (err) { }
  }

  // 1. Dynamic ground baseline calculation (feet rest consistently near bottom)
  const groundBaselineY = y + height - 20;

  // 2. Realistic ground shadow (Soft contact ellipse)
  const shadowCenterX = x + width / 2;
  const shadowCenterY = groundBaselineY;
  ctx.save();
  const groundShadow = ctx.createRadialGradient(shadowCenterX, shadowCenterY, 8, shadowCenterX, shadowCenterY, 115);
  groundShadow.addColorStop(0, 'rgba(0, 0, 0, 0.70)');
  groundShadow.addColorStop(0.5, 'rgba(0, 0, 0, 0.32)');
  groundShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = groundShadow;
  ctx.beginPath();
  ctx.ellipse(shadowCenterX, shadowCenterY, 115, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Render Hero Character: Auto-scaled to available height, centered in hero column
  if (avt) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;

    const avtRatio = avt.width / avt.height;
    const maxCharacterHeight = 460;
    const targetH = Math.min(height * 0.88, maxCharacterHeight);
    const targetW = targetH * avtRatio;
    const targetX = x + (width - targetW) / 2;
    const targetY = groundBaselineY - targetH;

    ctx.drawImage(avt, targetX, targetY, targetW, targetH);
    ctx.restore();
  }
}

// ===========================================================================
// 4. USERNAME & RANK IDENTITY
// ===========================================================================

function drawIdentity(ctx, stats, x, y, maxWidth) {
  ctx.save();

  // Resolve Rank
  const rankKey = (stats.rank || 'NONE').toUpperCase();
  const rankInfo = RANK_CONFIG[rankKey] || RANK_CONFIG['NONE'];
  const tagText = rankInfo.tag;

  // 1. Rank Badge Pill
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  const fullTag = `[${tagText}]`;
  const tagW = ctx.measureText(fullTag).width + 16;
  const tagH = 28;
  const badgeY = y + 2;

  ctx.fillStyle = rankInfo.bg;
  drawRoundedRect(ctx, x, badgeY, tagW, tagH, DESIGN.radius.badge);
  ctx.fill();
  ctx.strokeStyle = rankInfo.border;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, badgeY, tagW, tagH, DESIGN.radius.badge);
  ctx.stroke();

  // Formatted Rank Text inside badge (Brackets + Body + Plus)
  let curX = x + 8;
  const tagTextY = badgeY + 19;
  ctx.fillStyle = rankInfo.bracket;
  ctx.fillText('[', curX, tagTextY);
  curX += ctx.measureText('[').width;

  const baseMatch = tagText.match(/^([A-Z\s]+)(\+*)$/i);
  const baseText = baseMatch ? baseMatch[1] : tagText;
  const plusText = baseMatch ? baseMatch[2] : '';

  ctx.fillStyle = rankInfo.body;
  ctx.fillText(baseText, curX, tagTextY);
  curX += ctx.measureText(baseText).width;

  if (plusText) {
    ctx.fillStyle = rankInfo.plus || '#FF5555';
    ctx.fillText(plusText, curX, tagTextY);
    curX += ctx.measureText(plusText).width;
  }

  ctx.fillStyle = rankInfo.bracket;
  ctx.fillText(']', curX, tagTextY);

  // 2. Username with dynamic text fitting & optical center alignment with rank badge
  const username = stats.username || 'Player';
  const displayName = stats.showFullUsername ? username : obscureUsername(username);

  const usernameX = x + tagW + 12;
  const availableUserW = maxWidth - tagW - 12;
  const fittedUser = fitText(ctx, displayName, availableUserW, 30, 16, 'bold');

  const badgeCenterY = badgeY + tagH / 2;
  ctx.font = fittedUser.font;
  ctx.fillStyle = DESIGN.colors.textPrimary;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.textBaseline = 'middle';
  ctx.fillText(fittedUser.text, usernameX, badgeCenterY);
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';

  // 3. Subtle horizontal divider spanning exactly maxWidth
  ctx.strokeStyle = DESIGN.colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 44);
  ctx.lineTo(x + maxWidth, y + 44);
  ctx.stroke();

  ctx.restore();
}

// ===========================================================================
// 5. PRIMARY STATS (NETWORTH + EQUAL PROGRESSION CARDS)
// ===========================================================================

function drawPrimaryStats(ctx, stats, x, y, width) {
  ctx.save();

  // Card 1: TOTAL NETWORTH (Full width card: 84px height)
  const nwCardH = 84;
  drawCard(ctx, x, y, width, nwCardH, DESIGN.radius.card, {
    border: 'rgba(251, 191, 36, 0.38)'
  });

  // Label
  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.textSecondary;
  ctx.fillText('TOTAL NETWORTH', x + 16, y + 24);

  // Badge tag on top right
  ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
  const tagLabel = 'SkyBlock Economy';
  const tagW = ctx.measureText(tagLabel).width + 12;
  const tagX = x + width - tagW - 16;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
  drawRoundedRect(ctx, tagX, y + 12, tagW, 20, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, tagX, y + 12, tagW, 20, 5);
  ctx.stroke();
  ctx.fillStyle = DESIGN.colors.accentGold;
  ctx.fillText(tagLabel, tagX + 6, y + 26);

  // Networth Value with fitText (Prevents any card overflow)
  const nwValue = stats.networth || '$0';
  const fittedNw = fitText(ctx, nwValue, width - 36, 32, 18, 'bold');
  ctx.font = fittedNw.font;
  ctx.fillStyle = DESIGN.colors.textPrimary;
  ctx.fillText(fittedNw.text, x + 16, y + 62);

  // Row 2: SKYBLOCK LEVEL & BEDWARS STARS (2 equal cards, 12px gap, 84px height)
  const cardGap = 12;
  const colW = (width - cardGap) / 2;
  const row2Y = y + nwCardH + 12;
  const card2H = 84;

  const items = [
    {
      label: 'SKYBLOCK LEVEL',
      value: String(stats.sbLevel || '0'),
      color: DESIGN.colors.accentPurple,
      sub: 'Progression',
      border: 'rgba(192, 132, 252, 0.32)'
    },
    {
      label: 'BEDWARS STARS',
      value: `${stats.bedwars || '0'} ★`,
      color: DESIGN.colors.accentGreen,
      sub: 'Competitive',
      border: 'rgba(52, 211, 153, 0.32)'
    }
  ];

  for (let i = 0; i < 2; i++) {
    const item = items[i];
    const colX = x + i * (colW + cardGap);

    drawCard(ctx, colX, row2Y, colW, card2H, DESIGN.radius.card, {
      border: item.border
    });

    // Label
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = DESIGN.colors.textSecondary;
    ctx.fillText(item.label, colX + 16, row2Y + 24);

    // Subtitle on top right
    ctx.font = '10px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = DESIGN.colors.textMuted;
    ctx.textAlign = 'right';
    ctx.fillText(item.sub, colX + colW - 16, row2Y + 24);
    ctx.textAlign = 'left';

    // Value with fitText
    const fittedVal = fitText(ctx, item.value, colW - 32, 26, 16, 'bold');
    ctx.font = fittedVal.font;
    ctx.fillStyle = item.color;
    ctx.fillText(fittedVal.text, colX + 16, row2Y + 60);
  }

  ctx.restore();
}

// ===========================================================================
// 6. SECONDARY STATS (UNIFIED 2-COLUMN STATS PANEL)
// ===========================================================================

function drawSecondaryStats(ctx, stats, x, y, width, height = 260) {
  ctx.save();

  // Unified panel background
  drawPanel(ctx, x, y, width, height, DESIGN.radius.panel);

  // Section Header
  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.textSecondary;
  ctx.fillText('⚡ STATISTICS OVERVIEW', x + 16, y + 26);

  // Divider below title
  ctx.strokeStyle = DESIGN.colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 38);
  ctx.lineTo(x + width - 16, y + 38);
  ctx.stroke();

  // 6 Balanced Items (3 per column)
  const secItems = [
    { label: 'Network Level', value: String(stats.networkLevel || '0'), color: DESIGN.colors.accentBlue },
    { label: 'Duel KDR', value: String(stats.duelKDR || '0.00'), color: DESIGN.colors.accentRed },
    { label: 'Duel Winstreak', value: String(stats.duelWinstreak || '0'), color: DESIGN.colors.accentGold },
    { label: 'Plus Colour', value: String(stats.plusColour || 'None'), color: DESIGN.colors.accentGreen },
    { label: 'Gifted Ranks', value: String(stats.gifted || '0'), color: DESIGN.colors.accentPurple },
    { label: 'Security Status', value: 'Secured', color: DESIGN.colors.accentGreen }
  ];

  const colWidth = (width - 32) / 2;
  const startRowY = y + 70;
  const rowHeight = 44;

  // Center vertical divider
  const midX = x + width / 2;
  ctx.strokeStyle = DESIGN.colors.divider;
  ctx.beginPath();
  ctx.moveTo(midX, y + 48);
  ctx.lineTo(midX, y + height - 16);
  ctx.stroke();

  for (let i = 0; i < secItems.length; i++) {
    const item = secItems[i];
    const isRightCol = i >= 3;
    const rowIndex = i % 3;

    const rowY = startRowY + rowIndex * rowHeight;
    const colStartX = isRightCol ? midX + 16 : x + 16;
    const colEndX = isRightCol ? x + width - 16 : midX - 16;
    const maxValW = (colEndX - colStartX) * 0.48;

    // Label on left
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = DESIGN.colors.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(item.label, colStartX, rowY);

    // Value on right aligned along vertical axis
    const fitted = fitText(ctx, item.value, maxValW, 14, 10, 'bold');
    ctx.font = fitted.font;
    ctx.fillStyle = item.color;
    ctx.textAlign = 'right';
    ctx.fillText(fitted.text, colEndX, rowY);

    // Subtle row divider (except after last row)
    if (rowIndex < 2) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(colStartX, rowY + 14);
      ctx.lineTo(colEndX, rowY + 14);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ===========================================================================
// 7. DONUT PROGRESS RINGS & DONUT SMP STATS (RIGHT PANEL)
// ===========================================================================

/**
 * Draws a clean, crisp Donut / Doughnut progress chart.
 */
function drawDonutStat(ctx, { x, y, radius, value, max, label, color, sublabel }) {
  const numVal = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
  const numMax = parseFloat(String(max).replace(/[^0-9.]/g, '')) || 100;
  const ratio = numMax > 0 ? Math.max(0, Math.min(1, numVal / numMax)) : 0;
  const percent = Math.round(ratio * 100);

  ctx.save();

  // 1. Background Track Ring
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 5.5;
  ctx.stroke();

  // 2. Colored Progress Arc
  if (ratio > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + ratio * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle, false);
    ctx.strokeStyle = color || DESIGN.colors.accentBlue;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = color || DESIGN.colors.accentBlue;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 3. Center Percentage
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.textPrimary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${percent}%`, x, y);

  // 4. Label below donut
  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.textPrimary;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x, y + radius + 18);

  // 5. Sublabel below label
  if (sublabel) {
    ctx.font = '10px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = DESIGN.colors.textSecondary;
    ctx.fillText(sublabel, x, y + radius + 32);
  }

  ctx.restore();
}

/**
 * Draws Right Panel containing DonutSMP 2x2 grid and Hypixel Progress Rings.
 */
function drawDonutStats(ctx, stats, x, y, width, height) {
  ctx.save();

  // Panel background
  drawPanel(ctx, x, y, width, height, DESIGN.radius.panel);

  // ----------------------------------------------------
  // SECTION 1: DONUT SMP STATS
  // ----------------------------------------------------
  const donutData = stats.donut || {};
  const donutMoney = stats.donutMoney || donutData.moneyFormatted || (donutData.money ? `$${donutData.money}` : '$0');
  const donutShards = stats.donutShards || donutData.shardsFormatted || String(donutData.shards || '0');
  const donutPlaytime = stats.donutPlaytime || donutData.playtime || '0m';
  const donutRank = stats.donutRank || donutData.rank || 'None';
  const donutKDR = stats.donutKDR || donutData.kdr || '0.00';

  // Header Title
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.accentGold;
  ctx.fillText('🍩 DONUT SMP STATS', x + 16, y + 26);

  // Donut Rank Badge on top right of panel
  if (donutRank && donutRank !== 'None') {
    const rankText = donutRank.toUpperCase();
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    const rw = ctx.measureText(rankText).width + 14;
    const rx = x + width - rw - 16;
    const ry = y + 14;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
    drawRoundedRect(ctx, rx, ry, rw, 20, DESIGN.radius.badge);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, rx, ry, rw, 20, DESIGN.radius.badge);
    ctx.stroke();

    ctx.fillStyle = DESIGN.colors.accentGold;
    ctx.fillText(rankText, rx + 7, ry + 14);
  }

  // 4 DonutSMP Stat Cards (2x2 Grid)
  const donutCards = [
    { label: 'BALANCE', value: donutMoney, color: DESIGN.colors.accentGreen },
    { label: 'SHARDS', value: donutShards, color: DESIGN.colors.accentPurple },
    { label: 'PLAYTIME', value: donutPlaytime, color: DESIGN.colors.accentBlue },
    { label: 'K/D RATIO', value: donutKDR, color: DESIGN.colors.accentRed }
  ];

  const gridY = y + 46;
  const gridGap = 10;
  const innerPad = 14;
  const cardW = (width - 2 * innerPad - gridGap) / 2; // ~146px
  const cardH = 68;

  for (let i = 0; i < donutCards.length; i++) {
    const c = donutCards[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = x + innerPad + col * (cardW + gridGap);
    const cy = gridY + row * (cardH + gridGap);

    drawCard(ctx, cx, cy, cardW, cardH, DESIGN.radius.card);

    // Label
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = DESIGN.colors.textMuted;
    ctx.fillText(c.label, cx + 12, cy + 22);

    // Value with fitText (Prevents any card overflow)
    const fitted = fitText(ctx, c.value, cardW - 24, 18, 11, 'bold');
    ctx.font = fitted.font;
    ctx.fillStyle = c.color;
    ctx.fillText(fitted.text, cx + 12, cy + 50);
  }

  // Divider between DonutSMP and Progress
  const divY = gridY + 2 * cardH + gridGap + 16;
  ctx.strokeStyle = DESIGN.colors.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 16, divY);
  ctx.lineTo(x + width - 16, divY);
  ctx.stroke();

  // ----------------------------------------------------
  // SECTION 2: HYPIXEL PROGRESS RINGS
  // ----------------------------------------------------
  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.textSecondary;
  ctx.fillText('⚡ HYPIXEL PROGRESS', x + 16, divY + 24);

  const rawBedwars = parseInt(String(stats.bedwars).replace(/[^0-9]/g, ''), 10) || 0;
  const rawNetwork = parseInt(String(stats.networkLevel).replace(/[^0-9]/g, ''), 10) || 0;

  // Progress Bug Fix: Synchronize arc max and subtitle from the exact same variable
  const bedwarsMax = Math.max(1000, Math.ceil((rawBedwars + 1) / 500) * 500);
  const networkMax = Math.max(250, Math.ceil((rawNetwork + 1) / 100) * 100);

  const ring1X = x + width * 0.28;
  const ring2X = x + width * 0.72;
  const ringY = divY + 84;

  // Donut Ring 1: Bedwars
  drawDonutStat(ctx, {
    x: ring1X,
    y: ringY,
    radius: 34,
    value: rawBedwars,
    max: bedwarsMax,
    label: 'BEDWARS',
    color: DESIGN.colors.accentGreen,
    sublabel: `${rawBedwars} / ${bedwarsMax} ★`
  });

  // Donut Ring 2: Network Level
  drawDonutStat(ctx, {
    x: ring2X,
    y: ringY,
    radius: 34,
    value: rawNetwork,
    max: networkMax,
    label: 'NETWORK',
    color: DESIGN.colors.accentBlue,
    sublabel: `Lvl ${rawNetwork} / ${networkMax}`
  });

  ctx.restore();
}

// ===========================================================================
// 8. FOOTER BAR & BRANDING
// ===========================================================================

function drawFooter(ctx, stats, width, height, layout = null) {
  ctx.save();

  const footerY = layout ? layout.footer.y : height - 16;
  const leftX = layout ? layout.center.x : 380;
  const rightX = layout ? layout.footer.rightX : width - 36;

  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = DESIGN.colors.textSecondary;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.fillText('HACHIIRO V2 • MINECRAFT PLAYER ANALYTICS', leftX, footerY);

  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
  ctx.textAlign = 'right';
  ctx.fillText(`SECURED AT ${timeStr} UTC`, rightX, footerY);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ===========================================================================
// 9. MAIN EXPORTED FUNCTION (WIDE 1200x600 LANDSCAPE CARD)
// ===========================================================================

function isValidMinecraftUsername(name) {
  if (!name || typeof name !== 'string') return false;
  const invalidKeywords = ["couldn't find!", "couldn't change!", "no minecraft!", "xbl failed", "none", "unknown", "failed"];
  if (invalidKeywords.includes(name.trim().toLowerCase())) return false;
  return /^[a-zA-Z0-9_]{2,16}$/.test(name.trim());
}

/**
 * Generate Wide Horizontal Minecraft Player Card (1200x600, 2:1)
 * Uses strict grid-based composition, unified spacing, and typography hierarchy.
 * 
 * @param {Object} stats Player stats object
 * @param {string} outputPath Output PNG path
 * @returns {Promise<Buffer>} Image buffer
 */
async function makeCard(stats, outputPath = "output.png") {
  if (!stats || !isValidMinecraftUsername(stats.username)) {
    console.log(`[drawHit] Aborting card generation: Invalid or placeholder username '${stats?.username}'`);
    return null;
  }

  const width = 1200;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. Compute Strict Grid Layout System
  const layout = computeLayout(width, height);

  // 2. Scan and select real background asset
  const backgrounds = loadBackgrounds();
  const selectedBg = selectBackground(stats, backgrounds);

  // 3. Auto-fetch DonutSMP stats if not provided
  if (!stats.donut && !stats.donutMoney && stats.username) {
    try {
      const getDonutStats = require('./donutapi/getDonutStats');
      const donutRes = await getDonutStats(stats.username);
      if (donutRes && donutRes.hasData) {
        stats.donut = donutRes;
      }
    } catch (e) { }
  }

  // 4. Render Background with Localized Text Shield
  await drawBackground(ctx, selectedBg, stats, width, height);

  // 5. LEFT HERO COLUMN (Hero 3D Character)
  await drawCharacter(ctx, stats, layout.hero);

  // 6. CENTER COLUMN (Vertical Rhythm: Identity -> Networth -> Skyblock/Bedwars -> Secondary)
  // 6.1 Identity Header
  drawIdentity(ctx, stats, layout.center.x, layout.center.y, layout.center.width);

  // 6.2 Primary Networth Card
  const primaryY = layout.center.y + 60;
  drawPrimaryStats(ctx, stats, layout.center.x, primaryY, layout.center.width);

  // 6.3 Secondary Stats Panel
  const secondaryY = primaryY + 192; // 60 + 84 + 12 + 84 + 12 = 252
  const secondaryH = layout.center.bottom - secondaryY; // 556 - 288 = 268px
  drawSecondaryStats(ctx, stats, layout.center.x, secondaryY, layout.center.width, secondaryH);

  // 7. RIGHT COLUMN (DonutSMP Grid + Progress Rings)
  drawDonutStats(ctx, stats, layout.right.x, layout.right.y, layout.right.width, layout.right.height);

  // 8. FOOTER (Aligned with grid boundaries inside safe margins)
  drawFooter(ctx, stats, width, height, layout);

  // 9. Save and return buffer
  const buffer = canvas.toBuffer("image/png");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);
  console.log(`[drawHit] Saved wide horizontal card to: ${outputPath}`);

  return buffer;
}

module.exports = {
  makeCard,
  generateHitCard: makeCard,
  fetchPlayerRank,
  obscureUsername,
  loadBackgrounds,
  selectBackground,
  drawImageCover,
  drawBackground,
  drawCharacter,
  drawIdentity,
  drawPrimaryStats,
  drawDonutStat,
  drawDonutStats,
  drawSecondaryStats,
  drawFooter,
  computeLayout,
  DESIGN,
  RANK_CONFIG,
  fitText,
  fitFontSize,
  drawPanel,
  drawCard
};

// Self-test runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetUser = args[0] || "Technoblade";
  const dummyStats = {
    username: targetUser,
    rank: args[1] || "PIG+++",
    networth: args[2] || "$15,450,000,000",
    bedwars: args[3] || "1250",
    networkLevel: "480",
    sbLevel: "420",
    duelKDR: "12.50",
    duelWinstreak: "150",
    plusColour: "Aqua",
    gifted: "50",
    debugBackground: true
  };

  const testFile = path.join(__dirname, `../../test_output.png`);
  makeCard(dummyStats, testFile).then(() => {
    console.log(`\n✨ Test wide player card created: ${testFile}`);
  }).catch(console.error);
}