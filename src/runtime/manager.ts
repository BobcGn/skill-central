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
  private stopPromise: Promise<RuntimeSnapshot> | undefined;
  private configureChain: Promise<RuntimeSnapshot> | undefined;
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
    const configure = async (): Promise<RuntimeSnapshot> => {
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
    };
    this.configureChain = (this.configureChain ?? Promise.resolve(this.getSnapshot())).then(configure, configure);
    return this.configureChain;
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      ...this.snapshot,
      stdoutLines: [...this.snapshot.stdoutLines],
      stderrLines: [...this.snapshot.stderrLines],
    };
  }

  start(): RuntimeSnapshot {
    // A child remains owned until its exit event has been observed. `killed`
    // only reports that kill() was requested and must not authorize a second
    // overlapping Runtime during shutdown.
    if (this.child || this.stopPromise) return this.getSnapshot();

    const command = this.options.command ?? process.execPath;
    const args = this.options.args ?? [resolve(process.argv[1] ?? "dist/index.js"), "mcp"];
    const child = spawn(command, args, {
      cwd: this.options.cwd ?? process.cwd(),
      env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
      // A dedicated POSIX process group lets shutdown reach descendants even
      // after the direct child exits. Windows uses taskkill /T in stop().
      detached: process.platform !== "win32",
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
      if (this.child !== child) return;
      this.snapshot = {
        ...this.snapshot,
        status: "error",
        pid: undefined,
        lastError: err.message,
        stoppedAt: new Date().toISOString(),
      };
      this.child = undefined;
    });

    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      const stoppedAt = new Date().toISOString();
      const expectedStop = this.snapshot.status === "stopped";
      this.snapshot = {
        ...this.snapshot,
        status: expectedStop || code === 0 ? "stopped" : "error",
        pid: undefined,
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
    if (this.stopPromise) return this.stopPromise;
    if (!this.child) {
      this.snapshot = {
        ...this.snapshot,
        status: "stopped",
        stoppedAt: this.snapshot.stoppedAt ?? new Date().toISOString(),
      };
      return this.getSnapshot();
    }

    const child = this.child;
    const stop = async (): Promise<RuntimeSnapshot> => {
      this.snapshot = {
        ...this.snapshot,
        status: "stopped",
        stoppedAt: new Date().toISOString(),
      };
      child.stdin.end();
      if (process.platform === "win32") {
        // Node signals only terminate the direct process on Windows. taskkill
        // /T covers any helper descendants owned by the Runtime.
        const treeTerminationStarted = await terminateWindowsProcessTree(child.pid);
        if (!treeTerminationStarted && child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      } else {
        signalPosixProcessGroup(child.pid, "SIGTERM");
        const exitedAfterTerm = await waitForExit(child, 1500);
        if (!exitedAfterTerm) signalPosixProcessGroup(child.pid, "SIGKILL");
      }
      await waitForExit(child, 1500);
      if (this.child === child) this.child = undefined;
      this.snapshot = { ...this.snapshot, pid: undefined };
      return this.getSnapshot();
    };
    this.stopPromise = stop().finally(() => {
      this.stopPromise = undefined;
    });
    return this.stopPromise;
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

function signalPosixProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

function terminateWindowsProcessTree(pid: number | undefined): Promise<boolean> {
  if (!pid) return Promise.resolve(false);
  return new Promise((resolveTermination) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => resolveTermination(false));
    killer.once("exit", (code) => resolveTermination(code === 0));
  });
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
