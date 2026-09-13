const { getEmailDescription } = require("../utils/getEmailDescription");

async function securityInformation(axios) {
  const securityMethodsData = await axios.get('https://account.live.com/proofs/manage/additional', {
    headers: {
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  const secMatch = securityMethodsData?.data?.match(/var\s+t0\s*=\s*({[^;]+})/)?.[1];
  if (!secMatch) {
    console.log(`didn't find any sec data, tf?`);
    return false;
  }

  let obj;
  try {
    obj = JSON.parse(secMatch);
  } catch (e) {
    console.log(`Failed to parse t0 JSON in securityInformation:`, e.message);
    return false;
  }

  const data = obj?.WLXAccount?.manageProofs;
  const firstemail = obj?.displayMemberName || obj?.email;

  const emails = data?.emailProofs || [];
  const passKeys = data?.passKeys || [];
  const unverifiedEmails = emails.filter(e => e.isVerified !== 1);

  if (unverifiedEmails.length > 0) {
    console.log('Found Unverified Emails:', unverifiedEmails.map(e => e.displayProofName));
    const unv = unverifiedEmails[0];
    const secTargetEmail = unv.displayProofName;
    console.log(`[SEC_INFO] Fixing unverified security email: ${secTargetEmail}`);

    const startTime = Date.now();
    try {
      const send = await axios.post(
        'https://account.live.com/API/Proofs/SendOtt',
        {
          actionSpecificNetId: unv.encryptedNetId,
          destination: unv.encryptedProofId,
          proofId: unv.proofId,
          channel: "Email",
          proofCountry: "",
          proofCountryCode: "",
          action: "VerifyProof",
          uiflvr: 1001,
          uaid: "a21cad66e4b04bb8bcd89093468f0bf5",
          scid: 100109,
          hpgid: 201030
        },
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://account.live.com/proofs/manage/additional/',
            'Content-Type': 'application/json; charset=UTF-8',
            'x-ms-apiVersion': '2',
            'x-ms-apiTransport': 'xhr',
            'uiflvr': '1001',
            'scid': '100109',
            'hpgid': '201030',
            'uaid': 'a21cad66e4b04bb8bcd89093468f0bf5',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://account.live.com'
          }
        }
      );

      const sendottcanary = send?.data?.apiCanary;
      if (sendottcanary && secTargetEmail) {
        console.log(`[SEC_INFO] Waiting for verification code sent from MCS to ${secTargetEmail}...`);
        const ottCode = await getEmailDescription(startTime, secTargetEmail, true);
        if (ottCode) {
          console.log(`[SEC_INFO] Received MCS code: ${ottCode}, verifying security email...`);
          try {
            await axios.post(
              'https://account.live.com/API/Proofs/VerifyOtt',
              {
                actionSpecificNetId: unv.encryptedNetId,
                destination: unv.encryptedProofId,
                proofId: unv.proofId,
                ott: ottCode,
                action: "VerifyProof",
                uiflvr: 1001,
                uaid: "a21cad66e4b04bb8bcd89093468f0bf5",
                scid: 100109,
                hpgid: 201030
              },
              {
                headers: {
                  'Content-Type': 'application/json; charset=UTF-8',
                  'canary': sendottcanary,
                  'X-Requested-With': 'XMLHttpRequest'
                }
              }
            );
            console.log(`[SEC_INFO] [✔] Successfully verified security email: ${secTargetEmail}!`);
          } catch (vErr) {
            console.error(`[SEC_INFO] Error during VerifyOtt POST:`, vErr.message);
            if (vErr.response) console.error(`[SEC_INFO] VerifyOtt Response:`, vErr.response.data);
          }
        } else {
          console.error(`[SEC_INFO] Timed out waiting for code on ${secTargetEmail}`);
        }
      }
    } catch (err) {
      console.error(`[SEC_INFO] Error sending OTT to security email:`, err.message);
      if (err.response) console.error(`[SEC_INFO] SendOtt Response:`, err.response.data);
    }
  }

  const sec = {
    email: firstemail,
    netId: data?.encryptedNetId,
    apppasswords: data?.appPassword?.hasAppPassword,
    passKeys: passKeys,
    secoptions: {
      authApp: JSON.stringify(data?.msAuthApp),
      phoneNumbers: JSON.stringify(data?.smsProofs),
      emails: JSON.stringify(emails),
      passKeys: JSON.stringify(passKeys)
    }
  };

  return sec;
}

const decode = require("./decode");
const {
  accountOperationLock,
  accountStateManager,
  logger,
  classifyError,
  ERROR_CODES,
  AppError,
  generateCorrelationId,
  OPERATION_STATES
} = require("./aliasHelper");

const SECURITY_METHOD_TYPES = Object.freeze({
  PASSWORD: "PASSWORD",
  EMAIL: "EMAIL",
  AUTHENTICATOR: "AUTHENTICATOR",
  PASSKEY: "PASSKEY",
  PHONE: "PHONE",
  THIRD_PARTY: "THIRD_PARTY"
});

class SecurityMethod {
  constructor(data = {}) {
    this.id = String(data.id || data.proofId || data.credentialId || "");
    this.type = data.type || SECURITY_METHOD_TYPES.PASSKEY;
    this.displayName = data.displayName || data.displayProofName || data.name || "Unknown Method";
    this.status = data.status || "ACTIVE"; // ACTIVE, PENDING, REVOKED
    this.createdAt = data.createdAt || null;
    this.lastUsedAt = data.lastUsedAt || null;
    this.isPrimary = !!data.isPrimary;
    this.rawProof = data.rawProof || null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      displayName: this.displayName,
      status: this.status,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      isPrimary: this.isPrimary
    };
  }
}

