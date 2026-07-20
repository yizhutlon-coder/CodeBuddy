const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { PassThrough, Writable } = require("node:stream");
const { CodexDesktopLauncher } = require("../dist-electron/main/codex-desktop-launcher.js");

const root = mkdtempSync(join(tmpdir(), "creature-codex-desktop-"));
const messages = [];
let spawnCall;

const spawnAppServer = (command, args, options) => {
  const child = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let buffer = "";
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        messages.push(message);
        if (message.method === "initialize") {
          stdout.write(`${JSON.stringify({ id: message.id, result: { codexHome: options.env.CODEX_HOME } })}\n`);
        } else if (message.method === "thread/start") {
          stdout.write(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread-desktop-123" } } })}\n`);
        } else if (message.method === "thread/name/set" || message.method === "thread/unsubscribe") {
          stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        }
      }
      callback();
    },
    final(callback) {
      child.exitCode = 0;
      process.nextTick(() => child.emit("exit", 0));
      callback();
    },
  });
  Object.assign(child, {
    stdout,
    stderr,
    stdin,
    exitCode: null,
    kill() {
      this.exitCode = 0;
      this.emit("exit", 0);
      return true;
    },
  });
  spawnCall = { command, args, options };
  return child;
};

(async () => {
  try {
    const integrations = { findExecutable: () => "C:\\Codex\\codex.exe" };
    const launcher = new CodexDesktopLauncher(integrations, root, "0.1.0-test", spawnAppServer);
    const result = await launcher.createThread(
      {
        provider: "codex",
        title: "Desktop creature",
        cwd: root,
        profile: { contract: "Persist this session contract" },
      },
      "pending-creature-id",
    );

    assert.equal(result.threadId, "thread-desktop-123");
    assert.equal(result.deepLink, "codex://threads/thread-desktop-123");
    assert.equal(spawnCall.command, "C:\\Codex\\codex.exe");
    assert.deepEqual(spawnCall.args, ["app-server"]);
    assert.equal(spawnCall.options.cwd, root);
    assert.equal(spawnCall.options.env.CODEX_HOME, join(root, ".codex"));
    assert.equal(existsSync(join(root, ".codex")), true, "a fresh Codex home should be created before App Server starts");
    assert.equal(spawnCall.options.env.CREATURE_COMPANION_LAUNCH_ID, "pending-creature-id");
    assert.deepEqual(
      messages.map((message) => message.method),
      ["initialize", "initialized", "thread/start", "thread/name/set", "thread/unsubscribe"],
    );
    assert.equal(messages[0].params.clientInfo.name, "creature_companion");
    assert.equal(messages[2].params.cwd, root);
    assert.equal(messages[2].params.serviceName, "creature_companion");
    assert.equal(messages[2].params.developerInstructions, "Persist this session contract");
    assert.deepEqual(messages[3].params, { threadId: "thread-desktop-123", name: "Desktop creature" });
    console.log("Codex Desktop launcher smoke test passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
