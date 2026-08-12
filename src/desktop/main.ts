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
  dialog,
  Menu,
  nativeImage,
  safeStorage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
  type OpenDialogOptions,
} from "electron";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
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
import { desktopMcpServerConfig, isDesktopMcpMode, withProjectRootEnv } from "./mcp-launch.js";
import { isUnpackedBuildLocation } from "./location.js";
import { LocalRuntimeManager } from "../runtime/manager.js";
import { shutdownDesktopServices } from "./shutdown.js";

const DEFAULT_PORT = 5417;
const MAX_PORT_TRIES = 10;

let mainWindow: BrowserWindow | undefined;
let mainWindowCreation: Promise<void> | undefined;
let boardServer: BoardServerHandle | undefined;
let desktopUpdater: UpdateController | undefined;
let tray: Tray | undefined;
let automaticUpdateCheckStarted = false;
let quitCleanupStarted = false;
let quitCleanupComplete = false;

async function ensureDesktopServices(): Promise<BoardServerHandle> {
  // A desktop app lifecycle owns exactly one Board server. Reopened windows
  // reconnect to this handle instead of allocating another port and updater.
  if (boardServer) return boardServer;
  const host = "127.0.0.1";
  const port = await findAvailablePort(host, DEFAULT_PORT);
  const rootDir = await readDesktopWorkspace();
  desktopUpdater ??= createDesktopUpdater();
  const githubOAuthClientId = resolveGitHubOAuthClientId({
    packaged: PACKAGED_GITHUB_OAUTH_CLIENT_ID,
  });
  const mcpServerConfig = desktopMcpServerConfig(app.isPackaged, process.execPath, app.getAppPath(), process.platform, rootDir);
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
        cwd: rootDir,
        env: mcpServerConfig.env,
        autoStart: true,
      }
    : { cwd: rootDir, autoStart: true });
  const board = startBoardServer({
    host,
    port,
    rootDir,
    updater: desktopUpdater,
    runtime,
    mcpServerConfig: withProjectRootEnv(mcpServerConfig, rootDir),
    githubOAuthClientId,
    tokenStore,
    authLogger: ({ operation, code }) => {
      console.warn(`[skill-central] GitHub auth diagnostic: operation=${operation} code=${code}`);
    },
    onWorkspaceChange: writeDesktopWorkspace,
    selectSyncRegistryDirectory,
    selectAssetLibraryDirectory,
  });
  boardServer = board;
  try {
    await waitForServerListening(board);
    void runDesktopStartupRecognition(board);
    return board;
  } catch (err) {
    if (boardServer === board) boardServer = undefined;
    board.server.close();
    throw err;
  }
}

