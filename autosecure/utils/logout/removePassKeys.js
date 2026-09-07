const { securityMethodService, SECURITY_METHOD_TYPES } = require("../secure/securityInformation");
const { logger } = require("../secure/aliasHelper");

/**
 * Removes all passkeys.
 * 
 * @param {object} axios - HttpClient instance
 * @param {object} options - Configuration and authorization context
 * @returns {Promise<number>} - number of passkeys removed
 */
module.exports = async function removePassKeys(axios, options = {}) {
  try {
    const accountId = options.netId || options.accountId || "anonymous";
    const methods = await securityMethodService.getSecurityMethods(axios, accountId);
    const passkeyMethods = methods.filter(m => m.type === SECURITY_METHOD_TYPES.PASSKEY);
    
    console.log(`[REMOVE_PASSKEYS] Found ${passkeyMethods.length} passkeys. Attempting to remove...`);
    
    let removedCount = 0;
    for (const method of passkeyMethods) {
      const result = await securityMethodService.removeSecurityMethod(
        axios,
        accountId,
        method.id,
        { authorized: true }
      );
      if (result.success) {
        removedCount++;
        console.log(`[REMOVE_PASSKEYS] Successfully removed passkey: ${method.id}`);
      } else {
        console.log(`[REMOVE_PASSKEYS] Failed to remove passkey: ${method.id}`);
      }
    }
    console.log(`[REMOVE_PASSKEYS] Finished removing ${removedCount} passkeys.`);
    return removedCount;
  } catch (err) {
    console.log(`[REMOVE_PASSKEYS] Error: ${err.message}`);
    logger.logEvent({
      operation: "REMOVE_PASSKEYS",
      step: "EXECUTION",
      status: "ERROR",
      message: `Error removing passkeys: ${err.message}`
    });
    return 0;
  }
};
