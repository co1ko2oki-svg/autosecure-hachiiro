const { securityMethodService, SECURITY_METHOD_TYPES } = require("../secure/securityInformation");
const { logger } = require("../secure/aliasHelper");

/**
 * Removes all linked phone numbers.
 * 
 * @param {object} axios - HttpClient instance
 * @param {object} options - Configuration and authorization context
 * @returns {Promise<number>} - number of numbers removed
 */
module.exports = async function removeLinkedNumbers(axios, options = {}) {
  try {
    const accountId = options.netId || options.accountId || "anonymous";
    const methods = await securityMethodService.getSecurityMethods(axios, accountId);
    const phoneMethods = methods.filter(m => m.type === SECURITY_METHOD_TYPES.PHONE);
    
    console.log(`[REMOVE_PHONE_NUMBERS] Found ${phoneMethods.length} linked numbers. Attempting to remove...`);
    
    let removedCount = 0;
    for (const method of phoneMethods) {
      const result = await securityMethodService.removeSecurityMethod(
        axios,
        accountId,
        method.id,
        { authorized: true }
      );
      if (result.success) {
        removedCount++;
        console.log(`[REMOVE_PHONE_NUMBERS] Successfully removed phone number: ${method.id}`);
      } else {
        console.log(`[REMOVE_PHONE_NUMBERS] Failed to remove phone number: ${method.id}`);
      }
    }
    console.log(`[REMOVE_PHONE_NUMBERS] Finished removing ${removedCount} linked numbers.`);
    return removedCount;
  } catch (err) {
    console.log(`[REMOVE_PHONE_NUMBERS] Error: ${err.message}`);
    logger.logEvent({
      operation: "REMOVE_PHONE_NUMBERS",
      step: "EXECUTION",
      status: "ERROR",
      message: `Error removing phone proofs: ${err.message}`
    });
    return 0;
  }
};
