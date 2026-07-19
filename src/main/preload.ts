import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  CompanionApi,
  CreateSessionInput,
  CreatureSession,
  SessionStatus,
  UpdateSessionInput,
} from "../shared/types";

const api: CompanionApi = {
  getSnapshot: () => ipcRenderer.invoke("companion:get-snapshot") as Promise<AppSnapshot>,
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("companion:snapshot", listener);
    return () => ipcRenderer.off("companion:snapshot", listener);
  },
  createSession: (input: CreateSessionInput) =>
    ipcRenderer.invoke("companion:create-session", input) as Promise<CreatureSession>,
  updateSession: (input: UpdateSessionInput) => ipcRenderer.invoke("companion:update-session", input) as Promise<void>,
  removeSession: (id: string) => ipcRenderer.invoke("companion:remove-session", id) as Promise<void>,
  chooseAsset: (id: string, status: SessionStatus) =>
    ipcRenderer.invoke("companion:choose-asset", id, status) as Promise<string | null>,
  setOverlayEnabled: (enabled: boolean) => ipcRenderer.invoke("companion:set-overlay-enabled", enabled) as Promise<void>,
  setOverlayInteractive: (interactive: boolean) =>
    ipcRenderer.invoke("companion:set-overlay-interactive", interactive) as Promise<void>,
  copyText: (text: string) => ipcRenderer.invoke("companion:copy-text", text) as Promise<void>,
  showControl: () => ipcRenderer.invoke("companion:show-control") as Promise<void>,
  quit: () => ipcRenderer.invoke("companion:quit") as Promise<void>,
};

contextBridge.exposeInMainWorld("companion", api);
