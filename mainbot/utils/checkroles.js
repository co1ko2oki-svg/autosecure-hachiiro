const config = require("../../config.json");

module.exports = async function checkroles(client) {
 // console.log(`Checking roles!`)
  const currentTime = Date.now();
  const activeLicenses = await client.queryParams(
    "SELECT * FROM usedLicenses WHERE CAST(expiry AS INTEGER) > ?",
    [currentTime]
  );

  let rolesAssigned = 0;
  let rolesRemoved = 0;
  let ownerRolesAssigned = 0;
  let ownerRolesRemoved = 0;

  let guild;
  try {
    guild = await client.guilds.fetch(config.guildid);
    if (!guild) return;
  } catch {
    return;
  }

  let membersWithRole;
  try {
    membersWithRole = await guild.members.fetch({ time: 10000 });
  } catch {
    membersWithRole = guild.members.cache;
  }

  const activeUserSet = new Set((activeLicenses || []).map(license => license.user_id));

  for (const [userId, member] of membersWithRole) {
    const hasActiveLicense = activeUserSet.has(userId);
    
    if (!hasActiveLicense && member.roles.cache.has(config.roleid)) {
      try {
        await member.roles.remove(config.roleid);
        rolesRemoved++;
      } catch {}
    }

    if (config.ownerrole && !config.owners.includes(userId) && member.roles.cache.has(config.ownerrole)) {
      try {
        await member.roles.remove(config.ownerrole);
        ownerRolesRemoved++;
      } catch {}
    }
  }

  for (const license of activeLicenses) {
    const userId = license.user_id;

    try {
      const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);

      if (member && !member.roles.cache.has(config.roleid)) {
        await member.roles.add(config.roleid);
        rolesAssigned++;
      }
    } catch {}
  }

  if (config.ownerrole) {
    for (const ownerId of config.owners) {
      try {
        const member = guild.members.cache.get(ownerId) || await guild.members.fetch(ownerId).catch(() => null);

        if (member && !member.roles.cache.has(config.ownerrole)) {
          await member.roles.add(config.ownerrole);
          ownerRolesAssigned++;
        }
      } catch {}
    }
  }

  return {
    rolesAssigned,
    rolesRemoved,
    ownerRolesAssigned,
    ownerRolesRemoved
  };
};
