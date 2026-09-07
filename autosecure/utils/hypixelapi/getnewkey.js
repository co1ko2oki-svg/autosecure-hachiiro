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
  const url = `http://${ip}:8080/refreshkey`;
  const headers = {
    key: config.authkey
  };

  console.log(`Posting with ${url} and headers: ${JSON.stringify(headers)}`)

  // Infinite loop to refresh key!
  while (true) {
    try {
      const response = await axios.post(url, null, { headers });
      // console.log(`Response getnewkey.js: ${response.data}`)
      if (response.data && response.data.success === true) {
        return true; 
      }
    } catch (err) {
      console.log(`Error getnewkey.js: ${err}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec before retrying
  }
}

module.exports = {
    getnewkey
}