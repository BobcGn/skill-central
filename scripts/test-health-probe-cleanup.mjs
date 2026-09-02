#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { checkIdeConnectionHealth } from "../dist/health/ide-connection.js";

const root = await mkdtemp(path.join(tmpdir(), "skill-central-health-cleanup."));
const configPath = path.join(root, "cursor-mcp.json");
const engine = {
  waitForReady: async () => undefined,
  querySkills: () => ({ skills: [] }),
};

try {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pidPath = path.join(root, `probe-${attempt}.pid`);
    await writeFile(configPath, JSON.stringify({
      mcpServers: {
        "skill-central": {
          command: process.execPath,
          args: [
            "-e",
            "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
            pidPath,
          ],
        },
      },
    }));

    const health = await checkIdeConnectionHealth("cursor", engine, {
      configPath,
      verify: true,
      timeoutMs: 100,
    });
    assert.equal(health.status, "handshake-failed");
    assert.equal(health.failureStage, "initialize");
    assert.match(health.errorSummary ?? "", /timed out/);
    const pid = Number(await readFile(pidPath, "utf8"));
    assert(Number.isInteger(pid) && pid > 0, "probe fixture did not report a PID");
    await assertProcessMissing(pid);
  }
  console.log("Health probe cleanup contract passed: repeated timeouts leave no child process.");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function assertProcessMissing(pid) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 25));
    } catch (err) {
      if (err?.code === "ESRCH") return;
      throw err;
    }
  }
  throw new Error(`health probe process ${pid} still exists after timeout cleanup`);
}
