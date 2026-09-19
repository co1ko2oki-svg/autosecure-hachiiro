/**
 * Deterministic Mock Transport Layer for Microsoft Account Alias subsystem.
 * Simulates Microsoft Live servers in a safe, isolated, memory-only state.
 */

const { normalizeEmail, isSameEmail } = require("../aliasHelper");

class MockMicrosoftServer {
  constructor(initialConfig = {}) {
    this.primaryAlias = normalizeEmail(initialConfig.primaryAlias || "steve@outlook.com");
    this.aliases = new Set(
      (initialConfig.aliases || ["steve@outlook.com", "steve.old@hotmail.com"]).map(normalizeEmail)
    );
    if (this.primaryAlias) {
      this.aliases.add(this.primaryAlias);
    }

    this.tokenCounter = 1;
    this.currentFormCanary = initialConfig.formCanary || "mock_form_canary_v1";
    this.currentApiCanary = initialConfig.apiCanary || "mock_api_canary_v1\\u002btoken";

    this.rateLimited1282 = !!initialConfig.rateLimited1282;
    this.takenEmails = new Set((initialConfig.takenEmails || ["taken@outlook.com"]).map(normalizeEmail));
    this.failAddAssoc = !!initialConfig.failAddAssoc;
    this.isLoggedOut = !!initialConfig.isLoggedOut;
    this.mockDomain = initialConfig.mockDomain || "outlook.com";
    this.failRemove = !!initialConfig.failRemove;
    this.rejectCanary = !!initialConfig.rejectCanary;
    this.failMakePrimaryVerify = !!initialConfig.failMakePrimaryVerify;

    // Security Proofs State
    this.passKeys = Array.isArray(initialConfig.passKeys)
      ? [...initialConfig.passKeys]
      : [{ proofId: "pk_12345", credentialId: "pk_12345", displayName: "Google Password Manager" }];
    this.emailProofs = Array.isArray(initialConfig.emailProofs)
      ? [...initialConfig.emailProofs]
      : [{ proofId: "ep_67890", displayProofName: "recovery@gmail.com", isVerified: 1 }];

    // Specific redirect/error scenarios
    this.redirectScenario = initialConfig.redirectScenario || null; // 'login', 'form_reject', 'challenge', 'state_mismatch', 'timeout', 'business_error_200', 'http429', 'http500', 'malformed'
  }

  rotateTokens() {
    this.tokenCounter++;
    this.currentFormCanary = `mock_form_canary_v${this.tokenCounter}`;
    this.currentApiCanary = `mock_api_canary_v${this.tokenCounter}\\u002btoken`;
  }

  handleGetNamesManage(url, options) {
    if (this.isLoggedOut || this.redirectScenario === "login") {
      return {
        status: 302,
        headers: { location: "https://login.live.com/login.srf" },
        data: "<html><body>Redirecting to login...</body></html>"
      };
    }

    if (this.redirectScenario === "timeout") {
      const err = new Error("connect ETIMEDOUT 204.79.197.200:443");
      err.code = "ETIMEDOUT";
      throw err;
    }

    // Check if GET is requesting confirmation page for Remove / RemoveAlias
    let action = null;
    let targetAlias = null;
    try {
      const parsedUrl = new URL(url);
      action = parsedUrl.searchParams.get("action");
      targetAlias = normalizeEmail(parsedUrl.searchParams.get("aliasName"));
    } catch (e) {}

    if (action === "Remove" || action === "RemoveAlias") {
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        data: `
<!DOCTYPE html>
<html>
<head><title>Are you sure you want to remove this alias?</title></head>
<body>
  <h2>Are you sure you want to remove ${targetAlias || "alias"}?</h2>
  <form action="/names/Manage" method="POST">
    <input type="hidden" name="canary" id="canary" value="${this.currentFormCanary}" />
    <input type="hidden" name="aliasName" value="${targetAlias || ""}" />
    <input type="hidden" name="action" value="Remove" />
    <input type="hidden" name="PostOption" value="Remove" />
    <input type="hidden" name="confirm" value="true" />
    <input type="hidden" name="uaid" value="mock_uaid_confirm" />
    <input type="submit" name="ConfirmRemove" value="Remove" />
  </form>
</body>
</html>
`
      };
    }

    const aliasListJson = Array.from(this.aliases).map((a) => ({
      name: a,
      email: a,
      displayName: a
    }));

