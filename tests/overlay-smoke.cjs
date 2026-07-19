const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const fail = (message) => {
  console.error(message);
  app.exit(1);
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 320,
    height: 240,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "overlay-smoke-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { surface: "overlay", displayId: "test" },
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const image = await window.webContents.capturePage();
    const bitmap = image.toBitmap();
    let opaquePixels = 0;
    for (let offset = 3; offset < bitmap.length; offset += 4) {
      if (bitmap[offset] !== 0) opaquePixels += 1;
    }
    if (opaquePixels > 0) {
      fail(`Overlay regression: ${opaquePixels} background pixels are not transparent.`);
      return;
    }
    console.log("Overlay transparency smoke test passed.");
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});
