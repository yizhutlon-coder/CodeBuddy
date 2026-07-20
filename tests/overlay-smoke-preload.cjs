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
      { provider: "codex", displayName: "Codex", installed: true, executablePath: "codex.cmd", configPath: "hooks.json", configured: true, telemetryConfigured: true, requiresTrust: true },
      { provider: "claude", displayName: "Claude Code", installed: true, executablePath: "claude.cmd", configPath: "settings.json", configured: false, telemetryConfigured: false, requiresTrust: false },
    ],
  }),
  onSnapshot: () => () => {},
  createSession: async () => undefined,
  launchSession: async () => undefined,
  installIntegration: async () => undefined,
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
