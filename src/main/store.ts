import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CompanionSettings, CreatureSession } from "../shared/types";

interface PersistedState {
  settings: CompanionSettings;
  sessions: CreatureSession[];
}

const defaultSettings = (): CompanionSettings => ({
  overlayEnabled: true,
  quietMode: false,
  bridgePort: 43821,
  bridgeToken: randomBytes(24).toString("base64url"),
});

export class CompanionStore {
  private readonly statePath: string;
  readonly bridgeConfigPath: string;
  private state: PersistedState;

  constructor(userDataPath: string) {
    this.statePath = join(userDataPath, "companion-state.json");
    this.bridgeConfigPath = join(userDataPath, "bridge.json");
    this.state = this.load();
    this.writeBridgeConfig();
  }

  private load(): PersistedState {
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<PersistedState>;
      const settings = { ...defaultSettings(), ...parsed.settings };
      const sessions = (parsed.sessions ?? []).map((session) => ({
        ...session,
        status: session.status === "closed" ? "closed" : "idle",
        statusMessage: session.status === "closed" ? session.statusMessage : "Waiting for a new event",
      })) as CreatureSession[];
      return { settings, sessions };
    } catch {
      return { settings: defaultSettings(), sessions: [] };
    }
  }

  get settings(): CompanionSettings {
    return { ...this.state.settings };
  }

  get sessions(): CreatureSession[] {
    return structuredClone(this.state.sessions);
  }

  setSettings(patch: Partial<CompanionSettings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    this.save();
    this.writeBridgeConfig();
  }

  setSessions(sessions: CreatureSession[]): void {
    this.state.sessions = structuredClone(sessions);
    this.save();
  }

  isAllowedAsset(assetPath: string): boolean {
    return this.state.sessions.some((session) => Object.values(session.assets).includes(assetPath));
  }

  private save(): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  private writeBridgeConfig(): void {
    mkdirSync(dirname(this.bridgeConfigPath), { recursive: true });
    writeFileSync(
      this.bridgeConfigPath,
      JSON.stringify(
        {
          url: `http://127.0.0.1:${this.state.settings.bridgePort}/v1/events`,
          token: this.state.settings.bridgeToken,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}
