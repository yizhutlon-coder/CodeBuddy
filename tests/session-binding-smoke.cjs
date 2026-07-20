const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { CompanionStore } = require("../dist-electron/main/store.js");
const { SessionRegistry } = require("../dist-electron/main/session-registry.js");

const root = mkdtempSync(join(tmpdir(), "creature-binding-"));
try {
  const store = new CompanionStore(root);
  const registry = new SessionRegistry(store, { url: "http://127.0.0.1/test", token: "test", configPath: "test" });
  const profile = {
    assistantRole: "Primary implementer",
    userRole: "Product owner",
    knowledgeLevel: "Comfortable",
    focuses: ["Correctness"],
    contract: "A test session contract",
  };
  const pending = registry.create({ provider: "claude", title: "Bound launch", cwd: root, profile }, "display-1");
  registry.update({ id: pending.id, status: "starting" });

  const connected = registry.ingest({
    provider: "claude",
    event: "SessionStart",
    sessionId: "real-session-id",
    launchId: pending.id,
    cwd: root,
  });
  const sessions = registry.snapshot().sessions;
  assert.equal(sessions.length, 1, "the hook event must claim the placeholder instead of creating a duplicate");
  assert.equal(connected.id, "claude:real-session-id");
  assert.equal(connected.title, "Bound launch");
  assert.deepEqual(connected.profile, profile);
  assert.equal(connected.position.displayId, "display-1");
  assert.equal(connected.status, "idle");

  registry.remove(connected.id);
  const doubleStartOne = registry.ingest({ provider: "claude", event: "SessionStart", sessionId: "claude-main", cwd: root });
  const doubleStartTwo = registry.ingest({ provider: "claude", event: "SessionStart", sessionId: "claude-shadow", cwd: root });
  assert.equal(doubleStartTwo.id, doubleStartOne.id, "rapid Claude double-start IDs must share one canonical creature");
  assert.deepEqual(doubleStartTwo.sourceSessionIds, ["claude:claude-shadow"]);
  const aliasUpdate = registry.ingest({ provider: "claude", event: "PreToolUse", sessionId: "claude-shadow", cwd: root });
  assert.equal(aliasUpdate.id, doubleStartOne.id);
  assert.equal(aliasUpdate.status, "working");
  assert.equal(registry.snapshot().sessions.length, 1);

  registry.remove(doubleStartOne.id);
  const unidentifiedOne = registry.ingest({ provider: "claude", event: "statusline", cwd: root, telemetry: { contextUsedPercent: 10 } });
  const unidentifiedTwo = registry.ingest({ provider: "claude", event: "statusline", cwd: root, telemetry: { contextUsedPercent: 11 } });
  assert.equal(unidentifiedOne.id, unidentifiedTwo.id, "repeated status-line renders without a session ID must be deduplicated");
  assert.equal(registry.snapshot().sessions.length, 1);

  const identified = registry.ingest({ provider: "claude", event: "SessionStart", sessionId: "later-id", cwd: root });
  assert.equal(identified.id, "claude:later-id");
  assert.equal(registry.snapshot().sessions.length, 1, "an identified hook must claim the matching unidentified session");
  store.recordProviderActivity("claude", 4567);
  const reloadedStore = new CompanionStore(root);
  assert.equal(reloadedStore.providerActivity.claude, 4567, "verified provider activity must survive an app restart");
  console.log("Session launch binding smoke test passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
