const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { launchVisiblePowerShell } = require("../dist-electron/main/visible-powershell.js");

const root = mkdtempSync(join(tmpdir(), "creature-terminal-"));
const scriptPath = join(root, "visible-terminal-probe.ps1");
const markerPath = join(root, "terminal-opened.txt");
writeFileSync(
  scriptPath,
  "$marker = $env:CREATURE_COMPANION_TERMINAL_MARKER\nSet-Content -LiteralPath $marker -Value 'opened'\nexit 0\n",
);

const waitForMarker = async () => {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (existsSync(markerPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The visible PowerShell child did not execute.");
};

const removeProbe = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
};

(async () => {
  try {
    const pid = launchVisiblePowerShell(scriptPath, root, [], { CREATURE_COMPANION_TERMINAL_MARKER: markerPath }, false);
    assert.ok(pid > 0);
    await waitForMarker();
    console.log("Visible terminal smoke test passed.");
  } finally {
    await removeProbe();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
