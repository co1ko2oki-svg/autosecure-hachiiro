const generate = require("../../generate");
const { domains, prefix: defaultPrefix } = require("../../../../config.json");

module.exports = async function getsecureinfo(settings) {
    const rawPrefix = defaultPrefix || "vinGr0up";
    const prefix = String(rawPrefix).toLowerCase();
    const domain = (settings?.domain || domains[0]).toLowerCase();
    const secEmail = `${prefix}${generate(10).toLowerCase()}@${domain}`;
    const password = generate(16);
    return { secEmail, password };
};
