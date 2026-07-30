import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";

import type { UpdateController, UpdateSnapshot } from "./types.js";

const CASK_NAME = "skill-central";
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

export class BrewCaskUpdater implements UpdateController {
  private snapshot: UpdateSnapshot;
  private brewPath?: string;

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
    this.snapshot = { ...this.snapshot, status: "checking", message: undefined };
    try {
      const brew = await this.resolveBrew();
      if (!brew) {
        return this.setUnsupported("Homebrew was not found. Install Skill Central with the documented Homebrew cask command.");
      }

      const run = this.options.runCommand ?? runCommand;
      try {
        await run(brew, ["list", "--cask", "--versions", CASK_NAME]);
      } catch {
        return this.setUnsupported("This copy is not managed by the Skill Central Homebrew cask.");
      }

      await run(brew, ["update", "--quiet"]);
      const result = await run(brew, ["outdated", "--cask", "--json=v2", CASK_NAME]);
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

  async install(): Promise<UpdateSnapshot> {
    if (this.snapshot.status !== "available") {
      await this.check();
    }
    if (this.snapshot.status !== "available") {
      return this.getSnapshot();
    }

    this.snapshot = { ...this.snapshot, status: "installing", message: undefined };
    try {
      const brew = await this.resolveBrew();
      if (!brew) return this.setUnsupported("Homebrew is no longer available.");
      const run = this.options.runCommand ?? runCommand;
      await run(brew, ["upgrade", "--cask", CASK_NAME, "--no-ask", "--no-quit"]);
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
    this.snapshot = {
      supported: false,
      provider: "homebrew",
      currentVersion: this.options.currentVersion,
      status: "unsupported",
      message,
    };
    return this.getSnapshot();
  }
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
        reject(new Error(stderr.trim() || stdout.trim() || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
