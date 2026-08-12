// ============================================================================
// Runtime / Local MCP Process Manager
// ----------------------------------------------------------------------------
// Starts and observes a local `skill-central mcp` child process for the Web
// Board desktop-console surface.
//
// Design intent:
// - This manager is explicitly for local UI control. IDEs still launch their
//   own configured MCP command; we do not turn stdio MCP into a shared daemon.
// - Child stdout is protocol traffic, so it is captured into a bounded ring
//   buffer and never forwarded to console.log.
// - Child stderr is diagnostic traffic and is also captured for the UI.
// ============================================================================

import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import type { Readable, Writable } from "node:stream";
import { resolve } from "node:path";

export type RuntimeStatus = "running" | "stopped" | "error";
export type RuntimeTransport = "stdio";

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  transport: RuntimeTransport;
  command: string;
  args: string[];
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  lastError?: string;
  stdoutLines: string[];
  stderrLines: string[];
}

export interface LocalRuntimeManagerOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  /** Merged over the manager's own environment rather than replacing it. */
  env?: Record<string, string>;
  maxLogLines?: number;
  autoStart?: boolean;
}

export class LocalRuntimeManager {
  private child: ChildProcessByStdio<Writable, Readable, Readable> | undefined;
  private snapshot: RuntimeSnapshot;

  constructor(
    private options: LocalRuntimeManagerOptions = {},
  ) {
    this.snapshot = {
      status: "stopped",
      transport: "stdio",
      command: options.command ?? process.execPath,
      args: options.args ?? [resolve(process.argv[1] ?? "dist/index.js"), "mcp"],
      stdoutLines: [],
      stderrLines: [],
    };
    if (options.autoStart) {
      this.start();
    }
  }

  async configure(options: LocalRuntimeManagerOptions, restart = true): Promise<RuntimeSnapshot> {
    const wasRunning = this.snapshot.status === "running";
    if (this.child) await this.stop();
    this.options = { ...this.options, ...options };
    this.snapshot = {
      status: "stopped",
      transport: "stdio",
      command: this.options.command ?? process.execPath,
      args: this.options.args ?? [resolve(process.argv[1] ?? "dist/index.js"), "mcp"],
      stoppedAt: new Date().toISOString(),
      stdoutLines: [],
      stderrLines: [],
    };
    return wasRunning && restart ? this.start() : this.getSnapshot();
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      ...this.snapshot,
      stdoutLines: [...this.snapshot.stdoutLines],
      stderrLines: [...this.snapshot.stderrLines],
    };
  }

  start(): RuntimeSnapshot {
    if (this.child && !this.child.killed) return this.getSnapshot();

    const command = this.options.command ?? process.execPath;
    const args = this.options.args ?? [resolve(process.argv[1] ?? "dist/index.js"), "mcp"];
    const child = spawn(command, args, {
      cwd: this.options.cwd ?? process.cwd(),
      env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child = child;
    this.snapshot = {
      status: "running",
      transport: "stdio",
      command,
      args,
      pid: child.pid,
      startedAt: new Date().toISOString(),
      stdoutLines: [],
      stderrLines: [],
    };

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => this.pushLog("stdout", chunk));
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk) => this.pushLog("stderr", chunk));

    child.once("error", (err) => {
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        lastError: err.message,
        stoppedAt: new Date().toISOString(),
      };
      this.child = undefined;
    });

    child.once("exit", (code, signal) => {
      const stoppedAt = new Date().toISOString();
      const expectedStop = this.snapshot.status === "stopped";
      this.snapshot = {
        ...this.snapshot,
        status: expectedStop || code === 0 ? "stopped" : "error",
        stoppedAt,
        exitCode: code,
        signal,
        lastError: expectedStop || code === 0 ? this.snapshot.lastError : `MCP process exited with code ${code}`,
      };
      this.child = undefined;
    });

    return this.getSnapshot();
  }

  async stop(): Promise<RuntimeSnapshot> {
    if (!this.child) {
      this.snapshot = {
        ...this.snapshot,
        status: "stopped",
        stoppedAt: this.snapshot.stoppedAt ?? new Date().toISOString(),
      };
      return this.getSnapshot();
    }

    const child = this.child;
    this.snapshot = {
      ...this.snapshot,
      status: "stopped",
      stoppedAt: new Date().toISOString(),
    };
    child.stdin.end();
    child.kill("SIGTERM");
    const exitedAfterTerm = await waitForExit(child, 1500);
    if (!exitedAfterTerm && child.exitCode === null && child.signalCode === null) {
      // `child.killed` only means kill() was called; it does not mean the OS
      // process exited. A SIGTERM-resistant runtime must receive SIGKILL and
      // be reaped before desktop shutdown can complete.
      child.kill("SIGKILL");
      await waitForExit(child, 1500);
    }
    if (this.child === child) this.child = undefined;
    return this.getSnapshot();
  }

  private pushLog(stream: "stdout" | "stderr", chunk: string): void {
    const key = stream === "stdout" ? "stdoutLines" : "stderrLines";
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    this.snapshot[key] = [...this.snapshot[key], ...lines].slice(-(this.options.maxLogLines ?? 80));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForExit(
  child: ChildProcessByStdio<Writable, Readable, Readable>,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    once(child, "exit").then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}
