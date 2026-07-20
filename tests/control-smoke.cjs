const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const fail = (message) => {
  console.error(message);
  app.exit(1);
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1080,
    height: 780,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "overlay-smoke-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "../dist/index.html"), { query: { surface: "control" } });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const state = await window.webContents.executeJavaScript(`({
      title: document.querySelector('h1')?.textContent,
      setupCards: document.querySelectorAll('.provider-setup-card').length,
      launchButtons: document.querySelectorAll('.launch-provider').length,
      bodyText: document.body.innerText
    })`);
    if (state.title !== "Creature Companion") throw new Error("Control panel title did not render.");
    if (state.setupCards !== 2 || state.launchButtons !== 1) throw new Error("Provider onboarding cards did not render expected actions.");
    if (!state.bodyText.includes("1 / 2 live")) throw new Error("Onboarding live-verification summary is missing.");
    if (!state.bodyText.includes("Live connection verified")) throw new Error(`Verified provider status is missing: ${state.bodyText}`);
    console.log("Control panel onboarding smoke test passed.");
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});
