const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

let apiProcess = null;
const isDev = !app.isPackaged;
const rootDir = isDev ? path.resolve(__dirname, "..") : process.resourcesPath;
const apiPort = process.env.LOCAL_API_PORT || "8787";
const appUrl = `http://127.0.0.1:${apiPort}`;

function ensureDataDirs() {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(path.join(dataDir, "uploads", "creative-media"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "uploads", "brand-assets"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "uploads", "library"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
  return dataDir;
}

function startApi() {
  const dataDir = ensureDataDirs();
  const serverFile = path.join(rootDir, "server", "local-api.mjs");
  const env = {
    ...process.env,
    LOCAL_API_PORT: apiPort,
    APP_PORT: apiPort,
    LOCAL_API_HOST: "127.0.0.1",
    DATA_DIR: dataDir,
    SQLITE_PATH: path.join(dataDir, "myinc.sqlite"),
    DATABASE_DRIVER: process.env.DATABASE_DRIVER || "sqlite",
    PUBLIC_MEDIA_BASE_URL:
      process.env.PUBLIC_MEDIA_BASE_URL ||
      `http://127.0.0.1:${apiPort}/storage/v1/object/public/creative-media`,
  };
  apiProcess = spawn(process.execPath, [serverFile], {
    cwd: rootDir,
    env,
    stdio: isDev ? "inherit" : "ignore",
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    minWidth: 1180,
    minHeight: 760,
    title: "MYINC Social Media AI",
    backgroundColor: "#0d0a08",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadURL(appUrl);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  startApi();
  setTimeout(createWindow, 1200);
});

app.on("window-all-closed", () => {
  if (apiProcess) apiProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiProcess) apiProcess.kill();
});
