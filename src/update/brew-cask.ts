// ============================================================================
// Update / Homebrew Cask
// ----------------------------------------------------------------------------
// Implements the macOS desktop updater for installations owned by the official
// Skill Central Tap. Homebrew remains the package authority: this controller
// checks its structured reports, invokes a pinned Cask upgrade, and restarts
// only after the installed version is verified.
// ============================================================================

import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";

import type { UpdateController, UpdateSnapshot } from "./types.js";

const CASK_NAME = "skill-central";
const TAP_NAME = "bobcgn/skill-central";
const CASK_REFERENCE = `${TAP_NAME}/${CASK_NAME}`;
const DEFAULT_BREW_CANDIDATES = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;

export interface BrewCaskUpdaterOptions {
  currentVersion: string;
  restart: () => void;
  brewCandidates?: readonly string[];
  canExecute?: (filePath: string) => Promise<boolean>;
  runCommand?: CommandRunner;
}

interface BrewOutdatedReport {
  casks?: Array<{
    name?: string;
    current_version?: string;
  }>;
}

interface BrewTapInfo {
  name?: string;
  installed?: boolean;
  trusted?: boolean;
}

export class BrewCaskUpdater implements UpdateController {
  private snapshot: UpdateSnapshot;
  private brewPath?: string;
  // Check and install mutate the same snapshot and invoke global Homebrew
  // operations, so concurrent UI requests share one in-flight operation.
  private operation?: Promise<UpdateSnapshot>;

  constructor(private readonly options: BrewCaskUpdaterOptions) {
    this.snapshot = {
      supported: true,
      provider: "homebrew",
      currentVersion: options.currentVersion,
      status: "idle",
    };
  }

  getSnapshot(): UpdateSnapshot {
    return { ...this.snapshot };
  }

  async check(): Promise<UpdateSnapshot> {
    if (this.operation) return this.operation;
    this.operation = this.performCheck().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  }

  async install(): Promise<UpdateSnapshot> {
    if (this.operation) return this.operation;
    this.operation = this.performInstall().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  }

