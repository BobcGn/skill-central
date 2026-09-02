#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { shutdownDesktopServices } from "../dist/desktop/shutdown.js";
import { LocalRuntimeManager } from "../dist/runtime/manager.js";

const dormant = new LocalRuntimeManager();
assert.equal(dormant.getSnapshot().status, "stopped");
assert.equal(dormant.getSnapshot().pid, undefined, "Runtime must be lazy by default");

const stubborn = new LocalRuntimeManager({
  command: process.execPath,
  args: ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);"],
});
const stubbornPid = stubborn.start().pid;
assert(stubbornPid, "stubborn runtime did not start");
assert.equal(stubborn.start().pid, stubbornPid, "repeated start must reuse the owned Runtime");
await new Promise((resolve) => setTimeout(resolve, 150));
const [stopped] = await Promise.all([stubborn.stop(), stubborn.stop()]);
assert.equal(stopped.status, "stopped");
await assertProcessMissing(stubbornPid);

if (process.platform !== "win32") {
  const tree = new LocalRuntimeManager({
    command: process.execPath,
    args: ["-e", [
      "const {spawn}=require('node:child_process')",
      "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})",
      "console.log(child.pid)",
      "process.on('SIGTERM',()=>{})",
      "setInterval(()=>{},1000)",
    ].join(";")],
  });
  const treePid = tree.start().pid;
  assert(treePid, "process-tree fixture did not start");
  const descendantPid = await waitForStdoutPid(tree);
  const stopping = tree.stop();
  assert.equal(tree.start().pid, treePid, "start during stop must not allocate another Runtime");
  await stopping;
  await assertProcessMissing(treePid);
  await assertProcessMissing(descendantPid);
}

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

async function waitForStdoutPid(runtime) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = Number(runtime.getSnapshot().stdoutLines[0]);
    if (Number.isInteger(value) && value > 0) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Runtime descendant PID was not reported");
}

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
