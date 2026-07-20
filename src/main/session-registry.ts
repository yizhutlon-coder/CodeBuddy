import { randomUUID } from "node:crypto";
import type {
  AppSnapshot,
  BridgeInfo,
  CreateSessionInput,
  CreatureSession,
  IncomingEvent,
  SessionStatus,
  UpdateSessionInput,
} from "../shared/types";
import { CompanionStore } from "./store";

type SnapshotListener = (snapshot: AppSnapshot) => void;

const statusFromHook = (eventName: string, raw: Record<string, unknown>): SessionStatus | undefined => {
  const normalized = eventName.toLowerCase();
  if (normalized === "sessionstart") return "idle";
  if (normalized === "permissionrequest") return "needs_input";
  if (normalized === "stop" || normalized === "turn/completed") return "ready";
  if (normalized.includes("failure") || normalized.includes("error")) return "blocked";
  if (
    normalized === "userpromptsubmit" ||
    normalized === "pretooluse" ||
    normalized === "posttooluse" ||
    normalized === "turn/started"
  ) {
    return "working";
  }
  if (normalized === "notification") {
    const notificationType = String(raw.notification_type ?? raw.type ?? "").toLowerCase();
    if (notificationType.includes("permission") || notificationType.includes("idle_prompt")) return "needs_input";
  }
  return undefined;
};

const titleFor = (event: IncomingEvent, sessionId: string): string => {
  if (event.title) return event.title;
  if (event.cwd) {
    const parts = event.cwd.replaceAll("\\", "/").split("/").filter(Boolean);
    return parts.at(-1) ?? `${event.provider} session`;
  }
  return `${event.provider === "claude" ? "Claude Code" : "Codex"} · ${sessionId.slice(0, 7)}`;
};

export class SessionRegistry {
  private sessions: CreatureSession[];
  private readonly listeners = new Set<SnapshotListener>();
  private bridge: BridgeInfo;

  constructor(
    private readonly store: CompanionStore,
    bridge: BridgeInfo,
  ) {
    this.sessions = store.sessions;
    this.bridge = bridge;
  }

  setBridge(bridge: BridgeInfo): void {
    this.bridge = bridge;
    this.emit();
  }

  snapshot(): AppSnapshot {
    return {
      sessions: structuredClone(this.sessions).sort((a, b) => b.updatedAt - a.updatedAt),
      settings: this.store.settings,
      bridge: { ...this.bridge },
    };
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  create(input: CreateSessionInput, displayId?: string): CreatureSession {
    const now = Date.now();
    const session: CreatureSession = {
      id: randomUUID(),
      provider: input.provider,
      title: input.title.trim() || "Untitled session",
      status: "idle",
      statusMessage: "Ready to begin",
      cwd: input.cwd?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      lastEventAt: now,
      profile: input.profile,
      assets: {},
      position: { x: 60 + (this.sessions.length % 4) * 170, y: 80, displayId },
    };
    this.sessions.push(session);
    this.commit();
    return structuredClone(session);
  }

  update(input: UpdateSessionInput): void {
    const session = this.sessions.find((candidate) => candidate.id === input.id);
    if (!session) return;
    if (input.title !== undefined) session.title = input.title;
    if (input.status !== undefined) session.status = input.status;
    if (input.statusMessage !== undefined) session.statusMessage = input.statusMessage;
    if (input.position !== undefined) session.position = input.position;
    if (input.profile !== undefined) session.profile = input.profile;
    session.updatedAt = Date.now();
    this.commit();
  }

  setAsset(id: string, status: SessionStatus, assetPath: string): void {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return;
    session.assets[status] = assetPath;
    session.updatedAt = Date.now();
    this.commit();
  }

  remove(id: string): void {
    this.sessions = this.sessions.filter((session) => session.id !== id);
    this.commit();
  }

  ingest(event: IncomingEvent): CreatureSession {
    const raw = event.raw ?? {};
    const sessionId = event.sessionId ?? String(raw.session_id ?? raw.thread_id ?? raw.threadId ?? randomUUID());
    const stableId = `${event.provider}:${sessionId}`;
    const now = Date.now();
    let session = this.sessions.find((candidate) => candidate.id === stableId);
    const placeholder = event.launchId
      ? this.sessions.find((candidate) => candidate.id === event.launchId && candidate.provider === event.provider)
      : undefined;

    if (!session && placeholder) {
      placeholder.id = stableId;
      placeholder.status = "starting";
      placeholder.statusMessage = "Session connected";
      session = placeholder;
    } else if (session && placeholder && session !== placeholder) {
      session.profile ??= placeholder.profile;
      session.assets = { ...placeholder.assets, ...session.assets };
      session.position ??= placeholder.position;
      this.sessions = this.sessions.filter((candidate) => candidate !== placeholder);
    }
    if (!session) {
      session = {
        id: stableId,
        provider: event.provider,
        title: titleFor(event, sessionId),
        status: "starting",
        statusMessage: "Session connected",
        cwd: event.cwd ?? (typeof raw.cwd === "string" ? raw.cwd : undefined),
        createdAt: now,
        updatedAt: now,
        lastEventAt: now,
        assets: {},
        position: { x: 60 + (this.sessions.length % 4) * 170, y: 80 },
      };
      this.sessions.push(session);
    }

    const eventName = event.event ?? String(raw.hook_event_name ?? raw.type ?? "event");
    session.status = event.status ?? statusFromHook(eventName, raw) ?? session.status;
    session.statusMessage = event.statusMessage ?? this.messageFor(eventName, session.status);
    session.title = event.title ?? session.title;
    session.cwd = event.cwd ?? session.cwd;
    session.telemetry = event.telemetry ? { ...session.telemetry, ...event.telemetry, updatedAt: now } : session.telemetry;
    session.lastEventAt = now;
    session.updatedAt = now;
    this.commit();
    return structuredClone(session);
  }

  private messageFor(eventName: string, status: SessionStatus): string {
    const messages: Record<SessionStatus, string> = {
      starting: "A new companion has arrived",
      working: eventName.toLowerCase().includes("tool") ? "Working with tools" : "Working on your request",
      needs_input: "Waiting for your decision",
      ready: "Work is ready to review",
      blocked: "Something needs attention",
      idle: "Waiting peacefully",
      closed: "Session closed",
    };
    return messages[status];
  }

  private commit(): void {
    this.store.setSessions(this.sessions);
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
