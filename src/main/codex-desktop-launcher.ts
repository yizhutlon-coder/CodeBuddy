import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { CreateSessionInput } from "../shared/types";
import { IntegrationManager } from "./integration-manager";

type SpawnAppServer = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface ThreadStartResult {
  thread?: { id?: string };
}

interface PendingRequest {
  method: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export interface CodexDesktopLaunch {
  threadId: string;
  deepLink: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export class CodexDesktopLauncher {
  constructor(
    private readonly integrations: IntegrationManager,
    private readonly homeDir: string,
    private readonly appVersion: string,
    private readonly spawnAppServer: SpawnAppServer = spawn,
  ) {}

  async createThread(input: CreateSessionInput, launchId: string): Promise<CodexDesktopLaunch> {
    const executable = this.integrations.findExecutable("codex");
    if (!executable) throw new Error("The standalone Codex CLI is required to create a Desktop thread.");

    const cwd = input.cwd?.trim() || process.cwd();
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`Working folder does not exist: ${cwd}`);
    const codexHome = join(this.homeDir, ".codex");
    mkdirSync(codexHome, { recursive: true });

    const child = this.spawnAppServer(executable, ["app-server"], {
      cwd,
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        CREATURE_COMPANION_LAUNCH_ID: launchId,
      },
      windowsHide: true,
    });

    const pending = new Map<number, PendingRequest>();
    const lines = createInterface({ input: child.stdout });
    let nextId = 0;
    let stderr = "";
    let stopped = false;

    const failPending = (error: Error): void => {
      for (const pendingRequest of pending.values()) {
        clearTimeout(pendingRequest.timer);
        pendingRequest.reject(error);
      }
      pending.clear();
    };

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once("error", (error) => failPending(error));
    child.once("exit", (code) => {
      if (!stopped && pending.size > 0) {
        failPending(new Error(stderr.trim() || `Codex App Server exited before completing the request (code ${code ?? "unknown"}).`));
      }
    });

    lines.on("line", (line) => {
      let message: RpcResponse;
      try {
        message = JSON.parse(line) as RpcResponse;
      } catch {
        failPending(new Error(`Codex App Server returned invalid JSON: ${line.slice(0, 200)}`));
        return;
      }
      if (typeof message.id !== "number") return;
      const pendingRequest = pending.get(message.id);
      if (!pendingRequest) return;
      pending.delete(message.id);
      clearTimeout(pendingRequest.timer);
      if (message.error) {
        pendingRequest.reject(
          new Error(`${pendingRequest.method} failed: ${message.error.message ?? `error ${message.error.code ?? "unknown"}`}`),
        );
      } else {
        pendingRequest.resolve(message.result);
      }
    });

    const send = (message: unknown): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const request = <T>(method: string, params: unknown, timeoutMs = 15_000): Promise<T> => {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        timer.unref();
        pending.set(id, { method, resolve: (value) => resolve(value as T), reject, timer });
        send({ method, id, params });
      });
    };

    const stop = async (): Promise<void> => {
      stopped = true;
      failPending(new Error("Codex App Server connection closed."));
      lines.close();
      child.stdin.end();
      if (child.exitCode !== null) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) child.kill();
          resolve();
        }, 1_500);
        timer.unref();
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    try {
      await request("initialize", {
        clientInfo: {
          name: "creature_companion",
          title: "Creature Companion",
          version: this.appVersion,
        },
      });
      send({ method: "initialized", params: {} });
      const started = await request<ThreadStartResult>("thread/start", {
        cwd,
        serviceName: "creature_companion",
        developerInstructions: input.profile?.contract || null,
      });
      const threadId = isObject(started.thread) && typeof started.thread.id === "string" ? started.thread.id : undefined;
      if (!threadId) throw new Error("Codex App Server did not return a thread ID.");

      try {
        await request("thread/name/set", { threadId, name: input.title.trim() || "Creature Companion session" }, 3_000);
        await request("thread/unsubscribe", { threadId }, 3_000);
      } catch {
        // The persisted thread still works if optional naming or cleanup is unavailable in an older CLI.
      }

      return { threadId, deepLink: `codex://threads/${encodeURIComponent(threadId)}` };
    } finally {
      await stop();
    }
  }
}
