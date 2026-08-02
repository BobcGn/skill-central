import { app } from "electron";
import { createRequire } from "node:module";
import type { AppUpdater } from "electron-updater";

import {
  UnsupportedUpdateController,
  type UpdateController,
  type UpdateSnapshot,
} from "../update/types.js";
import { classifyUpdateError } from "../update/error-classifier.js";

const require = createRequire(import.meta.url);

export function createDesktopUpdater(): UpdateController {
  const currentVersion = app.getVersion();
  if (!app.isPackaged) {
    return new UnsupportedUpdateController(currentVersion, "Automatic updates are available in packaged builds.");
  }
  if (process.platform === "darwin" || process.platform === "win32") {
    const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
    return new GitHubUpdateController(autoUpdater, currentVersion);
  }
  return new UnsupportedUpdateController(currentVersion, "Automatic updates are not available on this platform.");
}

class GitHubUpdateController implements UpdateController {
  private snapshot: UpdateSnapshot;

  constructor(private readonly updater: AppUpdater, currentVersion: string) {
    this.snapshot = {
      supported: true,
      provider: "github",
      currentVersion,
      status: "idle",
    };
    updater.allowPrerelease = true;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.autoRunAppAfterInstall = true;
    updater.on("checking-for-update", () => this.update({ status: "checking", message: undefined }));
    updater.on("update-available", (info) => this.update({
      status: "downloading",
      availableVersion: info.version,
      progressPercent: 0,
    }));
    updater.on("update-not-available", () => this.update({ status: "up-to-date", progressPercent: undefined }));
    updater.on("download-progress", (progress) => this.update({
      status: "downloading",
      progressPercent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    }));
    updater.on("update-downloaded", (info) => this.update({
      status: "ready",
      availableVersion: info.version,
      progressPercent: 100,
      message: "Update downloaded and ready to install.",
    }));
    updater.on("error", (err) => this.updateError(err));
  }

  getSnapshot(): UpdateSnapshot {
    return { ...this.snapshot };
  }

  async check(): Promise<UpdateSnapshot> {
    if (this.snapshot.status === "checking" || this.snapshot.status === "downloading") {
      return this.getSnapshot();
    }
    this.update({ status: "checking", message: undefined, errorCode: undefined });
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      this.updateError(err);
    }
    return this.getSnapshot();
  }

  async install(): Promise<UpdateSnapshot> {
    if (this.snapshot.status !== "ready") {
      await this.check();
      return this.getSnapshot();
    }
    this.update({ status: "installing", message: "Installing update and restarting Skill Central." });
    setTimeout(() => this.updater.quitAndInstall(false, true), 250);
    return this.getSnapshot();
  }

  private update(change: Partial<UpdateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
  }

  /**
   * Surface a raw updater failure as a concise, stable error. The raw error
   * (which may contain request URLs, headers, or stack context) is logged for
   * diagnostics only and never placed into the UI snapshot message.
   */
  private updateError(err: unknown): void {
    const classified = classifyUpdateError(err);
    console.error("[skill-central] Update check failed:", err);
    this.update({
      status: "error",
      errorCode: classified.code,
      message: classified.message,
    });
  }
}
