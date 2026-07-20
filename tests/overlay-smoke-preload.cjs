const { contextBridge } = require("electron");

const snapshot = {
  sessions: [],
  settings: {
    overlayEnabled: true,
    quietMode: false,
    bridgePort: 43821,
    bridgeToken: "test-token",
  },
  bridge: {
    url: "http://127.0.0.1:43821/v1/events",
    token: "test-token",
    configPath: "test",
  },
};

contextBridge.exposeInMainWorld("companion", {
  getSnapshot: async () => snapshot,
  getOnboarding: async () => ({
    providers: [
      { provider: "codex", displayName: "Codex", hostDetected: true, installed: true, executablePath: "codex.cmd", configPath: "hooks.json", configured: true, telemetryConfigured: true, requiresTrust: false, verified: true, lastEventAt: 1000 },
      { provider: "claude", displayName: "Claude Code", hostDetected: true, installed: false, configPath: "settings.json", configured: true, telemetryConfigured: true, requiresTrust: false, verified: false },
    ],
  }),
  onOnboarding: () => () => {},
  onSnapshot: () => () => {},
  createSession: async () => undefined,
  launchSession: async () => undefined,
  installIntegration: async () => undefined,
  installCodexCli: async () => undefined,
  reviewCodexHooks: async () => undefined,
  chooseDirectory: async () => null,
  updateSession: async () => undefined,
  removeSession: async () => undefined,
  chooseAsset: async () => null,
  setOverlayEnabled: async () => undefined,
  setOverlayInteractive: async () => undefined,
  copyText: async () => undefined,
  showControl: async () => undefined,
  quit: async () => undefined,
});
