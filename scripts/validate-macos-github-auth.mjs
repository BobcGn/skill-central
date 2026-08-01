#!/usr/bin/env node
// Coordinates a real GitHub Device Flow in Electron while keeping credentials
// and native failures out of terminal output. The temporary app-state root is
// always removed; revoking the OAuth grant remains a separate GitHub action.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, "validate-macos-github-auth-worker.mjs");
const clientId = process.env.SKILL_CENTRAL_GITHUB_CLIENT_ID?.trim();
let validationRoot;
let child;
let interrupted = false;

if (process.platform !== "darwin") {
  console.error("Real desktop authentication validation must run on macOS.");
  process.exit(2);
}
if (!clientId || !/^[A-Za-z0-9._-]{8,128}$/.test(clientId)) {
  console.error("Real desktop authentication validation requires a valid project OAuth Client ID.");
  process.exit(2);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = true;
    child?.kill("SIGTERM");
  });
}

try {
  validationRoot = await mkdtemp(path.join(tmpdir(), "skill-central-github-auth."));
  const result = await runWorker();
  if (!result.ok) throw new Error(result.code);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`GitHub authentication validation failed: ${safeFailureCode(err)}`);
  process.exitCode = 1;
} finally {
  if (validationRoot) {
    try {
      await rm(validationRoot, { recursive: true, force: true });
    } catch {
      // Paths and native filesystem failures are intentionally excluded.
      console.error("GitHub authentication validation failed: AUTH_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }
  if (interrupted) process.exitCode = 130;
}

function runWorker() {
  return new Promise((resolve, reject) => {
    child = spawn(electronPath, [
      workerPath,
      path.join(validationRoot, "app-state"),
      path.join(validationRoot, "electron-user-data"),
    ], {
      env: {
        ...process.env,
        SKILL_CENTRAL_GITHUB_CLIENT_ID: clientId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let lastStage = "spawn";
    let completedResult;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child?.kill("SIGTERM");
    }, 20 * 60 * 1000);
    timeout.unref();

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseSafeEvent(line);
        if (!event) continue;
        if (event.event === "authorization-required") {
          console.log(`GitHub authorization URL: ${event.verificationUri}`);
          console.log(`GitHub one-time code: ${event.userCode}`);
          console.log(`Requested OAuth scope: ${event.scope}`);
          console.log("Approve the request in the browser. No repository operation will be performed.");
        } else if (event.event === "complete") {
          completedResult = event.result;
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const match = line.match(/^SC_GITHUB_AUTH_STAGE:([a-z-]+)$/);
        if (match) lastStage = match[1];
      }
    });
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("AUTH_ELECTRON_START_FAILED"));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      child = undefined;
      if (timedOut) {
        reject(new Error(`AUTH_TIMEOUT_${stageCode(lastStage)}`));
        return;
      }
      if (signal) {
        reject(new Error(`AUTH_SIGNAL_${stageCode(lastStage)}`));
        return;
      }
      if (code !== 0 || !completedResult) {
        reject(new Error(`AUTH_WORKER_${stageCode(lastStage)}`));
        return;
      }
      resolve(completedResult);
    });
  });
}

function parseSafeEvent(line) {
  try {
    const event = JSON.parse(line);
    if (
      event?.event === "authorization-required"
      && event.verificationUri === "https://github.com/login/device"
      && typeof event.userCode === "string"
      && /^[A-Z0-9-]{4,16}$/.test(event.userCode)
      && event.scope === "repo"
    ) {
      return event;
    }
    if (
      event?.event === "complete"
      && event.result?.ok === true
      && event.result?.authenticated === true
      && event.result?.profileFetched === true
      && event.result?.encryptedPersistence === true
      && event.result?.localLogout === true
    ) {
      // Rebuild the event so unrecognized child fields can never reach output.
      return {
        event: "complete",
        result: {
          ok: true,
          authenticated: true,
          profileFetched: true,
          encryptedPersistence: true,
          localLogout: true,
        },
      };
    }
  } catch {
    // Ignore Electron/native output and any event outside the fixed schema.
  }
  return undefined;
}

function safeFailureCode(err) {
  if (!(err instanceof Error)) return "AUTH_UNKNOWN_FAILURE";
  return /^[A-Z0-9_]+$/.test(err.message) ? err.message : "AUTH_VALIDATION_FAILED";
}

function stageCode(stage) {
  return stage.toUpperCase().replaceAll("-", "_");
}
