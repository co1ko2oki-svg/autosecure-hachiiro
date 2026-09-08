/**
 * Comprehensive test suite for the alias subsystem:
 * makePrimary, addAlias, removeAlias, getAliases, aliasses orchestrator.
 *
 * Uses the deterministic MockMicrosoftServer transport layer.
 * Run: node test_alias_subsystem.js
 */

const { MockMicrosoftServer, createMockHttpClient } = require("./autosecure/utils/secure/mock/requestMock");
const getAliases = require("./autosecure/utils/secure/getAliases");
const makePrimary = require("./autosecure/utils/secure/makePrimary");
const addAlias = require("./autosecure/utils/secure/addAlias");
const removeAlias = require("./autosecure/utils/secure/removeAlias");
const { normalizeEmail, isSameEmail, generateCorrelationId } = require("./autosecure/utils/secure/aliasHelper");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail = "") {
  if (condition) {
    passed++;
    console.log(`  \x1b[92m✔ PASS\x1b[0m ${testName}`);
  } else {
    failed++;
    const msg = `  \x1b[91m✖ FAIL\x1b[0m ${testName}${detail ? ` — ${detail}` : ""}`;
    console.log(msg);
    failures.push(testName);
  }
}

// ─── CASE 1: Happy path — change primary A→B, old removed ─────────────────
async function testCase1() {
  console.log("\n--- CASE 1: Happy path A→B, old primary removed ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "old@outlook.com",
    aliases: ["old@outlook.com", "new@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "new@outlook.com", null, 2, null, false, "case1");
  assert(result === true, "makePrimary returns true");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "new@outlook.com"), "Server primary is new@outlook.com");
  assert(state.aliases.some(a => isSameEmail(a, "old@outlook.com")), "Old alias still present (removal is caller responsibility)");
}

// ─── CASE 2: Requested email already exists as alias ───────────────────────
async function testCase2() {
  console.log("\n--- CASE 2: Alias already exists on account ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com", "existing@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "existing@outlook.com", null, 2, null, false, "case2");
  assert(result === true, "makePrimary succeeds for existing alias");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "existing@outlook.com"), "Verified primary changed to existing alias");
}

// ─── CASE 3: Requested email does not exist ────────────────────────────────
async function testCase3() {
  console.log("\n--- CASE 3: Target alias not on account ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "nonexistent@outlook.com", null, 2, null, false, "case3");
  assert(result === false, "makePrimary returns false for missing alias");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "primary@outlook.com"), "Primary unchanged");
}

// ─── CASE 4: MakePrimary request fails (rate limited) ──────────────────────
async function testCase4() {
  console.log("\n--- CASE 4: MakePrimary rate limited (1282) ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com", "target@outlook.com"],
    rateLimited1282: true
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "target@outlook.com", null, 2, null, false, "case4");
  assert(result === false, "makePrimary returns false on rate limit");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "primary@outlook.com"), "Primary unchanged after rate limit");
}

// ─── CASE 5: HTTP 200 success but remote state unchanged ───────────────────
async function testCase5() {
  console.log("\n--- CASE 5: HTTP 200 success but server state NOT changed ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com", "target@outlook.com"],
    failMakePrimaryVerify: true
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "target@outlook.com", null, 2, null, false, "case5");
  assert(result === false, "makePrimary returns false when server state doesn't change");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "primary@outlook.com"), "Primary verified unchanged on server");
}

// ─── CASE 6: New primary succeeds but old primary removal fails ────────────
async function testCase6() {
  console.log("\n--- CASE 6: Primary change succeeds, old removal fails ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "old@outlook.com",
    aliases: ["old@outlook.com", "new@outlook.com"],
    failRemove: true
  });
  const client = createMockHttpClient(server);

  // Change primary first
  const result = await makePrimary(client, "new@outlook.com", null, 2, null, false, "case6");
  assert(result === true, "makePrimary succeeds");

  // Try to remove old primary — should fail because failRemove is set
  let removeResult;
  try {
    removeResult = await removeAlias(client, "old@outlook.com", null, null, null, "case6");
  } catch (e) {
    removeResult = false;
  }
  assert(removeResult === false, "removeAlias returns false when removal fails");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "new@outlook.com"), "Primary is still the new one despite removal failure");
  assert(state.aliases.some(a => isSameEmail(a, "old@outlook.com")), "Old alias still present after failed removal");
}

// ─── CASE 7: Old primary already disappeared ──────────────────────────────
async function testCase7() {
  console.log("\n--- CASE 7: Old primary already absent ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "current@outlook.com",
    aliases: ["current@outlook.com"]
  });
  const client = createMockHttpClient(server);

  // Try removing an alias that doesn't exist
  const result = await removeAlias(client, "gone@outlook.com", null, null, null, "case7");
  assert(result === true, "removeAlias returns true (idempotent) for absent alias");
}