async function getSecurityProofsRaw(axios) {
  const response = await axios.get("https://account.live.com/proofs/manage/additional", {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

  const html = typeof response?.data === "string" ? response.data : JSON.stringify(response?.data || "");
  const secMatch = html.match(/var\s+t0\s*=\s*({[\s\S]*?});\s*(?:var|<\/script>|\n)/i)?.[1] ||
                   html.match(/var\s+ServerData\s*=\s*({[\s\S]*?});\s*(?:var|<\/script>|\n)/i)?.[1];

  if (!secMatch) {
    return { raw: {}, proofs: [] };
  }

  try {
    const parsed = JSON.parse(secMatch);
    const manageProofs = parsed?.WLXAccount?.manageProofs || {};
    const uaid = html.match(/"uaid"\s*:\s*"([^"]+)"/)?.[1] || null;
    const canary = html.match(/"apiCanary"\s*:\s*"([^"]+)"/)?.[1] || null;

    return {
      raw: manageProofs,
      uaid,
      canary: canary ? decode(canary) : null,
      emailProofs: manageProofs.emailProofs || [],
      passKeys: manageProofs.passKeys || [],
      smsProofs: manageProofs.smsProofs || [],
      totpProofs: manageProofs.msAuthApp || [],
      appPasswords: manageProofs.appPassword || null,
      twoStepVerification: manageProofs.tfaEnabled === 1 || manageProofs.tfaEnabled === true
    };
  } catch (_) {
    return { raw: {}, proofs: [] };
  }
}

async function getSecurityMethods(axios, accountId = null) {
  const proofs = await getSecurityProofsRaw(axios);
  const methods = [];

  for (const p of proofs.passKeys || []) {
    methods.push(new SecurityMethod({
      id: p.proofId || p.credentialId,
      type: SECURITY_METHOD_TYPES.PASSKEY,
      displayName: p.displayName || p.displayProofName || "Passkey",
      status: "ACTIVE",
      isPrimary: false,
      rawProof: p
    }));
  }

  for (const e of proofs.emailProofs || []) {
    methods.push(new SecurityMethod({
      id: e.proofId,
      type: SECURITY_METHOD_TYPES.EMAIL,
      displayName: e.displayProofName || e.email || "Email code",
      status: e.isVerified === 1 ? "ACTIVE" : "PENDING",
      isPrimary: false,
      rawProof: e
    }));
  }

  for (const s of proofs.smsProofs || []) {
    methods.push(new SecurityMethod({
      id: s.proofId,
      type: SECURITY_METHOD_TYPES.PHONE,
      displayName: s.displayProofName || s.phoneNumber || "Phone code",
      status: "ACTIVE",
      isPrimary: false,
      rawProof: s
    }));
  }

  for (const a of proofs.totpProofs || []) {
    methods.push(new SecurityMethod({
      id: a.proofId || a.id,
      type: SECURITY_METHOD_TYPES.AUTHENTICATOR,
      displayName: a.name || a.displayName || "Authenticator App",
      status: "ACTIVE",
      isPrimary: false,
      rawProof: a
    }));
  }

  if (accountId) {
    accountStateManager.applyVerifiedState(accountId, {
      securityMethods: methods.map((m) => m.toJSON())
    });
  }

  return methods;
}

