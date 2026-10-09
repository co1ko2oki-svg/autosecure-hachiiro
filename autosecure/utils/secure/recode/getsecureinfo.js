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

    // If user has a specific domain configured in settings, use it; otherwise randomize among 4 domains
    const targetDomain = settings?.domain ? String(settings.domain).toLowerCase() : null;

    const result = await createSecurityMailbox({
        prefix: uniquePrefix,
        domain: targetDomain,
        password: password
    });

    const secEmail = result.email;
    return { secEmail, password };
};