// ─── CASE 8: Old primary == requested new primary ──────────────────────────
async function testCase8() {
  console.log("\n--- CASE 8: Idempotent — target is already primary ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "already@outlook.com",
    aliases: ["already@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "already@outlook.com", null, 2, null, false, "case8");
  assert(result === true, "makePrimary returns true (idempotent)");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "already@outlook.com"), "Primary unchanged");
}

// ─── CASE 9: Email differs only by case/whitespace ─────────────────────────
async function testCase9() {
  console.log("\n--- CASE 9: Case/whitespace normalization ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "user@outlook.com",
    aliases: ["user@outlook.com", "target@outlook.com"]
  });
  const client = createMockHttpClient(server);

  // Mixed case + whitespace
  const result = await makePrimary(client, "  TARGET@Outlook.COM  ", null, 2, null, false, "case9");
  assert(result === true, "makePrimary handles case/whitespace normalization");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "target@outlook.com"), "Primary changed correctly despite case difference");
}

// ─── CASE 10: Multiple aliases exist ───────────────────────────────────────
async function testCase10() {
  console.log("\n--- CASE 10: Multiple aliases on account ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "first@outlook.com",
    aliases: ["first@outlook.com", "second@outlook.com", "third@hotmail.com", "fourth@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "third@hotmail.com", null, 2, null, false, "case10");
  assert(result === true, "makePrimary succeeds with multiple aliases");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "third@hotmail.com"), "Primary is third alias");
  assert(state.aliases.length === 4, `All 4 aliases still present (got ${state.aliases.length})`);
}

// ─── CASE 11: API returns malformed response ───────────────────────────────
async function testCase11() {
  console.log("\n--- CASE 11: Malformed/unparsable API response ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "user@outlook.com",
    aliases: ["user@outlook.com", "target@outlook.com"],
    redirectScenario: "malformed"
  });
  const client = createMockHttpClient(server);

  const result = await makePrimary(client, "target@outlook.com", null, 1, null, false, "case11");
  assert(result === false, "makePrimary returns false on malformed response");
}

// ─── CASE 12: Token/canary is stale ────────────────────────────────────────
async function testCase12() {
  console.log("\n--- CASE 12: Stale canary token ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "user@outlook.com",
    aliases: ["user@outlook.com", "target@outlook.com"]
  });
  const client = createMockHttpClient(server);

  // Pass a deliberately stale canary — makePrimary should refresh internally
  const result = await makePrimary(client, "target@outlook.com", "stale_canary_value", 2, null, false, "case12");
  assert(result === true, "makePrimary recovers from stale canary via internal refresh");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "target@outlook.com"), "Primary changed despite initial stale canary");
}

// ─── CASE 13: Concurrent makePrimary operations (serialized by lock) ───────
async function testCase13() {
  console.log("\n--- CASE 13: Concurrent makePrimary operations ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "first@outlook.com",
    aliases: ["first@outlook.com", "second@outlook.com", "third@outlook.com"]
  });
  const client = createMockHttpClient(server);

  // Launch two concurrent makePrimary for the same account
  const [r1, r2] = await Promise.all([
    makePrimary(client, "second@outlook.com", null, 2, null, false, "case13_account"),
    makePrimary(client, "third@outlook.com", null, 2, null, false, "case13_account")
  ]);

  // At least one should succeed; both should not corrupt state
  assert(r1 === true || r2 === true, "At least one concurrent makePrimary succeeds");

  const state = await getAliases(client);
  const finalPrimary = normalizeEmail(state.primary);
  assert(
    isSameEmail(finalPrimary, "second@outlook.com") || isSameEmail(finalPrimary, "third@outlook.com"),
    `Final primary is one of the requested targets (got ${finalPrimary})`
  );
}

// ─── CASE 14: Retry after partial failure ──────────────────────────────────
async function testCase14() {
  console.log("\n--- CASE 14: Retry after partial failure (session lost then restored) ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "user@outlook.com",
    aliases: ["user@outlook.com", "target@outlook.com"],
    isLoggedOut: true
  });
  const client = createMockHttpClient(server);

  // First attempt will fail due to session loss (401 Unauthorized)
  const result1 = await makePrimary(client, "target@outlook.com", null, 1, null, false, "case14");
  assert(result1 === false, "First attempt fails with session loss");

  // Restore session
  server.isLoggedOut = false;
  const result2 = await makePrimary(client, "target@outlook.com", null, 2, null, false, "case14_retry");
  assert(result2 === true, "Retry succeeds after session restored");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "target@outlook.com"), "Primary changed on retry");
}

// ─── CASE 15: Final verification detects inconsistent state ────────────────
async function testCase15() {
  console.log("\n--- CASE 15: Final verification detects state mismatch ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "user@outlook.com",
    aliases: ["user@outlook.com", "target@outlook.com"],
    failMakePrimaryVerify: true
  });
  const client = createMockHttpClient(server);

  // API returns success: true but doesn't actually change state
  const result = await makePrimary(client, "target@outlook.com", null, 2, null, false, "case15");
  assert(result === false, "makePrimary detects state mismatch and returns false");

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "user@outlook.com"), "Primary verified unchanged — state mismatch caught");
}

