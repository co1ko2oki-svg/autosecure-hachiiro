const generate = require("../../generate");
const { prefix: defaultPrefix } = require("../../../../config.json");
const { createSecurityMailbox } = require("../../emails/mailApiClient");

/**
 * Generate security credentials for autosecuring an account.
 * Randomly selects 1 of the 4 active domains and registers the mailbox via Mail API.
 */
module.exports = async function getsecureinfo(settings) {
    const rawPrefix = defaultPrefix || "vinGr0up";
    const prefix = String(rawPrefix).toLowerCase();
    const uniquePrefix = `${prefix}${generate(8).toLowerCase()}`;
    const password = generate(16);

    // If user selected a specific valid domain, use it; if 'Rotate (4 Domains)' or 'thapcamstore', rotate across the 4 domains
    let targetDomain = null;
    if (settings?.domain) {
        const d = String(settings.domain).toLowerCase().trim();
        if (!d.includes("rotate") && !d.includes("thapcamstore") && !d.includes("xoay")) {
            targetDomain = d;
        }
    }

    const result = await createSecurityMailbox({
        prefix: uniquePrefix,
        domain: targetDomain,
        password: password
    });

    const secEmail = result.email;
    return { secEmail, password };
};
