import type {
  AppSnapshot,
  CreateSessionInput,
  CreatureSession,
  Provider,
  SessionProfile,
  SessionStatus,
} from "../shared/types";
import "./styles.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing app root");

const query = new URLSearchParams(window.location.search);
const surface = query.get("surface") === "overlay" ? "overlay" : "control";
const displayId = query.get("displayId") ?? undefined;
let snapshot: AppSnapshot;
let quizOpen = false;

const statuses: SessionStatus[] = ["starting", "working", "needs_input", "ready", "blocked", "idle"];
const statusLabels: Record<SessionStatus, string> = {
  starting: "Starting",
  working: "Working",
  needs_input: "Needs input",
  ready: "Ready",
  blocked: "Blocked",
  idle: "Idle",
  closed: "Closed",
};
const providerLabels: Record<Provider, string> = {
  claude: "Claude Code",
  codex: "Codex",
  chatgpt: "ChatGPT (experimental)",
  manual: "Manual",
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

const assetUrl = (assetPath?: string): string | undefined => {
  if (!assetPath) return undefined;
  const bytes = new TextEncoder().encode(assetPath);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `companion-asset://local/${encoded}`;
};

const buildContract = (profile: Omit<SessionProfile, "contract">): string => `SESSION MODE

Assistant role:
${profile.assistantRole}

My role:
${profile.userRole}

Knowledge level:
${profile.knowledgeLevel}

Primary focus:
${profile.focuses.join(", ")}.

Interaction rules:
- Proceed autonomously through reversible, in-scope work.
- Ask before destructive actions or decisions that materially change the requested direction.
- Surface consequential tradeoffs early.
- Keep progress updates concise.
- Verify completed work in proportion to its risk.`;

const telemetryHtml = (session: CreatureSession): string => {
  const telemetry = session.telemetry;
  if (!telemetry) return `<div class="telemetry-empty">Telemetry appears after the provider bridge reports it.</div>`;
  const context = telemetry.contextUsedPercent;
  const contextRow =
    context === undefined
      ? ""
      : `<div class="meter-row"><span>Context</span><div class="meter"><i style="width:${Math.min(100, context)}%"></i></div><strong>${Math.round(context)}%</strong></div>`;
  const rateRows = (telemetry.rateLimits ?? [])
    .map(
      (rate) =>
        `<div class="meter-row"><span>${escapeHtml(rate.label)}</span><div class="meter limit"><i style="width:${Math.min(100, rate.usedPercent)}%"></i></div><strong>${Math.round(rate.usedPercent)}%</strong></div>`,
    )
    .join("");
  return `${contextRow}${rateRows}<small class="precision ${telemetry.exact ? "exact" : "estimated"}">${telemetry.exact ? "Exact provider data" : "Observed or estimated"}</small>`;
};

const sessionCard = (session: CreatureSession): string => {
  const selectedAsset = session.assets[session.status];
  return `<article class="session-card" data-session-id="${escapeHtml(session.id)}">
    <div class="session-topline">
      <span class="provider ${session.provider}">${escapeHtml(providerLabels[session.provider])}</span>
      <button class="icon-button remove-session" title="Remove session" aria-label="Remove session">×</button>
    </div>
    <h3>${escapeHtml(session.title)}</h3>
    <p class="status-copy"><span class="status-dot ${session.status}"></span>${escapeHtml(session.statusMessage ?? statusLabels[session.status])}</p>
    <div class="telemetry">${telemetryHtml(session)}</div>
    <div class="quick-states" aria-label="Simulate state">
      <button data-status="working">Work</button>
      <button data-status="needs_input">Needs me</button>
      <button data-status="ready">Done</button>
      <button data-status="blocked">Error</button>
    </div>
    <div class="asset-row">
      <select class="asset-status" aria-label="Animation state">
        ${statuses.map((status) => `<option value="${status}" ${status === session.status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}
      </select>
      <button class="choose-asset">${selectedAsset ? "Change animation" : "Choose GIF"}</button>
    </div>
    ${session.profile ? `<button class="copy-contract subtle">Copy session contract</button>` : ""}
  </article>`;
};

const quizHtml = (): string => `<div class="modal-backdrop" id="quiz-modal">
  <form class="quiz" id="quiz-form">
    <div class="quiz-heading"><div><span class="eyebrow">Hatch a companion</span><h2>What are we doing today?</h2></div><button type="button" class="icon-button close-quiz">×</button></div>
    <label>Session name<input name="title" required placeholder="Leyline · inventory refactor" /></label>
    <label>Provider<select name="provider"><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="chatgpt">ChatGPT (experimental)</option><option value="manual">Manual / demo</option></select></label>
    <fieldset><legend>What should the assistant be?</legend><div class="choice-grid">
      ${["Primary implementer", "Design partner", "Researcher", "Critic and reviewer", "Teacher"].map((choice, index) => `<label class="choice"><input type="radio" name="assistantRole" value="${choice}" ${index === 0 ? "checked" : ""}/><span>${choice}</span></label>`).join("")}
    </div></fieldset>
    <fieldset><legend>What is your role?</legend><div class="choice-grid">
      ${["I make final product decisions", "I provide creative direction", "We work collaboratively", "I learn while the assistant leads", "I approve at checkpoints"].map((choice, index) => `<label class="choice"><input type="radio" name="userRole" value="${choice}" ${index === 2 ? "checked" : ""}/><span>${choice}</span></label>`).join("")}
    </div></fieldset>
    <label>Knowledge level<select name="knowledgeLevel"><option>New to this; explain foundations</option><option selected>Comfortable; explain unfamiliar architecture</option><option>Expert; skip routine explanations</option></select></label>
    <fieldset><legend>Optimize for</legend><div class="choice-grid compact">
      ${["Correctness", "Production readiness", "Speed", "Creativity", "Learning", "Minimal context usage"].map((choice, index) => `<label class="choice"><input type="checkbox" name="focus" value="${choice}" ${index < 2 ? "checked" : ""}/><span>${choice}</span></label>`).join("")}
    </div></fieldset>
    <div class="modal-actions"><button type="button" class="subtle close-quiz">Cancel</button><button type="submit" class="primary">Create companion</button></div>
  </form>
</div>`;

const renderControl = (): void => {
  appRoot.className = "control-root";
  appRoot.innerHTML = `<header class="app-header">
    <div><span class="eyebrow">Local companion habitat</span><h1>Creature Companion</h1><p>One little creature for every active AI session.</p></div>
    <div class="header-actions"><label class="toggle"><input id="overlay-toggle" type="checkbox" ${snapshot.settings.overlayEnabled ? "checked" : ""}/><span></span>Overlay</label><button class="primary" id="new-session">New session</button></div>
  </header>
  <main>
    <section class="overview-grid">
      <article class="summary-card accent"><span>Active companions</span><strong>${snapshot.sessions.length}</strong><small>${snapshot.sessions.filter((session) => session.status === "needs_input").length} need your attention</small></article>
      <article class="summary-card"><span>Local event bridge</span><strong class="online"><i></i>Listening</strong><small>${escapeHtml(snapshot.bridge.url)}</small></article>
      <article class="summary-card"><span>Providers</span><strong>${new Set(snapshot.sessions.map((session) => session.provider)).size || "—"}</strong><small>Codex + Claude Code ready</small></article>
    </section>
    <section class="section-heading"><div><span class="eyebrow">Habitat</span><h2>Sessions</h2></div>${snapshot.sessions.length ? "" : `<button id="demo-sessions" class="subtle">Add demo creatures</button>`}</section>
    <section class="session-grid">${snapshot.sessions.length ? snapshot.sessions.map(sessionCard).join("") : `<div class="empty-state"><div class="empty-creature"><i></i><i></i><b></b></div><h3>The habitat is quiet</h3><p>Create a session or connect one of the provider bridges.</p><button class="primary" id="empty-new-session">Hatch your first companion</button></div>`}</section>
    <section class="integration-panel">
      <div><span class="eyebrow">Provider bridge</span><h2>Connect real sessions</h2><p>Claude Code and Codex hooks post authenticated local events here. The generated bridge configuration stays on this computer.</p></div>
      <dl><div><dt>Endpoint</dt><dd>${escapeHtml(snapshot.bridge.url)}</dd></div><div><dt>Bridge config</dt><dd>${escapeHtml(snapshot.bridge.configPath)}</dd></div></dl>
      <p class="integration-note">Run the setup commands in <code>INTEGRATIONS.md</code>. Ordinary ChatGPT chats remain experimental; this MVP does not scrape the screen.</p>
    </section>
  </main>
  ${quizOpen ? quizHtml() : ""}`;
  bindControlEvents();
};

const bindControlEvents = (): void => {
  const openQuiz = () => {
    quizOpen = true;
    renderControl();
  };
  document.querySelector("#new-session")?.addEventListener("click", openQuiz);
  document.querySelector("#empty-new-session")?.addEventListener("click", openQuiz);
  document.querySelector("#overlay-toggle")?.addEventListener("change", (event) => {
    void window.companion.setOverlayEnabled((event.target as HTMLInputElement).checked);
  });
  document.querySelectorAll(".close-quiz").forEach((button) =>
    button.addEventListener("click", () => {
      quizOpen = false;
      renderControl();
    }),
  );
  document.querySelector<HTMLFormElement>("#quiz-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const partial = {
      assistantRole: String(data.get("assistantRole")),
      userRole: String(data.get("userRole")),
      knowledgeLevel: String(data.get("knowledgeLevel")),
      focuses: data.getAll("focus").map(String),
    };
    const profile: SessionProfile = { ...partial, contract: buildContract(partial) };
    const input: CreateSessionInput = {
      title: String(data.get("title")),
      provider: String(data.get("provider")) as Provider,
      profile,
    };
    quizOpen = false;
    void window.companion.createSession(input);
  });
  document.querySelector("#demo-sessions")?.addEventListener("click", async () => {
    await window.companion.createSession({ provider: "codex", title: "Leyline · interface pass" });
    const claude = await window.companion.createSession({ provider: "claude", title: "Claude · test suite" });
    await window.companion.updateSession({ id: claude.id, status: "needs_input", statusMessage: "Approve the test command?" });
  });
  document.querySelectorAll<HTMLElement>(".session-card").forEach((card) => {
    const id = card.dataset.sessionId;
    if (!id) return;
    card.querySelectorAll<HTMLButtonElement>("[data-status]").forEach((button) =>
      button.addEventListener("click", () => {
        const status = button.dataset.status as SessionStatus;
        void window.companion.updateSession({ id, status, statusMessage: statusLabels[status] });
      }),
    );
    card.querySelector(".remove-session")?.addEventListener("click", () => void window.companion.removeSession(id));
    card.querySelector(".choose-asset")?.addEventListener("click", () => {
      const status = (card.querySelector(".asset-status") as HTMLSelectElement).value as SessionStatus;
      void window.companion.chooseAsset(id, status);
    });
    card.querySelector(".copy-contract")?.addEventListener("click", () => {
      const session = snapshot.sessions.find((candidate) => candidate.id === id);
      if (session?.profile) void window.companion.copyText(session.profile.contract);
    });
  });
};

const fallbackCreature = (status: SessionStatus): string => `<div class="blob ${status}"><span class="eye left"></span><span class="eye right"></span><span class="mouth"></span></div>`;

const renderOverlay = (): void => {
  document.body.classList.add("overlay-body");
  appRoot.className = "overlay-root";
  const visibleSessions = snapshot.sessions.filter(
    (session) => session.status !== "closed" && (!session.position?.displayId || session.position.displayId === displayId),
  );
  appRoot.innerHTML = visibleSessions
    .map((session, index) => {
      const url = assetUrl(session.assets[session.status]);
      const position = session.position ?? { x: 50 + index * 160, y: 70, displayId };
      return `<button class="creature" data-id="${escapeHtml(session.id)}" style="left:${position.x}px;bottom:${position.y}px" title="Open ${escapeHtml(session.title)}">
        <div class="creature-visual">${url ? `<img src="${url}" alt="" draggable="false" />` : fallbackCreature(session.status)}</div>
        <div class="speech"><strong>${escapeHtml(session.title)}</strong><span><i class="status-dot ${session.status}"></i>${escapeHtml(session.statusMessage ?? statusLabels[session.status])}</span></div>
      </button>`;
    })
    .join("");
  bindOverlayEvents();
};

const bindOverlayEvents = (): void => {
  document.querySelectorAll<HTMLElement>(".creature").forEach((creature) => {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originBottom = 0;
    creature.addEventListener("mouseenter", () => void window.companion.setOverlayInteractive(true));
    creature.addEventListener("mouseleave", () => {
      if (!dragging) void window.companion.setOverlayInteractive(false);
    });
    creature.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originLeft = Number.parseFloat(creature.style.left);
      originBottom = Number.parseFloat(creature.style.bottom);
      creature.setPointerCapture(event.pointerId);
    });
    creature.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      creature.style.left = `${Math.max(0, originLeft + event.clientX - startX)}px`;
      creature.style.bottom = `${Math.max(0, originBottom - (event.clientY - startY))}px`;
    });
    creature.addEventListener("pointerup", (event) => {
      dragging = false;
      creature.releasePointerCapture(event.pointerId);
      const id = creature.dataset.id;
      if (id) {
        void window.companion.updateSession({
          id,
          position: {
            x: Number.parseFloat(creature.style.left),
            y: Number.parseFloat(creature.style.bottom),
            displayId,
          },
        });
      }
      void window.companion.setOverlayInteractive(false);
    });
    creature.addEventListener("dblclick", () => void window.companion.showControl());
  });
};

const render = (): void => (surface === "overlay" ? renderOverlay() : renderControl());

snapshot = await window.companion.getSnapshot();
render();
window.companion.onSnapshot((nextSnapshot) => {
  snapshot = nextSnapshot;
  render();
});
