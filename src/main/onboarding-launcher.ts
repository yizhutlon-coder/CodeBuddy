import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class OnboardingLauncher {
  constructor(private readonly appPath: string) {}

  launchCodexInstaller(): number {
    return this.launchScript("install-codex-cli.ps1", {});
  }

  launchCodexHookReview(codexExecutable: string): number {
    return this.launchScript("review-codex-hooks.ps1", {
      CREATURE_COMPANION_CODEX_EXE: codexExecutable,
    });
  }

  private launchScript(name: string, extraEnv: Record<string, string>): number {
    const scriptPath = join(this.appPath, "scripts", name);
    if (!existsSync(scriptPath)) throw new Error(`Onboarding script not found at ${scriptPath}`);
    const child = spawn(
      "powershell.exe",
      ["-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        cwd: this.appPath,
        detached: true,
        windowsHide: false,
        stdio: "ignore",
        env: { ...process.env, ...extraEnv },
      },
    );
    if (!child.pid) throw new Error("The onboarding terminal could not be opened.");
    child.unref();
    return child.pid;
  }
}
