import { existsSync } from "node:fs";
import { join } from "node:path";
import { launchVisiblePowerShell } from "./visible-powershell";

export class OnboardingLauncher {
  constructor(
    private readonly appPath: string,
    private readonly homeDir: string,
  ) {}

  launchCodexInstaller(): number {
    return this.launchScript("install-codex-cli.ps1", {});
  }

  launchCodexHookReview(codexExecutable: string): number {
    return this.launchScript("review-codex-hooks.ps1", {
      CREATURE_COMPANION_CODEX_EXE: codexExecutable,
      CODEX_HOME: join(this.homeDir, ".codex"),
    });
  }

  private launchScript(name: string, extraEnv: Record<string, string>): number {
    const scriptPath = join(this.appPath, "scripts", name);
    if (!existsSync(scriptPath)) throw new Error(`Onboarding script not found at ${scriptPath}`);
    return launchVisiblePowerShell(scriptPath, this.appPath, [], extraEnv);
  }
}
