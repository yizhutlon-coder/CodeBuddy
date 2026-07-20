import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  ConnectableProvider,
  IntegrationResult,
  OnboardingState,
  ProviderActivity,
  ProviderSetupStatus,
} from "../shared/types";

type JsonObject = Record<string, unknown>;

interface HookHandler {
  type: "command";
  command: string;
}

interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
}

const hookEvents = {
  claude: ["SessionStart", "PreToolUse", "PermissionRequest", "PostToolUseFailure", "Stop"],
  codex: ["SessionStart", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"],
} as const;

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

const quoteCommandPath = (value: string): string => `"${value.replaceAll('"', '\\"')}"`;

export class IntegrationManager {
  private readonly claudeConfigPath: string;
  private readonly codexConfigPath: string;
  private readonly hookScriptPath: string;
  private readonly statusLineScriptPath: string;
  private readonly localAppData: string;

  constructor(
    private readonly homeDir: string,
    private readonly appPath: string,
    private readonly pathValue = process.env.PATH ?? "",
    localAppData = process.env.LOCALAPPDATA ?? "",
  ) {
    this.claudeConfigPath = join(homeDir, ".claude", "settings.json");
    this.codexConfigPath = join(homeDir, ".codex", "hooks.json");
    this.hookScriptPath = join(appPath, "scripts", "companion-hook.ps1");
    this.statusLineScriptPath = join(appPath, "scripts", "claude-statusline.ps1");
    this.localAppData = localAppData;
  }

  getState(activity: ProviderActivity = {}): OnboardingState {
    return { providers: [this.inspectProvider("codex", activity), this.inspectProvider("claude", activity)] };
  }

  findExecutable(provider: ConnectableProvider): string | undefined {
    const lookup = process.platform === "win32" ? "where.exe" : "which";
    const result = spawnSync(lookup, [provider], {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PATH: this.pathValue },
      timeout: 4_000,
    });
    const candidates = [
      ...this.defaultExecutablePaths(provider),
      ...(result.status === 0 ? result.stdout : "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    ].filter((candidate, index, values) => values.indexOf(candidate) === index && existsSync(candidate));
    return candidates.find((candidate) => {
      const probe = spawnSync(candidate, ["--version"], {
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, PATH: this.pathValue },
        timeout: 4_000,
      });
      return !probe.error && probe.status === 0;
    });
  }

  install(provider: ConnectableProvider, activity: ProviderActivity = {}): IntegrationResult {
    try {
      if (!existsSync(this.hookScriptPath)) throw new Error(`Bridge script not found at ${this.hookScriptPath}`);
      if (provider === "claude" && !existsSync(this.statusLineScriptPath)) {
        throw new Error(`Status-line script not found at ${this.statusLineScriptPath}`);
      }
      const result = provider === "claude" ? this.installClaude() : this.installCodex();
      return { ok: true, ...result, state: this.getState(activity) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Integration setup failed",
        state: this.getState(activity),
      };
    }
  }

  private inspectProvider(provider: ConnectableProvider, activity: ProviderActivity): ProviderSetupStatus {
    const executablePath = this.findExecutable(provider);
    const configPath = provider === "claude" ? this.claudeConfigPath : this.codexConfigPath;
    let configured = false;
    let telemetryConfigured = provider === "codex";
    let warning: string | undefined;
    const lastEventAt = activity[provider];
    const verified = typeof lastEventAt === "number";
    try {
      const config = this.readJson(configPath);
      const hooks = provider === "claude" ? config.hooks : isObject(config.hooks) ? config.hooks : {};
      configured = hookEvents[provider].every((event) => this.hasCompanionHook(hooks, event));
      if (provider === "claude") {
        const statusLine = isObject(config.statusLine) ? config.statusLine : undefined;
        const command = typeof statusLine?.command === "string" ? statusLine.command : "";
        telemetryConfigured = command.includes("claude-statusline.ps1");
        if (statusLine && command && !telemetryConfigured) {
          warning = "Existing Claude status line preserved; lifecycle is automatic, but companion telemetry needs manual combination.";
        }
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : "Configuration could not be inspected";
    }
    return {
      provider,
      displayName: provider === "claude" ? "Claude Code" : "Codex",
      hostDetected: this.detectHost(provider, Boolean(executablePath)),
      installed: Boolean(executablePath),
      executablePath,
      configPath,
      configured,
      telemetryConfigured,
      requiresTrust: provider === "codex" && configured && !verified,
      verified,
      lastEventAt,
      warning,
    };
  }

  private defaultExecutablePaths(provider: ConnectableProvider): string[] {
    if (process.platform !== "win32") return [];
    if (provider === "codex") {
      return [join(this.localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe")];
    }
    return [
      join(this.homeDir, ".local", "bin", "claude.exe"),
      join(this.localAppData, "Programs", "Claude", "claude.exe"),
    ];
  }

  private detectHost(provider: ConnectableProvider, cliInstalled: boolean): boolean {
    if (cliInstalled) return true;
    if (process.platform !== "win32" || !this.localAppData) return false;
    const packagesPath = join(this.localAppData, "Packages");
    try {
      const packagePrefix = provider === "codex" ? "OpenAI.Codex_" : "Anthropic.Claude_";
      if (readdirSync(packagesPath).some((name) => name.startsWith(packagePrefix))) return true;
    } catch {
      // Package discovery is best-effort; restricted package folders are common.
    }
    const programCandidates =
      provider === "codex"
        ? [join(this.localAppData, "Programs", "OpenAI", "Codex")]
        : [join(this.localAppData, "Programs", "Claude"), join(this.localAppData, "AnthropicClaude")];
    return programCandidates.some((path) => existsSync(path));
  }

  private installClaude(): { message: string; backupPath?: string } {
    const config = this.readJson(this.claudeConfigPath);
    const hooks = isObject(config.hooks) ? config.hooks : {};
    const command = this.hookCommand("claude");
    for (const event of hookEvents.claude) this.addHook(hooks, event, command);
    config.hooks = hooks;

    const existingStatusLine = isObject(config.statusLine) ? config.statusLine : undefined;
    const existingCommand = typeof existingStatusLine?.command === "string" ? existingStatusLine.command : "";
    let telemetryNote = " Exact context and limit telemetry was enabled.";
    if (!existingCommand || existingCommand.includes("claude-statusline.ps1")) {
      config.statusLine = {
        type: "command",
        command: `powershell -NoProfile -ExecutionPolicy Bypass -File ${quoteCommandPath(this.statusLineScriptPath)}`,
      };
    } else {
      telemetryNote = " Your existing status line was preserved, so lifecycle is connected but telemetry still needs manual combination.";
    }

    const backupPath = this.writeJsonWithBackup(this.claudeConfigPath, config);
    return {
      message: `Claude Code hooks configured. Restart Claude Code so new sessions load them.${telemetryNote}`,
      backupPath,
    };
  }

  private installCodex(): { message: string; backupPath?: string } {
    const config = this.readJson(this.codexConfigPath);
    const hooks = isObject(config.hooks) ? config.hooks : {};
    const command = this.hookCommand("codex");
    for (const event of hookEvents.codex) this.addHook(hooks, event, command);
    config.description = typeof config.description === "string" ? config.description : "User lifecycle hooks.";
    config.hooks = hooks;
    const backupPath = this.writeJsonWithBackup(this.codexConfigPath, config);
    return {
      message: "Codex hooks configured. Continue with Review & trust hooks in Guided setup; /hooks is available in the Codex CLI, not Desktop chat.",
      backupPath,
    };
  }

  private hookCommand(provider: ConnectableProvider): string {
    return `powershell -NoProfile -ExecutionPolicy Bypass -File ${quoteCommandPath(this.hookScriptPath)} -Provider ${provider}`;
  }

  private readJson(path: string): JsonObject {
    if (!existsSync(path)) return {};
    const source = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    try {
      const parsed: unknown = JSON.parse(source);
      if (!isObject(parsed)) throw new Error("root value must be an object");
      return parsed;
    } catch (error) {
      throw new Error(`Cannot safely edit invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private hasCompanionHook(hooks: unknown, event: string): boolean {
    if (!isObject(hooks) || !Array.isArray(hooks[event])) return false;
    return (hooks[event] as unknown[]).some(
      (group) =>
        isObject(group) &&
        Array.isArray(group.hooks) &&
        group.hooks.some(
          (handler) => isObject(handler) && typeof handler.command === "string" && handler.command.includes("companion-hook.ps1"),
        ),
    );
  }

  private addHook(hooks: JsonObject, event: string, command: string): void {
    if (this.hasCompanionHook(hooks, event)) return;
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    const group: HookGroup = { hooks: [{ type: "command", command }] };
    hooks[event] = [...groups, group];
  }

  private writeJsonWithBackup(path: string, value: JsonObject): string | undefined {
    mkdirSync(dirname(path), { recursive: true });
    let backupPath: string | undefined;
    if (existsSync(path)) {
      const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      backupPath = `${path}.creature-companion-backup-${stamp}`;
      copyFileSync(path, backupPath);
    }
    const temporaryPath = `${path}.creature-companion-${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    if (existsSync(path)) {
      const swapPath = `${path}.creature-companion-${process.pid}.swap`;
      renameSync(path, swapPath);
      try {
        renameSync(temporaryPath, path);
        unlinkSync(swapPath);
      } catch (error) {
        if (existsSync(path)) unlinkSync(path);
        renameSync(swapPath, path);
        throw error;
      }
    } else {
      renameSync(temporaryPath, path);
    }
    return backupPath;
  }
}
