#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { shutdownDesktopServices } from "../dist/desktop/shutdown.js";
import { LocalRuntimeManager } from "../dist/runtime/manager.js";

const stubborn = new LocalRuntimeManager({
  command: process.execPath,
  args: ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);"],
});
const stubbornPid = stubborn.start().pid;
assert(stubbornPid, "stubborn runtime did not start");
await new Promise((resolve) => setTimeout(resolve, 150));
const stopped = await stubborn.stop();
assert.equal(stopped.status, "stopped");
await assertProcessMissing(stubbornPid);

const events = [];
const runtime = {
  getSnapshot: () => ({ status: "running", transport: "stdio", command: "fixture", args: [], stdoutLines: [], stderrLines: [] }),
  start: () => ({ status: "running", transport: "stdio", command: "fixture", args: [], stdoutLines: [], stderrLines: [] }),
  stop: async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    events.push("runtime-stopped");
    return { status: "stopped", transport: "stdio", command: "fixture", args: [], stdoutLines: [], stderrLines: [] };
  },
};
const server = {
  listening: true,
  close: (callback) => {
    setTimeout(() => {
      events.push("server-closed");
      callback?.();
    }, 120);
  },
};

await shutdownDesktopServices({ runtime, server });
assert.deepEqual(events.sort(), ["runtime-stopped", "server-closed"]);
const desktopSource = await readFile(new URL("../src/desktop/main.ts", import.meta.url), "utf8");
assert.match(desktopSource, /accelerator:\s*"CommandOrControl\+Q"/);
assert.match(desktopSource, /click:\s*requestDesktopQuit/);
assert.match(desktopSource, /app\.on\("before-quit",[\s\S]*requestDesktopQuit\(\)/);
assert.match(desktopSource, /setTimeout\([\s\S]*forcing the cleaned main process to exit[\s\S]*5000\)/);
console.log("Desktop shutdown contract passed: runtime child is reaped and Board close is awaited.");

async function assertProcessMissing(pid) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (err) {
      if (err?.code === "ESRCH") return;
      throw err;
    }
  }
  throw new Error(`runtime process ${pid} still exists after stop()`);
}