    const html = `
<!DOCTYPE html>
<html>
<head><title>Manage your account aliases</title></head>
<body>
  <div id="c_membername">${this.primaryAlias || ""}</div>
  <script>
    var ServerData = {
      "WLXAccount": {
        "apiCanary": "${this.currentApiCanary}",
        "sCanary": "${this.currentFormCanary}",
        "manageNames": {
          "primaryAlias": "${this.primaryAlias || ""}",
          "mxAliases": ${JSON.stringify(aliasListJson)}
        }
      }
    };
  </script>
  <a id="c_add_assoc" href="/AddAssocId">Add email</a>
  <form action="/names/Manage" method="POST">
    <input type="hidden" name="canary" id="canary" value="${this.currentFormCanary}" />
    <table>
      ${Array.from(this.aliases)
        .map((a) =>
          isSameEmail(a, this.primaryAlias)
            ? `<tr><td>${a} (Primary alias)</td></tr>`
            : `<tr><td>${a}</td><td><a href="/names/Manage?action=MakePrimary&aliasName=${encodeURIComponent(a)}">Make Primary</a></td><td><a href="/names/Manage?action=Remove&aliasName=${encodeURIComponent(a)}">Remove</a></td></tr>`
        )
        .join("\n")}
    </table>
  </form>
</body>
</html>
`;

