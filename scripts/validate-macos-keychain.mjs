#!/usr/bin/env node
// Runs the safeStorage boundary in two real Electron main processes. All token
// files live under a temporary root; only the macOS Keychain encryption key is
// intentionally allowed to persist, matching normal application behavior.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, "validate-macos-keychain-worker.mjs");
const validationRoot = await mkdtemp(path.join(tmpdir(), "skill-central-keychain-validation."));
const appStateDir = path.join(validationRoot, "app-state");
const userDataDir = path.join(validationRoot, "electron-user-data");
const tokenFixture = `synthetic-keychain-token-${process.pid}-${Date.now()}`;
const legacyPath = path.join(appStateDir, "tokens", "github.token.json");
const encryptedPath = path.join(appStateDir, "tokens", "github.token.enc.json");
const activeChildren = new Set();
let interrupted = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = true;
    for (const child of activeChildren) child.kill("SIGTERM");
  });
}

if (process.platform !== "darwin") {
  console.error("macOS Keychain validation must run on macOS.");
  process.exit(2);
}

try {
  await mkdir(path.dirname(legacyPath), { recursive: true, mode: 0o700 });
  await writeFile(legacyPath, JSON.stringify({ accessToken: tokenFixture }), { mode: 0o600 });

  const writeResult = await runWorker("write");
  assertSafeOutput(writeResult);
  if (await exists(legacyPath)) throw new Error("legacy plaintext token was not removed");

  const encrypted = await readFile(encryptedPath, "utf8");
  if (encrypted.includes(tokenFixture) || encrypted.includes('"accessToken"')) {
    throw new Error("encrypted token file contains plaintext credential material");
  }

  const readDeleteResult = await runWorker("read-delete");
  assertSafeOutput(readDeleteResult);
  if (await exists(encryptedPath)) throw new Error("logout did not delete encrypted token file");

  console.log(JSON.stringify({
    ok: true,
    backend: "macos-keychain",
    checks: [
      "legacy-plaintext-removed",
      "ciphertext-hides-token",
      "cross-process-decrypt",
      "restricted-file-permissions",
      "logout-removes-ciphertext",
      "captured-output-redacted",
    ],
  }, null, 2));
} catch (err) {
  console.error(`macOS Keychain validation failed: ${safeFailureCode(err)}`);
  process.exitCode = 1;
} finally {
  await rm(validationRoot, { recursive: true, force: true });
  if (interrupted) process.exitCode = 130;
}

function runWorker(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [workerPath, mode, appStateDir, userDataDir], {
      env: {
        ...process.env,
        SC_SAFE_STORAGE_TEST_TOKEN: tokenFixture,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    let lastStage = "spawn";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`ELECTRON_TIMEOUT_${stageCode(lastStage)}`));
    }, 20_000);
    timeout.unref();
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString();
      stderr += value;
      const match = value.match(/SC_KEYCHAIN_STAGE:([a-z-]+)/);
      if (match) lastStage = match[1];
    });
    child.once("error", () => {
      clearTimeout(timeout);
      activeChildren.delete(child);
      reject(new Error("ELECTRON_START_FAILED"));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      activeChildren.delete(child);
      if (signal || code !== 0) {
        reject(new Error(signal ? `ELECTRON_SIGNAL_${stageCode(lastStage)}` : `ELECTRON_WORKER_${stageCode(lastStage)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function assertSafeOutput({ stdout, stderr }) {
  const captured = `${stdout}\n${stderr}`;
  if (captured.includes(tokenFixture)) throw new Error("CAPTURED_OUTPUT_LEAKED_TOKEN");
  if (!stdout.includes('"ok":true')) throw new Error("ELECTRON_WORKER_RESULT_MISSING");
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

function safeFailureCode(err) {
  if (!(err instanceof Error)) return "UNKNOWN_FAILURE";
  return /^[A-Z0-9_]+$/.test(err.message) ? err.message : "VALIDATION_ASSERTION_FAILED";
}

function stageCode(stage) {
  return stage.toUpperCase().replaceAll("-", "_");
}