// ─── REGRESSION: getAliases extracts primary from isPrimary flag ───────────
async function testGetAliasesPrimaryDetection() {
  console.log("\n--- REGRESSION: getAliases detects primary via isPrimary flag ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com", "secondary@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const state = await getAliases(client);
  assert(isSameEmail(state.primary, "primary@outlook.com"), "Primary detected correctly");
  assert(state.aliases.length >= 2, `At least 2 aliases returned (got ${state.aliases.length})`);
  assert(state.apiCanary !== null, "apiCanary extracted");
  assert(state.formCanary !== null, "formCanary extracted");
}

// ─── REGRESSION: addAlias happy path ───────────────────────────────────────
async function testAddAlias() {
  console.log("\n--- REGRESSION: addAlias happy path ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "user@outlook.com",
    aliases: ["user@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await addAlias(client, "newalias", server.currentFormCanary);
  assert(typeof result === "string" && result.includes("@"), `addAlias returns created email (got ${result})`);

  const state = await getAliases(client);
  assert(state.aliases.length === 2, `Account now has 2 aliases (got ${state.aliases.length})`);
}

// ─── REGRESSION: removeAlias refuses to remove primary ─────────────────────
async function testRemoveAliasPrimaryGuard() {
  console.log("\n--- REGRESSION: removeAlias blocks primary removal ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com", "secondary@outlook.com"]
  });
  const client = createMockHttpClient(server);

  let threw = false;
  try {
    await removeAlias(client, "primary@outlook.com");
  } catch (e) {
    threw = true;
    assert(e.code === "NOT_FOUND" || e.message.includes("primary"), `Throws correct error (${e.code || e.message})`);
  }
  assert(threw, "removeAlias throws when trying to remove primary");
}

// ─── REGRESSION: removeAlias happy path ────────────────────────────────────
async function testRemoveAliasHappy() {
  console.log("\n--- REGRESSION: removeAlias happy path ---");
  const server = new MockMicrosoftServer({
    primaryAlias: "primary@outlook.com",
    aliases: ["primary@outlook.com", "secondary@outlook.com"]
  });
  const client = createMockHttpClient(server);

  const result = await removeAlias(client, "secondary@outlook.com");
  assert(result === true, "removeAlias returns true for secondary");

  const state = await getAliases(client);
  assert(!state.aliases.some(a => isSameEmail(a, "secondary@outlook.com")), "Secondary alias removed from server");
  assert(state.aliases.length === 1, `Only 1 alias remains (got ${state.aliases.length})`);
}

// ─── REGRESSION: normalizeEmail / isSameEmail ──────────────────────────────
function testNormalization() {
  console.log("\n--- REGRESSION: normalizeEmail / isSameEmail ---");
  assert(normalizeEmail("  USER@Outlook.COM  ") === "user@outlook.com", "normalizeEmail trims/lowercases");
  assert(normalizeEmail("<user@outlook.com>") === "user@outlook.com", "normalizeEmail strips angle brackets");
  assert(normalizeEmail('"user@outlook.com"') === "user@outlook.com", "normalizeEmail strips quotes");
  assert(normalizeEmail(null) === "", "normalizeEmail handles null");
  assert(normalizeEmail("") === "", "normalizeEmail handles empty");
  assert(isSameEmail("USER@Outlook.COM", "user@outlook.com"), "isSameEmail case insensitive");
  assert(!isSameEmail("a@b.com", "c@d.com"), "isSameEmail different emails");
  assert(!isSameEmail("", "a@b.com"), "isSameEmail handles empty");
}

// ─── Run all tests ─────────────────────────────────────────────────────────
async function main() {
  console.log("\n\x1b[1m\x1b[96m═══════════════════════════════════════════════════\x1b[0m");
  console.log("\x1b[1m\x1b[96m  Alias Subsystem Test Suite\x1b[0m");
  console.log("\x1b[1m\x1b[96m═══════════════════════════════════════════════════\x1b[0m");

  testNormalization();
  await testGetAliasesPrimaryDetection();
  await testAddAlias();
  await testRemoveAliasPrimaryGuard();
  await testRemoveAliasHappy();
  await testCase1();
  await testCase2();
  await testCase3();
  await testCase4();
  await testCase5();
  await testCase6();
  await testCase7();
  await testCase8();
  await testCase9();
  await testCase10();
  await testCase11();
  await testCase12();
  await testCase13();
  await testCase14();
  await testCase15();

  console.log("\n\x1b[1m\x1b[96m═══════════════════════════════════════════════════\x1b[0m");
  console.log(`\x1b[1m  Results: \x1b[92m${passed} passed\x1b[0m, \x1b[91m${failed} failed\x1b[0m`);
  if (failures.length > 0) {
    console.log(`\x1b[91m  Failed: ${failures.join(", ")}\x1b[0m`);
  }
  console.log("\x1b[1m\x1b[96m═══════════════════════════════════════════════════\x1b[0m\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\x1b[91mTest suite crashed:\x1b[0m", err);
  process.exit(1);
});