async function removeSecurityMethod(axios, accountId, methodId, authorization = {}) {
  const correlationId = generateCorrelationId();
  const opLogger = logger.createChild({
    operation: "REMOVE_SECURITY_METHOD",
    accountId,
    requestId: correlationId
  });

  if (!authorization || authorization.authorized !== true) {
    opLogger.logEvent({
      step: "AUTHORIZATION_CHECK",
      status: "FAILED",
      errorCode: ERROR_CODES.NOT_AUTHORIZED,
      message: `Operation rejected: user authorization not provided for method ${methodId}`
    });
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "Explicit user authorization required to remove security method", {
      operation: "REMOVE_SECURITY_METHOD",
      accountId
    });
  }

  if (!methodId) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Missing methodId", {
      operation: "REMOVE_SECURITY_METHOD",
      accountId
    });
  }

  return await accountOperationLock.withLock(accountId, async () => {
    opLogger.logEvent({
      step: "PRE_MUTATION_FETCH",
      status: "STARTED",
      message: `Fetching security methods before removing ${methodId}`
    });

    accountStateManager.takeSnapshot(accountId);
    const proofs = await getSecurityProofsRaw(axios);
    const currentMethods = await getSecurityMethods(axios, accountId);

    const targetMethod = currentMethods.find((m) => String(m.id) === String(methodId));
    if (!targetMethod) {
      opLogger.logEvent({
        step: "PRE_MUTATION_FETCH",
        status: "NOT_FOUND",
        message: `Target security method ${methodId} not found on account.`
      });
      accountStateManager.rollback(accountId);
      return {
        success: false,
        removedMethodId: methodId,
        state: OPERATION_STATES.FAILED,
        error: "METHOD_NOT_FOUND"
      };
    }

    if (targetMethod.isPrimary) {
      opLogger.logEvent({
        step: "SAFETY_CHECK",
        status: "BLOCKED",
        message: `Cannot remove primary security method ${methodId}`
      });
      accountStateManager.rollback(accountId);
      throw new AppError(ERROR_CODES.CONFLICT, "Cannot remove primary security method", {
        operation: "REMOVE_SECURITY_METHOD",
        accountId
      });
    }

    opLogger.logEvent({
      step: "EXECUTE_MUTATION",
      status: "STARTED",
      message: `Executing targeted deletion of method ${methodId} (${targetMethod.type})`
    });

    let endpoint = "https://account.live.com/API/Proofs/DeleteProof";
    let payload = {
      proofId: targetMethod.id,
      uiflvr: 1001,
      uaid: proofs.uaid || "52f95f10f21d4ad4908874ee8fce281c",
      scid: 100109,
      hpgid: 201030
    };

    if (targetMethod.type === SECURITY_METHOD_TYPES.PASSKEY) {
      endpoint = "https://account.live.com/API/Proofs/RemovePasskey";
      payload = {
        credentialId: targetMethod.id,
        uiflvr: 1001,
        uaid: proofs.uaid || "52f95f10f21d4ad4908874ee8fce281c",
        scid: 100109,
        hpgid: 201030
      };
    }

    let currentCanary = proofs.canary || null;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.post(endpoint, payload, {
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
            ...(currentCanary ? { canary: currentCanary } : {})
          },
          validateStatus: (status) => status >= 200 && status < 500
        });

        const resStatus = response?.status;
        const resData = response?.data;
        const apiErrorCode = resData?.error?.code || resData?.errorCode;

        opLogger.logEvent({
          step: "EXECUTE_MUTATION",
          status: "RESPONSE_RECEIVED",
          message: `[Attempt ${attempt}] ${targetMethod.type} ${methodId} -> ${endpoint} HTTP ${resStatus}${apiErrorCode ? ` error=${apiErrorCode}` : ""}`
        });

        // Detect API-level failures returned as HTTP 200/400
        if (apiErrorCode) {
          const isCanaryError = apiErrorCode === "InvalidCanary" || apiErrorCode === "Unauthorized" || apiErrorCode === "SessionExpired";

          if (isCanaryError && attempt < maxAttempts) {
            opLogger.logEvent({
              step: "EXECUTE_MUTATION",
              status: "RETRY",
              message: `Canary/auth error (${apiErrorCode}), refreshing canary for retry...`
            });
            try {
              const freshProofs = await getSecurityProofsRaw(axios);
              if (freshProofs?.canary) currentCanary = freshProofs.canary;
            } catch (_) {}
            continue;
          }

          // Non-retryable or exhausted retries
          opLogger.logEvent({
            step: "EXECUTE_MUTATION",
            status: "FAILED",
            message: `API rejected deletion of ${targetMethod.type} ${methodId}: ${apiErrorCode} (HTTP ${resStatus})`
          });
          accountStateManager.rollback(accountId);
          return {
            success: false,
            removedMethodId: methodId,
            state: OPERATION_STATES.FAILED,
            error: apiErrorCode
          };
        }

        // HTTP 4xx without a structured error code
        if (resStatus >= 400) {
          opLogger.logEvent({
            step: "EXECUTE_MUTATION",
            status: "FAILED",
            message: `HTTP ${resStatus} without structured error for ${targetMethod.type} ${methodId}`
          });

          if (attempt < maxAttempts) {
            try {
              const freshProofs = await getSecurityProofsRaw(axios);
              if (freshProofs?.canary) currentCanary = freshProofs.canary;
            } catch (_) {}
            continue;
          }

          accountStateManager.rollback(accountId);
          return {
            success: false,
            removedMethodId: methodId,
            state: OPERATION_STATES.FAILED,
            error: `HTTP_${resStatus}`
          };
        }

        // HTTP 2xx/3xx — break out to verification
        break;
      } catch (postErr) {
        opLogger.logEvent({
          step: "EXECUTE_MUTATION",
          status: "FAILED",
          message: `Network error deleting ${targetMethod.type} ${methodId}: ${postErr.message}`
        });
        if (attempt >= maxAttempts) {
          accountStateManager.rollback(accountId);
          throw classifyError(postErr, { operation: "REMOVE_SECURITY_METHOD", accountId });
        }
      }
    }

    opLogger.logEvent({
      step: "VERIFY_MUTATION",
      status: "STARTED",
      message: `Verifying on server that method ${methodId} was removed`
    });

    const afterMethods = await getSecurityMethods(axios, accountId);
    const stillPresent = afterMethods.some((m) => String(m.id) === String(methodId));

    if (stillPresent) {
      opLogger.logEvent({
        step: "VERIFY_MUTATION",
        status: "FAILED",
        errorCode: ERROR_CODES.STATE_MISMATCH,
        message: `Security method ${methodId} is still present on server after deletion request.`
      });
      accountStateManager.rollback(accountId);
      return {
        success: false,
        removedMethodId: methodId,
        state: OPERATION_STATES.FAILED,
        error: "METHOD_STILL_PRESENT"
      };
    }

    opLogger.logEvent({
      step: "VERIFY_MUTATION",
      status: "STATE_VERIFIED",
      message: `Security method ${methodId} successfully verified removed from server.`
    });

    accountStateManager.applyVerifiedState(accountId, {
      securityMethods: afterMethods.map((m) => m.toJSON())
    });
    accountStateManager.commit(accountId);

    return {
      success: true,
      removedMethodId: methodId,
      state: OPERATION_STATES.STATE_VERIFIED,
      remainingCount: afterMethods.length
    };
  });
}

const securityMethodService = {
  getSecurityMethods,
  removeSecurityMethod
};

securityInformation.getSecurityMethods = getSecurityMethods;
securityInformation.removeSecurityMethod = removeSecurityMethod;
securityInformation.SecurityMethod = SecurityMethod;
securityInformation.SECURITY_METHOD_TYPES = SECURITY_METHOD_TYPES;
securityInformation.securityMethodService = securityMethodService;

module.exports = securityInformation;
module.exports.securityInformation = securityInformation;
module.exports.getSecurityMethods = getSecurityMethods;
module.exports.removeSecurityMethod = removeSecurityMethod;
module.exports.SecurityMethod = SecurityMethod;
module.exports.SECURITY_METHOD_TYPES = SECURITY_METHOD_TYPES;
module.exports.securityMethodService = securityMethodService;

