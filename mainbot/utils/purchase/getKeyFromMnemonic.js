const bip39 = require("bip39");
const bitcoin = require("bitcoinjs-lib");
const litecore = require("bitcore-lib-ltc");
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');

// Initialize bip32 with secp256k1
const bip32 = BIP32Factory(ecc);

// Network configuration
const litecoinNetwork = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

module.exports = (mnemonic) => {
    try {
        // Validate mnemonic first
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error("Invalid mnemonic phrase");
        }

        // Generate seed from mnemonic
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        
        // Derive root key from seed using Litecoin network params
        const root = bip32.fromSeed(seed, litecoinNetwork);
        
        // Derive child key (LTC path: m/44'/2'/0'/0/0)
        const path = "m/44'/2'/0'/0/0";
        const child = root.derivePath(path);
        
        // Ensure private key material exists
        if (!child || !child.privateKey) {
            throw new Error("Failed to derive private key from seed");
        }

        // Convert Buffer to hex string for bitcore consumption
        const privHex = child.privateKey.toString('hex');

        // Create a bitcore PrivateKey from hex and explicit network
        const privateKey = new litecore.PrivateKey(privHex, litecore.Networks.livenet);

        // Validate the key (bitcore expects a hex/string input for validation)
        if (!litecore.PrivateKey.isValid(privHex)) {
            throw new Error("Invalid private key generated");
        }

        return {
            privateKey: privateKey,
            address: privateKey.toAddress().toString(),
            wif: privateKey.toWIF(),
            success: true
        };
    } catch (error) {
        console.error("Key generation error:", error);
        return {
            message: error.message,
            success: false
        };
    }
};