async function runDesktopStartupRecognition(board: BoardServerHandle): Promise<void> {
  // Desktop startup recognition is intentionally asynchronous: it records
  // evidence and refreshes already-registered drift without delaying the
  // visible window. The reconciler will not create missing IDE config files.
  try {
    const response = await fetch(`http://${board.host}:${board.port}/api/startup-recognition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applyDrift: true, registerMissing: true, verify: true }),
    });
    if (!response.ok) {
      console.warn(`[skill-central] startup recognition failed: HTTP ${response.status}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[skill-central] startup recognition failed: ${message}`);
  }
}

async function readDesktopWorkspace(): Promise<string> {
  const fallback = app.isPackaged ? homedir() : process.cwd();
  try {
    const parsed = JSON.parse(await readFile(desktopWorkspacePath(), "utf-8")) as { rootDir?: unknown };
    return typeof parsed.rootDir === "string" && parsed.rootDir.trim()
      ? path.resolve(parsed.rootDir)
      : fallback;
  } catch {
    return fallback;
  }
}

async function writeDesktopWorkspace(rootDir: string): Promise<void> {
  const filePath = desktopWorkspacePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ rootDir: path.resolve(rootDir), updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf-8",
  );
}

function desktopWorkspacePath(): string {
  return path.join(app.getPath("userData"), "workspace.json");
}

async function selectSyncRegistryDirectory(currentPath?: string): Promise<string | undefined> {
  return selectExistingDirectory(
    "Select an existing Skill Central registry directory",
    currentPath,
  );
}

async function selectAssetLibraryDirectory(currentPath?: string): Promise<string | undefined> {
  return selectExistingDirectory(
    "Select a folder containing skills and rules directories",
    currentPath,
  );
}

async function selectExistingDirectory(
  title: string,
  currentPath?: string,
): Promise<string | undefined> {
  const options: OpenDialogOptions = {
    title,
    buttonLabel: "Select directory",
    properties: ["openDirectory"],
    ...(currentPath && existsSync(path.resolve(currentPath))
      ? { defaultPath: path.resolve(currentPath) }
      : {}),
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
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
    { label: "Quit Skill Central", click: requestDesktopQuit },
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
            {
              label: "Quit Skill Central",
              accelerator: "CommandOrControl+Q",
              click: requestDesktopQuit,
            },
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

// Both branches must agree on the application name before Electron resolves
// userData. Naming only the GUI branch let the MCP branch fall back to the
// package name and create a second, scope-nested state directory
// (`@bobcgn/skill-central`) next to the real one.
app.setName("Skill Central");

const desktopMcpMode = isDesktopMcpMode(process.argv, app.isPackaged);

if (desktopMcpMode) {
  // macOS Dock 只应展示主应用一个图标。该 MCP 分支由本地 MCP Runtime
  // 子进程命中：它是同一个 App 可执行文件的第二个 Electron 实例，
  // 默认 Regular 激活策略会让 Dock 额外生成一个图标（“双图标”现象）。
  // 这里显式隐藏 Dock 图标；主 GUI 进程不进入此分支，不受影响。
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
  startMcpServer().catch((err) => {
    console.error("[skill-central] Fatal:", err);
    process.exit(1);
  });
} else {
  // Defensive check: warn when the app is launched from an unpacked build
  // copy (release-artifacts/…, win-unpacked/…) instead of the installed
  // location. Build scripts clean these copies, but an older or hand-copied
  // bundle may still exist; running it next to the installed app creates
  // duplicate Dock entries and a confusing single-instance lock.
  if (isUnpackedBuildLocation(process.execPath)) {
    recordStartupDiagnostic(
      "Running from an unpacked build location. Install the official package to " +
      "/Applications (macOS) or Program Files (Windows) so only one application instance exists.",
    );
  }

  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    showStartupFailure(
      "Skill Central is already running",
      "Another Skill Central instance owns the desktop single-instance lock. " +
      "Quit the installed application before launching this build.",
    );
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
      showStartupFailure("Skill Central failed to start", errorMessage(err));
      app.quit();
    });

    app.on("activate", () => {
      requestShowMainWindow();
    });
  }
}

if (!desktopMcpMode) {
  process.on("uncaughtException", (err) => {
    showStartupFailure("Skill Central crashed during startup", errorMessage(err));
    app.quit();
  });

  process.on("unhandledRejection", (reason) => {
    showStartupFailure("Skill Central startup promise failed", errorMessage(reason));
    app.quit();
  });
}

app.on("window-all-closed", () => {
  // On macOS the red window button is a background transition, not Quit.
  // Dock, application-menu, and tray actions can recreate the window later.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitCleanupComplete || desktopMcpMode) return;
  // Electron does not await an async event listener. Hold the quit transition
  // until the MCP child has exited and the loopback listener has closed, then
  // re-enter app.quit() once with cleanup marked complete.
  event.preventDefault();
  requestDesktopQuit();
});

function requestDesktopQuit(): void {
  if (quitCleanupComplete) {
    process.exit(0);
  }
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;
  const ownedBoard = boardServer;
  boardServer = undefined;
  let finalized = false;
  const finalizeQuit = () => {
    if (finalized) return;
    finalized = true;
    clearTimeout(forceQuitTimer);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    mainWindow = undefined;
    tray?.destroy();
    tray = undefined;
    quitCleanupComplete = true;
    // We already completed (or exhausted) the graceful shutdown contract.
    // Electron can remain stuck after a prevented before-quit transition on
    // macOS, including after app.exit(). End the now-clean main process
    // directly so Command+Q has a deterministic terminal state.
    process.exit(0);
  };
  const forceQuitTimer = setTimeout(() => {
    recordStartupDiagnostic("Desktop shutdown exceeded 5 seconds; forcing the cleaned main process to exit.");
    finalizeQuit();
  }, 5000);
  void shutdownDesktopServices(ownedBoard).catch((err) => {
    recordStartupDiagnostic(`Desktop shutdown cleanup failed: ${errorMessage(err)}`);
  }).finally(() => {
    finalizeQuit();
  });
}

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
    showStartupFailure("Skill Central could not show its window", errorMessage(err));
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showStartupFailure(title: string, message: string): void {
  recordStartupDiagnostic(`${title}: ${message}`);
  try {
    dialog.showErrorBox(title, `${message}\n\nDiagnostics: ${startupLogPath()}`);
  } catch {
    // Very early Electron startup paths may not be able to show UI.
  }
}

function recordStartupDiagnostic(message: string): void {
  try {
    const logPath = startupLogPath();
    mkdirSync(path.dirname(logPath), { recursive: true });
    appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf-8");
  } catch {
    // Startup diagnostics must never become the reason startup fails.
  }
  console.warn(`[skill-central] ${message}`);
}

function startupLogPath(): string {
  return path.join(app.getPath("userData"), "startup.log");
}

function logSecureTokenStoreEvent(event: SecureTokenStoreEvent): void {
  // Event types and provider names are a closed, non-sensitive set. Never add
  // token contents, encrypted payloads, paths, or native exception messages.
  console.warn(`[skill-central] Secure token store: event=${event.type} provider=${event.provider}`);
}