    return {
      status: 200,
      headers: { "content-type": "text/html" },
      data: html
    };
  }

  handleGetAddAssocId(options) {
    if (this.isLoggedOut) {
      return {
        status: 302,
        headers: { location: "https://login.live.com/login.srf" },
        data: ""
      };
    }

    const urlStr = options?.url || (typeof options === "string" ? options : "");
    let errorHtml = "";
    if (urlStr.includes("rate_limited") || this.redirectScenario === "form_reject") {
      errorHtml = '<div id="c_error">Rate limited: You have reached the limit of alias operations.</div>';
    } else if (urlStr.includes("invalid_option")) {
      errorHtml = '<div id="c_error">Invalid form parameters: AddAssocIdOptions invalid.</div>';
    }

    const html = `
<!DOCTYPE html>
<html>
<body>
  ${errorHtml}
  <form action="/AddAssocId" method="POST">
    <input type="hidden" name="canary" id="canary" value="${this.currentFormCanary}" />
    <input type="hidden" name="SingleDomain" value="${this.mockDomain}" />
    <input type="hidden" name="uaid" value="mock_uaid_12345" />
    <input type="hidden" name="uiflvr" value="1001" />
    <input type="hidden" name="scid" value="100109" />
    <input type="hidden" name="hpgid" value="201030" />
    <input type="hidden" name="hpgact" value="0" />
    <input type="radio" name="AddAssocIdOptions" value="LIVE" checked="checked" />
    <input type="text" name="AssociatedIdLive" />
    <input type="submit" name="SubmitYes" id="SubmitYes" value="Add alias" />
  </form>
</body>
</html>
`;
    return {
      status: 200,
      headers: { "content-type": "text/html" },
      data: html
    };
  }

  handlePostMakePrimary(body, headers) {
    if (this.isLoggedOut) {
      return { status: 401, data: { error: { code: "Unauthorized" } } };
    }

    if (this.rateLimited1282) {
      return {
        status: 200,
        data: {
          error: {
            code: "1282",
            message: "We limit how frequently you can change your primary alias."
          }
        }
      };
    }

    const reqCanary = headers?.canary || headers?.Canary;
    const decode = require("../decode");
    const decodedReqCanary = decode(reqCanary);
    const decodedServerCanary = decode(this.currentApiCanary);

    if (!decodedReqCanary || decodedReqCanary !== decodedServerCanary) {
      return {
        status: 400,
        data: { error: { code: "InvalidCanary", message: "The canary token is invalid or stale." } }
      };
    }

    const target = normalizeEmail(body?.aliasName);
    if (!target || !this.aliases.has(target)) {
      return {
        status: 400,
        data: { error: { code: "AliasNotFound", message: "Alias not on account." } }
      };
    }

    if (this.failMakePrimaryVerify) {
      // Simulate server returning HTTP 200 success, but actual backend state was not updated
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        data: {
          success: true,
          apiCanary: this.currentApiCanary
        }
      };
    }

    const oldPrimary = this.primaryAlias;
    this.primaryAlias = target;

    // Support atomic removal if requested
    if (body?.removeOldPrimary && oldPrimary && !isSameEmail(oldPrimary, target)) {
      this.aliases.delete(oldPrimary);
    }

    this.rotateTokens();

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        success: true,
        apiCanary: this.currentApiCanary
      }
    };
  }

  handlePostRemoveAliasJson(body, headers) {
    if (this.isLoggedOut) {
      return { status: 401, data: { error: { code: "Unauthorized" } } };
    }

    const reqCanary = headers?.canary || headers?.Canary;
    const decode = require("../decode");
    const decodedReqCanary = decode(reqCanary);
    const decodedServerCanary = decode(this.currentApiCanary);

    if (this.rejectCanary || this.redirectScenario === "invalid_canary" || !decodedReqCanary || decodedReqCanary !== decodedServerCanary) {
      return {
        status: 400,
        data: { error: { code: "InvalidCanary", message: "The canary token is invalid or stale." } }
      };
    }

    const target = normalizeEmail(body?.aliasName);
    if (!target || !this.aliases.has(target)) {
      return {
        status: 400,
        data: { error: { code: "AliasNotFound", message: "Alias not on account." } }
      };
    }

    if (isSameEmail(target, this.primaryAlias)) {
      return {
        status: 400,
        data: { error: { code: "CannotRemovePrimary", message: "Cannot remove the current primary alias." } }
      };
    }

    if (this.failRemove || this.redirectScenario === "business_error_200") {
      return {
        status: 200,
        data: { error: { code: "1000", message: "Simulated logical mutation rejection." } }
      };
    }

    this.aliases.delete(target);
    this.rotateTokens();

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      data: {
        success: true,
        apiCanary: this.currentApiCanary
      }
    };
  }

  handlePostAddAssocId(body) {
    if (this.isLoggedOut || this.redirectScenario === "login") {
      return { status: 302, headers: { location: "https://login.live.com/login.srf" }, data: "" };
    }

    if (this.redirectScenario === "form_reject") {
      return { status: 302, headers: { location: "https://account.live.com/AddAssocId?error=rate_limited" }, data: "" };
    }

    if (this.redirectScenario === "challenge") {
      return { status: 302, headers: { location: "https://account.live.com/proofs/challenge" }, data: "" };
    }

    const params = new URLSearchParams(typeof body === "string" ? body : "");
    const reqCanary = params.get("canary");
    const postOption = params.get("PostOption");
    const domain = params.get("SingleDomain") || "outlook.com";
    const name = params.get("AssociatedIdLive");
    const addAssocIdOptions = params.get("AddAssocIdOptions");

    if (addAssocIdOptions === "NEW") {
      return {
        status: 302,
        headers: { location: "https://account.live.com/AddAssocId?error=invalid_option" },
        data: ""
      };
    }

    if (reqCanary !== this.currentFormCanary) {
      return {
        status: 200,
        data: "<html><body><div id='c_error'>error_InvalidCanary</div></body></html>"
      };
    }

    if (!name) {
      return {
        status: 200,
        data: "<html><body><div id='c_error'>error_InvalidParameters</div></body></html>"
      };
    }

    const fullEmail = `${name}@${domain}`.toLowerCase();
    if (this.takenEmails.has(fullEmail) || this.failAddAssoc) {
      return {
        status: 200,
        data: "<html><body><div id='c_error'>This email address is already taken</div></body></html>"
      };
    }

    if (this.redirectScenario === "state_mismatch") {
      return {
        status: 302,
        headers: { location: "https://account.live.com/names/Manage" },
        data: ""
      };
    }

    this.aliases.add(fullEmail);
    this.rotateTokens();

    return {
      status: 302,
      headers: { location: "https://account.live.com/names/Manage" },
      data: ""
    };
  }

  handlePostNamesManage(body) {
    if (this.isLoggedOut || this.redirectScenario === "login") {
      return { status: 302, headers: { location: "https://login.live.com/login.srf" }, data: "" };
    }

    if (this.redirectScenario === "timeout") {
      const err = new Error("connect ETIMEDOUT 204.79.197.200:443");
      err.code = "ETIMEDOUT";
      throw err;
    }

    const params = new URLSearchParams(typeof body === "string" ? body : "");
    const reqCanary = params.get("canary");
    const action = params.get("action");
    const postOption = params.get("PostOption");
    const aliasName = normalizeEmail(params.get("aliasName"));

    if (this.redirectScenario === "business_error_200" || this.failRemove) {
      return {
        status: 200,
        data: "<html><body><div id='c_error'>Cannot remove primary alias</div></body></html>"
      };
    }

    if (this.rejectCanary || this.redirectScenario === "invalid_canary" || reqCanary !== this.currentFormCanary) {
      return {
        status: 200,
        data: "<html><body><div id='c_error'>error_InvalidCanary</div></body></html>"
      };
    }

    if (
      action === "Remove" ||
      action === "RemoveAlias" ||
      postOption === "Remove" ||
      postOption === "RemoveAlias"
    ) {
      if (!aliasName || !this.aliases.has(aliasName)) {
        return {
          status: 200,
          data: "<html><body><div id='c_error'>error_AliasNotFound</div></body></html>"
        };
      }
      if (isSameEmail(aliasName, this.primaryAlias)) {
        return {
          status: 200,
          data: "<html><body><div id='c_error'>Cannot remove primary alias</div></body></html>"
        };
      }

      this.aliases.delete(aliasName);
      this.rotateTokens();

      return {
        status: 302,
        headers: { location: "https://account.live.com/names/Manage" },
        data: ""
      };
    }

    if (action === "MakePrimary" || postOption === "MakePrimary") {
      if (!aliasName || !this.aliases.has(aliasName)) {
        return {
          status: 200,
          data: "<html><body><div id='c_error'>error_AliasNotFound</div></body></html>"
        };
      }

      if (this.failMakePrimaryVerify) {
        // Form returns 302 as if successful, but backend state does not change
        return {
          status: 302,
          headers: { location: "https://account.live.com/names/Manage" },
          data: ""
        };
      }

      this.primaryAlias = aliasName;
      this.rotateTokens();

      return {
        status: 302,
        headers: { location: "https://account.live.com/names/Manage" },
        data: ""
      };
    }

    return {
      status: 200,
      data: "<html><body>Unknown action</body></html>"
    };
  }

  requestMock(method, url, options = {}) {
    const normMethod = (method || "GET").toUpperCase();
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    if (this.redirectScenario === "http429") {
      const err = new Error("Request failed with status code 429");
      err.response = { status: 429, data: "Too Many Requests" };
      throw err;
    }

    if (this.redirectScenario === "http500") {
      const err = new Error("Request failed with status code 500");
      err.response = { status: 500, data: "Internal Server Error" };
      throw err;
    }

    if (this.redirectScenario === "malformed") {
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        data: "<<<MALFORMED_UNPARSABLE_BODY>>>"
      };
    }

    if (pathname.includes("/proofs/manage/additional") || pathname.includes("/proofs/manage")) {
      const html = `
<!DOCTYPE html>
<html>
<body>
  <script>
    var t0 = {
      "WLXAccount": {
        "apiCanary": "${this.currentApiCanary}",
        "manageProofs": {
          "passKeys": ${JSON.stringify(this.passKeys)},
          "emailProofs": ${JSON.stringify(this.emailProofs)},
          "smsProofs": [],
          "msAuthApp": []
        }
      }
    };
  </script>
</body>
</html>`;
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        data: html
      };
    }

    if (pathname.includes("/API/Proofs/RemovePasskey")) {
      let body = options.data || options.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (_) {}
      }
      const credId = body?.credentialId;
      this.passKeys = this.passKeys.filter(p => p.proofId !== credId && p.credentialId !== credId);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        data: { success: true, apiCanary: this.currentApiCanary }
      };
    }

    if (pathname.includes("/API/Proofs/DeleteProof")) {
      let body = options.data || options.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (_) {}
      }
      const proofId = body?.proofId;
      this.emailProofs = this.emailProofs.filter(p => p.proofId !== proofId);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        data: { success: true, apiCanary: this.currentApiCanary }
      };
    }

    if (pathname === "/names/Manage" || pathname === "/names/manage") {
      if (normMethod === "GET") {
        return this.handleGetNamesManage(url, options);
      } else if (normMethod === "POST") {
        return this.handlePostNamesManage(options.data || options.body);
      }
    }

    if (pathname === "/AddAssocId" || pathname === "/addassocid") {
      if (normMethod === "GET") {
        return this.handleGetAddAssocId(options);
      } else if (normMethod === "POST") {
        return this.handlePostAddAssocId(options.data || options.body);
      }
    }

    if (pathname === "/API/MakePrimary" || pathname === "/api/makeprimary") {
      if (normMethod === "POST") {
        let body = options.data || options.body;
        if (typeof body === "string") {
          try {
            body = JSON.parse(body);
          } catch (e) {}
        }
        return this.handlePostMakePrimary(body, options.headers);
      }
    }

    if (
      pathname === "/API/RemoveAlias" ||
      pathname === "/api/removealias" ||
      pathname === "/API/DeleteAlias" ||
      pathname === "/api/deletealias"
    ) {
      if (normMethod === "POST") {
        let body = options.data || options.body;
        if (typeof body === "string") {
          try {
            body = JSON.parse(body);
          } catch (e) {}
        }
        return this.handlePostRemoveAliasJson(body, options.headers);
      }
    }

    return {
      status: 404,
      data: `Not Found: ${normMethod} ${url}`
    };
  }
}

function createMockHttpClient(serverInstance) {
  const server = serverInstance || new MockMicrosoftServer();
  const HttpClient = require("../../process/HttpClient");
  const client = new HttpClient();

  client.axios = {
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} }
    }
  };

  client.get = async (url, config = {}) => {
    return server.requestMock("GET", url, config);
  };

  client.post = async (url, data, config = {}) => {
    return server.requestMock("POST", url, { ...config, data });
  };

  client.server = server;
  return client;
}

module.exports = {
  MockMicrosoftServer,
  createMockHttpClient
};
