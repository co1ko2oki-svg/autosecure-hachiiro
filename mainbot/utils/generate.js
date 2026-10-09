const crypto = require("crypto");

module.exports = (length = 8) => {
  let charset = "abcdefghijklmnopqrstuvwxyz0123456789",
    retVal = "";

  // Generate the first character as a letter
  retVal += "abcdefghijklmnopqrstuvwxyz".charAt(crypto.randomInt(0, 26));

  // Generate the rest of the characters
  for (let i = 1, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(crypto.randomInt(0, n));
  }

  return retVal;
};