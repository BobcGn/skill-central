import { app, BrowserWindow, shell } from "electron";
import { createServer } from "node:net";

import { startBoardServer } from "../web/server.js";
import { createDesktopUpdater } from "./updater.js";
import type { UpdateController } from "../update/types.js";

const DEFAULT_PORT = 5417;
const MAX_PORT_TRIES = 10;

let mainWindow: BrowserWindow | undefined;
let desktopUpdater: UpdateController | undefined;
let automaticUpdateCheckStarted = false;

async function createMainWindow(): Promise<void> {
  const host = "127.0.0.1";
  const port = await findAvailablePort(host, DEFAULT_PORT);
  desktopUpdater ??= createDesktopUpdater();
  startBoardServer({ host, port, updater: desktopUpdater });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: "Skill Central",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://${host}:${port}/`);

  if (!automaticUpdateCheckStarted) {
    automaticUpdateCheckStarted = true;
    setTimeout(() => void desktopUpdater?.check(), 3000);
  }
}

app.setName("Skill Central");

app.whenReady().then(() => {
  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function findAvailablePort(host: string, start: number): Promise<number> {
  for (let offset = 0; offset <= MAX_PORT_TRIES; offset++) {
    const port = start + offset;
    if (await canBind(host, port)) {
      return port;
    }
  }
  throw new Error(`No available port in range ${start}..${start + MAX_PORT_TRIES}.`);
}

function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}
