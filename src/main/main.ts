import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  Tray,
} from "electron";
import type { CreateSessionInput, SessionStatus, UpdateSessionInput } from "../shared/types";
import { startEventServer, type EventServerResult } from "./event-server";
import { SessionRegistry } from "./session-registry";
import { CompanionStore } from "./store";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "companion-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let controlWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: CompanionStore;
let registry: SessionRegistry;
let eventServer: EventServerResult | null = null;
let isQuitting = false;
const overlayWindows = new Map<string, BrowserWindow>();

const rendererUrl = (surface: "control" | "overlay", displayId?: string): string => {
  const query = new URLSearchParams({ surface });
  if (displayId) query.set("displayId", displayId);
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) return `${devUrl}/?${query.toString()}`;
  return `${pathToFileURL(join(__dirname, "../../dist/index.html")).toString()}?${query.toString()}`;
};

const windowOptions = (): Electron.BrowserWindowConstructorOptions => ({
  webPreferences: {
    preload: join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});

const createControlWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    ...windowOptions(),
    width: 1080,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    title: "Creature Companion",
    backgroundColor: "#11101a",
    show: false,
  });
  window.removeMenu();
  void window.loadURL(rendererUrl("control"));
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (controlWindow === window) controlWindow = null;
  });
  return window;
};

const createOverlayWindow = (display: Electron.Display): BrowserWindow => {
  const window = new BrowserWindow({
    ...windowOptions(),
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: "#00000000",
  });
  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setIgnoreMouseEvents(true, { forward: true });
  void window.loadURL(rendererUrl("overlay", String(display.id)));
  window.once("ready-to-show", () => {
    if (store.settings.overlayEnabled) window.showInactive();
  });
  return window;
};

const rebuildOverlays = (): void => {
  for (const window of overlayWindows.values()) window.destroy();
  overlayWindows.clear();
  for (const display of screen.getAllDisplays()) {
    overlayWindows.set(String(display.id), createOverlayWindow(display));
  }
};

const showControl = (): void => {
  if (!controlWindow || controlWindow.isDestroyed()) controlWindow = createControlWindow();
  controlWindow.show();
  controlWindow.focus();
};

const broadcast = (): void => {
  const snapshot = registry.snapshot();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("companion:snapshot", snapshot);
  }
};

const createTray = (): void => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="10" fill="#7367f0"/><circle cx="11" cy="14" r="3" fill="white"/><circle cx="21" cy="14" r="3" fill="white"/><path d="M10 23c4 3 8 3 12 0" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  const icon = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`)
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Creature Companion");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Creature Companion", click: showControl },
      {
        label: "Show overlay",
        type: "checkbox",
        checked: store.settings.overlayEnabled,
        click: (item) => setOverlayEnabled(item.checked),
      },
      { type: "separator" },
      { label: "Quit", click: () => quitApp() },
    ]),
  );
  tray.on("double-click", showControl);
};

const setOverlayEnabled = (enabled: boolean): void => {
  store.setSettings({ overlayEnabled: enabled });
  for (const window of overlayWindows.values()) {
    if (enabled) window.showInactive();
    else window.hide();
  }
  broadcast();
};

const quitApp = (): void => {
  isQuitting = true;
  app.quit();
};

const registerIpc = (): void => {
  ipcMain.handle("companion:get-snapshot", () => registry.snapshot());
  ipcMain.handle("companion:create-session", (_event, input: CreateSessionInput) => {
    const displayId = String(screen.getPrimaryDisplay().id);
    return registry.create(input, displayId);
  });
  ipcMain.handle("companion:update-session", (_event, input: UpdateSessionInput) => registry.update(input));
  ipcMain.handle("companion:remove-session", (_event, id: string) => registry.remove(id));
  ipcMain.handle("companion:choose-asset", async (_event, id: string, status: SessionStatus) => {
    const options: Electron.OpenDialogOptions = {
      title: `Choose the ${status.replaceAll("_", " ")} creature animation`,
      properties: ["openFile"],
      filters: [{ name: "Creature images", extensions: ["gif", "webp", "png", "jpg", "jpeg"] }],
    };
    const result = controlWindow ? await dialog.showOpenDialog(controlWindow, options) : await dialog.showOpenDialog(options);
    const assetPath = result.filePaths[0];
    if (result.canceled || !assetPath) return null;
    registry.setAsset(id, status, assetPath);
    return assetPath;
  });
  ipcMain.handle("companion:set-overlay-enabled", (_event, enabled: boolean) => setOverlayEnabled(enabled));
  ipcMain.handle("companion:set-overlay-interactive", (event, interactive: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && [...overlayWindows.values()].includes(window)) {
      window.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  });
  ipcMain.handle("companion:copy-text", (_event, text: string) => clipboard.writeText(text));
  ipcMain.handle("companion:show-control", () => showControl());
  ipcMain.handle("companion:quit", () => quitApp());
};

app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(async () => {
  store = new CompanionStore(app.getPath("userData"));
  registry = new SessionRegistry(store, {
    url: `http://127.0.0.1:${store.settings.bridgePort}/v1/events`,
    token: store.settings.bridgeToken,
    configPath: store.bridgeConfigPath,
  });
  eventServer = await startEventServer(store.settings.bridgePort, store.settings.bridgeToken, (event) => {
    const session = registry.ingest(event);
    if (!session.position?.displayId) {
      registry.update({
        id: session.id,
        position: { ...(session.position ?? { x: 60, y: 80 }), displayId: String(screen.getPrimaryDisplay().id) },
      });
    }
  });
  if (eventServer.port !== store.settings.bridgePort) store.setSettings({ bridgePort: eventServer.port });
  registry.setBridge({
    url: `http://127.0.0.1:${eventServer.port}/v1/events`,
    token: store.settings.bridgeToken,
    configPath: store.bridgeConfigPath,
  });

  protocol.handle("companion-asset", (request) => {
    try {
      const encoded = new URL(request.url).pathname.slice(1);
      const assetPath = Buffer.from(encoded, "base64url").toString("utf8");
      const allowedExtensions = new Set([".gif", ".webp", ".png", ".jpg", ".jpeg"]);
      if (!store.isAllowedAsset(assetPath) || !existsSync(assetPath) || !allowedExtensions.has(extname(assetPath).toLowerCase())) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(assetPath).toString());
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  });

  registerIpc();
  registry.subscribe(() => broadcast());
  controlWindow = createControlWindow();
  rebuildOverlays();
  createTray();

  screen.on("display-added", rebuildOverlays);
  screen.on("display-removed", rebuildOverlays);
  screen.on("display-metrics-changed", rebuildOverlays);
});

app.on("window-all-closed", () => {
  // Tray applications intentionally stay alive after their windows close.
});

app.on("will-quit", () => {
  if (eventServer) void eventServer.close();
});
