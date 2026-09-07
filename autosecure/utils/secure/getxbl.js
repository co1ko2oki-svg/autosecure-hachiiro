const xbl = require('../minecraft/xbl');

module.exports = async (loginCookie) => {
    return await xbl(loginCookie);
};