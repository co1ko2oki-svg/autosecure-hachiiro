const crypto = require("crypto");

// Fallback: Generate standard TOTP code using Node.js crypto module (100% native)
function base32ToBuffer(base32) {
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let index = 0;
    const output = new Uint8Array(Math.ceil(base32.length * 5 / 8));

    for (let i = 0; i < base32.length; i++) {
        const char = base32.charAt(i).toUpperCase();
        if (char === ' ' || char === '=') continue;

        const val = base32chars.indexOf(char);
        if (val === -1) throw new Error('Invalid base32 character');

        value = (value << 5) | val;
        bits += 5;

        if (bits >= 8) {
            output[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }
    return Buffer.from(output.buffer, output.byteOffset, index);
}

function getLocalTotp(secret) {
    const key = base32ToBuffer(secret);
    const epoch = Math.floor(Date.now() / 1000);
    const time = Buffer.alloc(8);

    const counter = Math.floor(epoch / 30);
    time.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    time.writeUInt32BE(counter & 0xffffffff, 4);

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(time);
    const result = hmac.digest();

    const offset = result[result.length - 1] & 0xf;
    let code = (
        ((result[offset] & 0x7f) << 24) |
        ((result[offset + 1] & 0xff) << 16) |
        ((result[offset + 2] & 0xff) << 8) |
        (result[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

async function generateotp(secretKey) {
    try {
        const formattedSecret = secretKey.replace(/[\s=]+/g, "").toUpperCase();

        if (!/^[A-Z2-7]+$/.test(formattedSecret)) {
            console.log(`[TOTP] Not a valid base32 secret key`);
            return null;
        }

        const otp = getLocalTotp(formattedSecret);
        return { otp, nextResetEpoch: Date.now() + 30000 };
    } catch (error) {
        console.error("[TOTP] Generation Error:", error.message);
        return null;
    }
}

module.exports = generateotp;
