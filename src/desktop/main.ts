// ============================================================================
// Desktop / Main Process
// ----------------------------------------------------------------------------
// Owns the Electron lifecycle, the loopback Board server, and the single
// visible application window. Closing the macOS window intentionally keeps the
// process and Board server alive; only an explicit application quit tears them
// down.
// ============================================================================

import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  safeStorage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from "electron";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGED_GITHUB_OAUTH_CLIENT_ID } from "../app-metadata.js";
import { resolveGitHubOAuthClientId } from "../auth/github-config.js";
import {
  SafeStorageTokenStore,
  type SecureTokenStoreEvent,
} from "../auth/token-store.js";
import { startBoardServer, type BoardServerHandle } from "../web/server.js";
import { createDesktopUpdater } from "./updater.js";
import type { UpdateController } from "../update/types.js";
import { startMcpServer } from "../mcp.js";
import { desktopMcpServerConfig, isDesktopMcpMode } from "./mcp-launch.js";
import { LocalRuntimeManager } from "../runtime/manager.js";

const DEFAULT_PORT = 5417;
const MAX_PORT_TRIES = 10;

let mainWindow: BrowserWindow | undefined;
let mainWindowCreation: Promise<void> | undefined;
let boardServer: BoardServerHandle | undefined;
let desktopUpdater: UpdateController | undefined;
let tray: Tray | undefined;
let automaticUpdateCheckStarted = false;

async function ensureDesktopServices(): Promise<BoardServerHandle> {
  // A desktop app lifecycle owns exactly one Board server. Reopened windows
  // reconnect to this handle instead of allocating another port and updater.
  if (boardServer) return boardServer;
  const host = "127.0.0.1";
  const port = await findAvailablePort(host, DEFAULT_PORT);
  desktopUpdater ??= createDesktopUpdater();
  const githubOAuthClientId = resolveGitHubOAuthClientId({
    packaged: PACKAGED_GITHUB_OAUTH_CLIENT_ID,
  });
  const mcpServerConfig = desktopMcpServerConfig(app.isPackaged, process.execPath);
  // safeStorage is only queried after app.whenReady(). The store rejects Linux
  // and unavailable OS encryption rather than falling back to plaintext.
  const tokenStore = new SafeStorageTokenStore({
    safeStorage,
    onEvent: logSecureTokenStoreEvent,
  });
  const runtime = new LocalRuntimeManager(mcpServerConfig
    ? {
        command: mcpServerConfig.command,
        args: mcpServerConfig.args,
        autoStart: true,
      }
    : { autoStart: true });
  const board = startBoardServer({
    host,
    port,
    updater: desktopUpdater,
    runtime,
    mcpServerConfig,
    githubOAuthClientId,
    tokenStore,
    authLogger: ({ operation, code }) => {
      console.warn(`[skill-central] GitHub auth diagnostic: operation=${operation} code=${code}`);
    },
  });
  boardServer = board;
  try {
    await waitForServerListening(board);
    return board;
  } catch (err) {
    if (boardServer === board) boardServer = undefined;
    board.server.close();
    throw err;
  }
}

async function createMainWindow(): Promise<void> {
  const board = await ensureDesktopServices();

  const window = new BrowserWindow({
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
  mainWindow = window;

  window.once("ready-to-show", () => {
    if (mainWindow === window) window.show();
  });

  window.once("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    await window.loadURL(`http://${board.host}:${board.port}/`);
  } catch (err) {
    if (!window.isDestroyed()) window.destroy();
    throw err;
  }

  if (!automaticUpdateCheckStarted) {
    automaticUpdateCheckStarted = true;
    const timer = setTimeout(() => void desktopUpdater?.check(), 3000);
    timer.unref();
  }
}

function showMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return Promise.resolve();
  }
  if (mainWindowCreation) return mainWindowCreation;
  // Dock, tray, and second-instance events may arrive together. Sharing the
  // in-flight promise prevents those events from creating duplicate windows.
  mainWindowCreation = (async () => {
    if (!app.isReady()) await app.whenReady();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    await createMainWindow();
  })().finally(() => {
    mainWindowCreation = undefined;
  });
  return mainWindowCreation;
}

function createTray(): void {
  if (tray) return;
  const iconPath = desktopIconPath();
  if (!iconPath) return;
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  if (icon.isEmpty()) return;
  tray = new Tray(icon);
  tray.setToolTip("Skill Central");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Skill Central", click: requestShowMainWindow },
    { type: "separator" },
    { label: "Quit Skill Central", click: () => app.quit() },
  ]));
  tray.on("click", requestShowMainWindow);
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = process.platform === "darwin"
    ? [
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { label: "Show Skill Central", click: requestShowMainWindow },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        { role: "editMenu" },
        { role: "windowMenu" },
      ]
    : [
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function desktopIconPath(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../web/tray.png"),
    path.resolve(here, "../web/favicon.ico"),
    path.resolve(here, "../web/static/favicon.ico"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

if (isDesktopMcpMode(process.argv, app.isPackaged)) {
  startMcpServer().catch((err) => {
    console.error("[skill-central] Fatal:", err);
    process.exit(1);
  });
} else {
  app.setName("Skill Central");

  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      requestShowMainWindow();
    });

    app.whenReady().then(async () => {
      installApplicationMenu();
      createTray();
      await showMainWindow();
    }).catch((err) => {
      console.error(`[skill-central] Desktop startup failed: ${errorMessage(err)}`);
      app.quit();
    });

    app.on("activate", () => {
      requestShowMainWindow();
    });
  }
}

app.on("window-all-closed", () => {
  // On macOS the red window button is a background transition, not Quit.
  // Dock, application-menu, and tray actions can recreate the window later.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  // The Board listener belongs to this process and must not survive a real
  // Quit or hold the loopback port for a future launch.
  void boardServer?.runtime.stop();
  boardServer?.server.close();
  boardServer = undefined;
});

app.on("will-quit", () => {
  tray?.destroy();
  tray = undefined;
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

function waitForServerListening(board: BoardServerHandle): Promise<void> {
  if (board.server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onListening = () => {
      board.server.off("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      board.server.off("listening", onListening);
      reject(error);
    };
    board.server.once("listening", onListening);
    board.server.once("error", onError);
  });
}

function requestShowMainWindow(): void {
  void showMainWindow().catch((err) => {
    console.error(`[skill-central] Unable to show desktop window: ${errorMessage(err)}`);
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logSecureTokenStoreEvent(event: SecureTokenStoreEvent): void {
  // Event types and provider names are a closed, non-sensitive set. Never add
  // token contents, encrypted payloads, paths, or native exception messages.
  console.warn(`[skill-central] Secure token store: event=${event.type} provider=${event.provider}`);
}
