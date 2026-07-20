import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ConnectableProvider, CreateSessionInput } from "../shared/types";
import { IntegrationManager } from "./integration-manager";
import { launchVisiblePowerShell } from "./visible-powershell";

export class ProviderLauncher {
  constructor(
    private readonly integrations: IntegrationManager,
    private readonly appPath: string,
  ) {}

  launch(input: CreateSessionInput, launchId: string): number {
    if (input.provider !== "claude" && input.provider !== "codex") {
      throw new Error("Only Codex and Claude Code sessions can be launched automatically.");
    }

    const provider = input.provider as ConnectableProvider;
    const executable = this.integrations.findExecutable(provider);
    if (!executable) throw new Error(`${provider === "claude" ? "Claude Code" : "Codex"} was not found on PATH.`);

    const cwd = input.cwd?.trim() || process.cwd();
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`Working folder does not exist: ${cwd}`);

    const scriptPath = join(this.appPath, "scripts", "launch-provider.ps1");
    if (!existsSync(scriptPath)) throw new Error(`Provider launch script not found at ${scriptPath}`);

    return launchVisiblePowerShell(scriptPath, cwd, ["-Provider", provider], {
      CREATURE_COMPANION_PROVIDER_EXE: executable,
      CREATURE_COMPANION_SESSION_TITLE: input.title.trim() || "Creature Companion session",
      CREATURE_COMPANION_SESSION_CONTRACT: input.profile?.contract ?? "",
      CREATURE_COMPANION_LAUNCH_ID: launchId,
    });
  }
}
