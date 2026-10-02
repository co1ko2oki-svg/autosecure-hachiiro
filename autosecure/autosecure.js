const discord = require("discord.js");
const eventHandler = require("./Handlers/eventHandler");
const { queryParams } = require("../db/database.js");
const { ActivityType } = require("discord.js");
const { tablesbotnumber, tablesclientid } = require("../db/gettablesarray.js");

module.exports = async (token, username, d = 1, dmmode = false) => {
try {
    const clientOptions = {
      intents: [
        discord.GatewayIntentBits.Guilds,
        ...(dmmode ? [
          discord.GatewayIntentBits.DirectMessages,
          discord.GatewayIntentBits.MessageContent,
          discord.GatewayIntentBits.GuildMessages
        ] : [])
      ],
      partials: dmmode ? [
        discord.Partials.Channel 
      ] : []
    };

    /*
    Initialize Client with new botnumber
    */
    const client = new discord.Client(clientOptions);
    client.username = username;
    client.botnumber = d; 
    client.isuserbot = true;



/*
    Multiple botfix (adds bot slot for every sql argument)
*/

client.queryParams = async (query, params = [], method = "all") => {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim();
  const command = normalizedQuery.split(' ')[0].toUpperCase();
  let table = null;
  if (command === "SELECT" || command === "DELETE") {
    const fromMatch = normalizedQuery.match(/FROM\s+([^\s(,;]+)/i);
    table = fromMatch ? fromMatch[1].replace(/[`"'[\]]/g, "") : null;
  } 
  else if (command === "UPDATE") {
    const updateMatch = normalizedQuery.match(/UPDATE\s+([^\s(,;]+)/i);
    table = updateMatch ? updateMatch[1].replace(/[`"'[\]]/g, "") : null;
  }
  else if (command === "INSERT") {
    const insertMatch = normalizedQuery.match(/INSERT\s+INTO\s+([^\s(,;]+)/i);
    table = insertMatch ? insertMatch[1].replace(/[`"'[\]]/g, "") : null;
  }

  const allowed = tablesbotnumber();
  const needsBotNumber = table && allowed.includes(table);

  if (needsBotNumber) {
    const isClientIdTable = tablesclientid().includes(table);
    const tenantCol = isClientIdTable ? 'client_id' : 'user_id';
    const tenantVal = client.username;

    if (command === "INSERT") {
      const valuesIndex = normalizedQuery.toUpperCase().indexOf('VALUES');
      if (valuesIndex > -1) {
        const beforeValues = query.substring(0, valuesIndex);
        const afterValues = query.substring(valuesIndex);
        const columnsMatch = beforeValues.match(/\(([^)]+)\)/);
        if (columnsMatch) {
          const cols = columnsMatch[1];
          const hasBotNumber = /\bbotnumber\b/i.test(cols);
          const hasTenant = new RegExp(`\\b${tenantCol}\\b`, 'i').test(cols);

          let addedCols = [];
          let addedParams = [];
          if (!hasBotNumber) {
            addedCols.push('botnumber');
            addedParams.push(client.botnumber);
          }
          if (!hasTenant) {
            addedCols.push(tenantCol);
            addedParams.push(tenantVal);
          }

          if (addedCols.length > 0) {
            const newBeforeValues = beforeValues.replace(
              `(${cols})`, 
              `(${cols}, ${addedCols.join(', ')})`
            );
            const valuesMatch = afterValues.match(/\(([^)]*)\)/);
            if (valuesMatch) {
              const extraPlaceholders = addedCols.map(() => '?').join(', ');
              const newAfterValues = afterValues.replace(
                `(${valuesMatch[1]})`, 
                `(${valuesMatch[1]}, ${extraPlaceholders})`
              );
              query = newBeforeValues + newAfterValues;
              params.push(...addedParams);
            }
          }
        }
      }
    }
    else if (command === "UPDATE") {
      const whereIndex = normalizedQuery.toUpperCase().indexOf('WHERE');
      if (whereIndex > -1) {
        const whereClause = query.substring(whereIndex + 5);
        const hasBotNumber = /\bbotnumber\b/i.test(whereClause);
        const hasTenant = new RegExp(`\\b${tenantCol}\\b`, 'i').test(whereClause);
        let injectSql = '';
        let injectParams = [];
        if (!hasBotNumber) {
          injectSql += ' botnumber = ? AND';
          injectParams.push(client.botnumber);
        }
        if (!hasTenant) {
          injectSql += ` ${tenantCol} = ? AND`;
          injectParams.push(tenantVal);
        }
        if (injectSql) {
          query = query.substring(0, whereIndex + 5) + injectSql + query.substring(whereIndex + 5);
          const setIndex = query.indexOf('SET');
          const numSetParams = setIndex < whereIndex ? query.substring(setIndex + 3, whereIndex).split('?').length - 1 : 0;
          params.splice(numSetParams, 0, ...injectParams);
        }
      } else {
        query += ` WHERE botnumber = ? AND ${tenantCol} = ?`;
        params.push(client.botnumber, tenantVal);
      }
    }
    else {
      const whereIndex = normalizedQuery.toUpperCase().indexOf('WHERE');
      if (whereIndex > -1) {
        const whereClause = query.substring(whereIndex + 5);
        const hasBotNumber = /\bbotnumber\b/i.test(whereClause);
        const hasTenant = new RegExp(`\\b${tenantCol}\\b`, 'i').test(whereClause);
        let injectSql = '';
        let injectParams = [];
        if (!hasBotNumber) {
          injectSql += ' botnumber = ? AND';
          injectParams.push(client.botnumber);
        }
        if (!hasTenant) {
          injectSql += ` ${tenantCol} = ? AND`;
          injectParams.push(tenantVal);
        }
        if (injectSql) {
          query = query.substring(0, whereIndex + 5) + injectSql + query.substring(whereIndex + 5);
          params = [...injectParams, ...params];
        }
      } else {
        query += ` WHERE botnumber = ? AND ${tenantCol} = ?`;
        params.push(client.botnumber, tenantVal);
      }
    }
  }

  // Return edited queryParams
  
  try {
    const result = await queryParams(query, params, method);
    return result;
  } catch (error) {
    console.error(`[Bot ${client.botnumber}] Query error:`, error);
    throw error;
  }
};

    let botRow = await client.queryParams("SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?", [username, client.botnumber]);
    if (!botRow || botRow.length === 0) {
      botRow = await client.queryParams("SELECT * FROM autosecure WHERE user_id = ?", [username]);
    }
    let activityData = null;
    let note = null;
    if (botRow && botRow.length > 0) {
      if (botRow[0].activity) {
        try {
          activityData = typeof botRow[0].activity === 'string' ? JSON.parse(botRow[0].activity) : botRow[0].activity;
        } catch (e) {}
      }
      note = botRow[0].note || null;
    }

    client.once("ready", async () => {
      try {
        const activityMap = {
          "playing": ActivityType.Playing,
          "streaming": ActivityType.Streaming,
          "competing": ActivityType.Competing,
          "listening": ActivityType.Listening,
          "watching": ActivityType.Watching,
        };

        const actType = activityData?.type || activityData?.activity;
        const selectedActivity = actType && activityMap[actType.toLowerCase()] !== undefined ? activityMap[actType.toLowerCase()] : null;
        const activityName = activityData?.text || activityData?.activityData || null;
        const visibility = (activityData?.visibility || 'online').toLowerCase();

        const activities = [];

        if (note && note.trim() !== '') {
          activities.push({
            name: "Custom Status",
            type: ActivityType.Custom,
            state: note.trim()
          });
        }

        if (selectedActivity !== null && activityName) {
          activities.push({
            name: activityName,
            type: selectedActivity,
          });
        }

        await client.user.setPresence({
          activities: activities,
          status: visibility
        });
        console.log(`[Bot ${client.botnumber}] Presence and Custom Status (${note || 'no note'}) updated successfully`);
      } catch (error) {
        console.error(`[Bot ${client.botnumber}] Error setting presence:`, error);
      }
    });

    eventHandler(client, token);
    await client.login(token);
    return client;
} catch (e) {
  if (String(e).includes("[TokenInvalid]")) {
    console.log("Invalid token");
    return;
  }
  console.error("Initialization error:", e);
  return false;
}

};