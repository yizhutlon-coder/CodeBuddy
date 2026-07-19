export type Provider = "claude" | "codex" | "chatgpt" | "manual";

export type SessionStatus =
  | "starting"
  | "working"
  | "needs_input"
  | "ready"
  | "blocked"
  | "idle"
  | "closed";

export interface RateWindow {
  usedPercent: number;
  resetsAt?: number;
  label: string;
}

export interface SessionTelemetry {
  contextUsedPercent?: number;
  contextWindowSize?: number;
  inputTokens?: number;
  outputTokens?: number;
  rateLimits?: RateWindow[];
  exact?: boolean;
  updatedAt?: number;
}

export interface SessionProfile {
  assistantRole: string;
  userRole: string;
  knowledgeLevel: string;
  focuses: string[];
  contract: string;
}

export interface CreaturePosition {
  x: number;
  y: number;
  displayId?: string;
}

export interface CreatureSession {
  id: string;
  provider: Provider;
  title: string;
  status: SessionStatus;
  statusMessage?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
  lastEventAt: number;
  profile?: SessionProfile;
  telemetry?: SessionTelemetry;
  assets: Partial<Record<SessionStatus, string>>;
  position?: CreaturePosition;
}

export interface CompanionSettings {
  overlayEnabled: boolean;
  quietMode: boolean;
  bridgePort: number;
  bridgeToken: string;
}

export interface BridgeInfo {
  url: string;
  token: string;
  configPath: string;
}

export interface AppSnapshot {
  sessions: CreatureSession[];
  settings: CompanionSettings;
  bridge: BridgeInfo;
}

export interface CreateSessionInput {
  provider: Provider;
  title: string;
  profile?: SessionProfile;
}

export interface UpdateSessionInput {
  id: string;
  title?: string;
  status?: SessionStatus;
  statusMessage?: string;
  position?: CreaturePosition;
  profile?: SessionProfile;
}

export interface IncomingEvent {
  provider: Provider;
  event?: string;
  sessionId?: string;
  title?: string;
  cwd?: string;
  status?: SessionStatus;
  statusMessage?: string;
  telemetry?: SessionTelemetry;
  raw?: Record<string, unknown>;
}

export interface CompanionApi {
  getSnapshot(): Promise<AppSnapshot>;
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
  createSession(input: CreateSessionInput): Promise<CreatureSession>;
  updateSession(input: UpdateSessionInput): Promise<void>;
  removeSession(id: string): Promise<void>;
  chooseAsset(id: string, status: SessionStatus): Promise<string | null>;
  setOverlayEnabled(enabled: boolean): Promise<void>;
  setOverlayInteractive(interactive: boolean): Promise<void>;
  copyText(text: string): Promise<void>;
  showControl(): Promise<void>;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    companion: CompanionApi;
  }
}