  private async performCheck(): Promise<UpdateSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      status: "checking",
      availableVersion: undefined,
      progressPercent: undefined,
      message: undefined,
    };
    try {
      const brew = await this.resolveBrew();
      if (!brew) {
        return this.setUnsupported(
          "Homebrew was not found. Install it first, then follow the documented Skill Central Cask setup.",
        );
      }

      const run = this.options.runCommand ?? runCommand;
      const tapInfo = await readTapInfo(run, brew);
      if (!tapInfo?.installed) {
        return this.setUnsupported(
          `The ${TAP_NAME} tap is not installed. Run: brew tap ${TAP_NAME} https://github.com/BobcGn/skill-central`,
        );
      }
      if (tapInfo.trusted === false) {
        return this.setUnsupported(
          `Homebrew has not trusted the Skill Central tap. Review it, then run: brew trust ${TAP_NAME}`,
        );
      }

      try {
        await run(brew, ["list", "--cask", "--versions", CASK_REFERENCE]);
      } catch (err) {
        return this.setUnsupported(
          `This copy is not managed by ${CASK_REFERENCE}. Install it with: brew install --cask ${CASK_REFERENCE}. ${errorMessage(err)}`,
        );
      }

      await run(brew, ["update", "--quiet"]);
      const result = await runOutdated(run, brew);
      const report = JSON.parse(result.stdout || "{}") as BrewOutdatedReport;
      const update = report.casks?.find((entry) => entry.name === CASK_NAME);
      this.snapshot = update
        ? {
            supported: true,
            provider: "homebrew",
            currentVersion: this.options.currentVersion,
            availableVersion: update.current_version,
            status: "available",
          }
        : {
            supported: true,
            provider: "homebrew",
            currentVersion: this.options.currentVersion,
            status: "up-to-date",
          };
    } catch (err) {
      this.snapshot = {
        ...this.snapshot,
        supported: true,
        status: "error",
        message: errorMessage(err),
      };
    }
    return this.getSnapshot();
  }

  private async performInstall(): Promise<UpdateSnapshot> {
    if (this.snapshot.status !== "available") {
      await this.performCheck();
    }
    if (this.snapshot.status !== "available") {
      return this.getSnapshot();
    }

    this.snapshot = { ...this.snapshot, status: "installing", message: undefined };
    try {
      const brew = await this.resolveBrew();
      if (!brew) return this.setUnsupported("Homebrew is no longer available.");
      const run = this.options.runCommand ?? runCommand;
      await run(brew, [
        "upgrade",
        "--cask",
        CASK_REFERENCE,
        "--no-ask",
        "--no-quit",
        "--require-sha",
      ]);
      // A successful Homebrew exit is insufficient evidence for restart: the
      // Cask database must report the exact version advertised by `outdated`.
      const installed = await run(brew, ["list", "--cask", "--versions", CASK_REFERENCE]);
      const expectedVersion = this.snapshot.availableVersion;
      if (expectedVersion && !installedCaskVersions(installed.stdout).includes(expectedVersion)) {
        throw new Error(
          `Homebrew completed without installing ${expectedVersion}. Reported: ${installed.stdout.trim() || "unknown version"}`,
        );
      }
      this.snapshot = {
        ...this.snapshot,
        status: "ready",
        progressPercent: 100,
        message: "Update installed. Restarting Skill Central.",
      };
      setTimeout(this.options.restart, 250);
    } catch (err) {
      this.snapshot = { ...this.snapshot, status: "error", message: errorMessage(err) };
    }
    return this.getSnapshot();
  }

  private async resolveBrew(): Promise<string | undefined> {
    if (this.brewPath) return this.brewPath;
    const candidates = this.options.brewCandidates ?? DEFAULT_BREW_CANDIDATES;
    const canExecute = this.options.canExecute ?? defaultCanExecute;
    for (const candidate of candidates) {
      if (await canExecute(candidate)) {
        this.brewPath = candidate;
        return candidate;
      }
    }
    return undefined;
  }

  private setUnsupported(message: string): UpdateSnapshot {
    // The updater implementation is available, but the local Tap/Cask setup is
    // not. Keep `supported` true so the UI presents this as a repairable setup
    // requirement rather than as an unsupported desktop platform.
    this.snapshot = {
      supported: true,
      provider: "homebrew",
      currentVersion: this.options.currentVersion,
      status: "unsupported",
      message,
    };
    return this.getSnapshot();
  }
}

async function readTapInfo(
  run: CommandRunner,
  brew: string,
): Promise<BrewTapInfo | undefined> {
  const result = await run(brew, ["tap-info", "--json=v1", TAP_NAME]);
  const report = JSON.parse(result.stdout || "[]") as BrewTapInfo[];
  if (!Array.isArray(report)) {
    throw new Error("Homebrew returned an invalid tap-info report.");
  }
  return report.find((entry) => entry.name?.toLowerCase() === TAP_NAME);
}

async function runOutdated(run: CommandRunner, brew: string): Promise<CommandResult> {
  try {
    return await run(brew, ["outdated", "--cask", "--json=v2", CASK_REFERENCE]);
  } catch (err) {
    // Homebrew may use exit 1 to mean "outdated packages found" while still
    // emitting a complete JSON report. Preserve that report as valid output.
    if (err instanceof CommandExecutionError && err.exitCode === 1 && err.stdout.trim()) {
      return { stdout: err.stdout, stderr: err.stderr };
    }
    throw err;
  }
}

function installedCaskVersions(output: string): string[] {
  const [, ...versions] = output.trim().split(/\s+/);
  return versions;
}

async function defaultCanExecute(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], {
      encoding: "utf-8",
      timeout: 5 * 60 * 1000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new CommandExecutionError(
          stderr.trim() || stdout.trim() || error.message,
          stdout,
          stderr,
          typeof error.code === "number" ? error.code : undefined,
        ));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

class CommandExecutionError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
    readonly exitCode?: number,
  ) {
    super(message);
    this.name = "CommandExecutionError";
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
