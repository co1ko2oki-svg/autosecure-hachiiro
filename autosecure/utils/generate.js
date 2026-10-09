const crypto = require("crypto");

module.exports = (length = 8) => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  let retVal = "";

  retVal += letters.charAt(crypto.randomInt(0, letters.length));

  for (let i = 1; i < length; ++i) {
    retVal += charset.charAt(crypto.randomInt(0, charset.length));
  }

  return retVal;
};