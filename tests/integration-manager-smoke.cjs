const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { IntegrationManager } = require("../dist-electron/main/integration-manager.js");

const root = mkdtempSync(join(tmpdir(), "creature-onboarding-"));
const home = join(root, "home");
const appPath = join(root, "app");
mkdirSync(join(appPath, "scripts"), { recursive: true });
mkdirSync(join(home, ".claude"), { recursive: true });
mkdirSync(join(home, ".codex"), { recursive: true });
writeFileSync(join(appPath, "scripts", "companion-hook.ps1"), "exit 0\n");
writeFileSync(join(appPath, "scripts", "claude-statusline.ps1"), "exit 0\n");

const claudePath = join(home, ".claude", "settings.json");
const codexPath = join(home, ".codex", "hooks.json");
writeFileSync(
  claudePath,
  JSON.stringify({ theme: "dark", hooks: { SessionStart: [{ hooks: [{ type: "command", command: "existing-command" }] }] } }, null, 2),
);
writeFileSync(
  codexPath,
  JSON.stringify({ description: "Keep me", hooks: { Stop: [{ hooks: [{ type: "command", command: "existing-stop" }] }] } }, null, 2),
);

try {
  const manager = new IntegrationManager(home, appPath, "");
  const installerScript = readFileSync(join(__dirname, "../scripts/install-codex-cli.ps1"), "utf8");
  const reviewScript = readFileSync(join(__dirname, "../scripts/review-codex-hooks.ps1"), "utf8");
  assert.match(installerScript, /https:\/\/chatgpt\.com\/codex\/install\.ps1/);
  assert.match(reviewScript, /\/hooks/);
  assert.doesNotMatch(reviewScript, /bypass-hook-trust/, "guided onboarding must preserve Codex's explicit trust review");
  assert.equal(manager.install("claude").ok, true);
  const firstClaude = readFileSync(claudePath, "utf8");
  assert.equal(manager.install("claude").ok, true);
  const claude = JSON.parse(readFileSync(claudePath, "utf8"));
  assert.equal(claude.theme, "dark");
  assert.equal(claude.hooks.SessionStart[0].hooks[0].command, "existing-command");
  for (const event of ["SessionStart", "PreToolUse", "PermissionRequest", "PostToolUseFailure", "Stop"]) {
    const commands = claude.hooks[event].flatMap((group) => group.hooks).map((hook) => hook.command);
    assert.equal(commands.filter((command) => command.includes("companion-hook.ps1")).length, 1, `${event} should have one companion hook`);
  }
  assert.match(claude.statusLine.command, /claude-statusline\.ps1/);
  assert.equal(readFileSync(claudePath, "utf8"), firstClaude, "reinstall should be content-idempotent");

  assert.equal(manager.install("codex").ok, true);
  const firstCodex = readFileSync(codexPath, "utf8");
  assert.equal(manager.install("codex").ok, true);
  const codex = JSON.parse(readFileSync(codexPath, "utf8"));
  assert.equal(codex.description, "Keep me");
  assert.equal(codex.hooks.Stop[0].hooks[0].command, "existing-stop");
  for (const event of ["SessionStart", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"]) {
    const commands = codex.hooks[event].flatMap((group) => group.hooks).map((hook) => hook.command);
    assert.equal(commands.filter((command) => command.includes("companion-hook.ps1")).length, 1, `${event} should have one companion hook`);
  }
  assert.equal(readFileSync(codexPath, "utf8"), firstCodex, "reinstall should be content-idempotent");
  const verifiedCodex = manager.getState({ codex: 1234 }).providers.find((provider) => provider.provider === "codex");
  assert.equal(verifiedCodex.verified, true);
  assert.equal(verifiedCodex.lastEventAt, 1234);
  assert.equal(verifiedCodex.requiresTrust, false, "a real Codex event proves the hook trust gate was passed");

  writeFileSync(codexPath, "{not valid json");
  const invalidBefore = readFileSync(codexPath, "utf8");
  const invalidResult = manager.install("codex");
  assert.equal(invalidResult.ok, false);
  assert.equal(readFileSync(codexPath, "utf8"), invalidBefore, "invalid configuration must not be modified");
  console.log("Integration manager smoke test passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
