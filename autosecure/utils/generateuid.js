const crypto = require("crypto");

async function generateuid() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 9; i++) {
        const randomIndex = crypto.randomInt(0, characters.length);
        uid += characters[randomIndex];
    }
    return uid;
}

module.exports = generateuid;
