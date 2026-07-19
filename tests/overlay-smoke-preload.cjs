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
  onSnapshot: () => () => {},
  createSession: async () => undefined,
  updateSession: async () => undefined,
  removeSession: async () => undefined,
  chooseAsset: async () => null,
  setOverlayEnabled: async () => undefined,
  setOverlayInteractive: async () => undefined,
  copyText: async () => undefined,
  showControl: async () => undefined,
  quit: async () => undefined,
});
