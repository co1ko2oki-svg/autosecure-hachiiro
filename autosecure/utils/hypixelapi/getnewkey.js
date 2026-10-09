const axios = require('axios');
const config = require("../../../config.json");
const { autosecurelogs } = require('../embeds/autosecurelogs');
const ip = config.vpsip2;







async function getnewkey(queryParams) {
  console.log(`Getting a new key is deprecated, use /admin config to set your Lifetime Hypixel API KEY!`)
  return;





      if (config.novps === true || config.novps === "true") {
        // console.log(`Developer mode, returning!`)
          return;
      }


    await autosecurelogs(null, "refreshkey")

  let existing = await queryParams(`SELECT * FROM apikey WHERE id = ?`, [1]);
  existing = existing[0];

  // Already started check
  if (existing && (existing.status === 1 || existing.status === "1")) {
    return;
  }

  console.log(`Getting a new key!`)

  await setnew(queryParams)  

  try {
    let success = await startapi();
    console.log(`Sent appeal request!`)
    return success;
  } catch (err) {
    console.error(err);
  }
}

async function setnew(queryParams) { 
  const existing = await queryParams(`SELECT * FROM apikey WHERE id = ?`, [1]);

  if (!existing || existing.length === 0) {
    await queryParams(
      `INSERT INTO apikey (id, apikey, status, time) VALUES (?, ?, ?, ?)`,
      [1, null, 1, null]
    );
  }
}

async function startapi() {
  const authKey = process.env.AUTH_KEY || config.authkey;
  const protocol = process.env.VPS_PROTOCOL || 'http';
  const url = `${protocol}://${ip}:8080/refreshkey`;
  const headers = {
    key: authKey
  };

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(url, null, { headers, timeout: 5000 });
      if (response.data && response.data.success === true) {
        return true; 
      }
    } catch (err) {
      console.log(`[getnewkey] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

module.exports = {
    getnewkey
}