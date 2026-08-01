#!/usr/bin/env node
// ============================================================================
// macOS / Homebrew Diagnostic
// ----------------------------------------------------------------------------
// Performs read-only checks for Tap trust, Cask ownership, bundle identity,
// version agreement, single-process background behavior, and the loopback Board
// listener. It reports remediation evidence without changing Homebrew or the
// installed application.
// ============================================================================

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";

const TAP_NAME = "bobcgn/skill-central";
const CASK_REFERENCE = `${TAP_NAME}/skill-central`;
const APP_PATH = "/Applications/Skill Central.app";
const EXECUTABLE_PATH = `${APP_PATH}/Contents/MacOS/Skill Central`;

console.log("Skill Central macOS/Homebrew diagnostic (read-only)");
console.log(`Platform: ${process.platform} ${process.arch}`);

if (process.platform !== "darwin") {
  console.log("Result: FAIL - this diagnostic must run on macOS.");
  process.exitCode = 1;
} else {
  await diagnose();
}

async function diagnose() {
  let warnings = 0;
  let installedCaskVersions = [];
  const brew = await findBrew();
  if (!brew) {
    console.log("Homebrew: MISSING (/opt/homebrew/bin/brew and /usr/local/bin/brew checked)");
    console.log("Result: FAIL - install Homebrew before testing the Cask route.");
    process.exitCode = 1;
    return;
  }

  const brewVersion = await run(brew, ["--version"]);
  console.log(`Homebrew: ${firstLine(brewVersion.stdout) || "unknown version"} (${brew})`);

  const tapResult = await run(brew, ["tap-info", "--json=v1", TAP_NAME]);
  if (tapResult.exitCode !== 0) {
    console.log(`Tap: ERROR - ${oneLine(tapResult.stderr || tapResult.stdout)}`);
    warnings += 1;
  } else {
    try {
      const taps = JSON.parse(tapResult.stdout || "[]");
      const tap = Array.isArray(taps) ? taps.find((entry) => entry?.name === TAP_NAME) : undefined;
      console.log(`Tap: ${tap?.installed ? "installed" : "not installed"}; trusted=${String(tap?.trusted === true)}`);
      console.log(`Tap remote: ${tap?.remote || "unavailable"}`);
      if (!tap?.installed || tap?.trusted !== true) warnings += 1;
    } catch (error) {
      console.log(`Tap: ERROR - invalid JSON (${errorMessage(error)})`);
      warnings += 1;
    }
  }

  const cask = await run(brew, ["list", "--cask", "--versions", CASK_REFERENCE]);
  if (cask.exitCode === 0) {
    console.log(`Cask ownership: managed (${oneLine(cask.stdout)})`);
    installedCaskVersions = cask.stdout.trim().split(/\s+/).slice(1);
  } else {
    console.log("Cask ownership: not managed by bobcgn/skill-central/skill-central");
    warnings += 1;
  }

  const appVersion = await plistValue("CFBundleShortVersionString");
  const bundleId = await plistValue("CFBundleIdentifier");
  console.log(`Application: ${appVersion ? `${APP_PATH} version ${appVersion}` : "not found or unreadable"}`);
  console.log(`Bundle ID: ${bundleId || "unavailable"}`);
  if (!appVersion || bundleId !== "dev.skillcentral.app") warnings += 1;
  if (appVersion && installedCaskVersions.length > 0 && !installedCaskVersions.includes(appVersion)) {
    console.log(`Version agreement: FAIL - app=${appVersion}, Cask=${installedCaskVersions.join(",")}`);
    warnings += 1;
  } else if (appVersion && installedCaskVersions.includes(appVersion)) {
    console.log(`Version agreement: PASS (${appVersion})`);
  }

  const processes = await run("/bin/ps", ["-axo", "pid=,command="]);
  const appProcesses = processes.exitCode === 0 ? processes.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(EXECUTABLE_PATH)) : [];
  if (processes.exitCode !== 0) {
    console.log(`Background process: unavailable (${oneLine(processes.stderr || "process inspection was denied")})`);
    console.log("Board listener: not checked because the app process is unavailable");
    warnings += 1;
  } else if (appProcesses.length > 0) {
    console.log(`Background process: ${appProcesses.length === 1 ? "one app process" : `${appProcesses.length} app processes`}`);
    const pid = appProcesses[0].split(/\s+/, 1)[0];
    const lsof = await run("/usr/sbin/lsof", ["-nP", "-a", "-p", pid, "-iTCP", "-sTCP:LISTEN"]);
    const listeners = lsof.stdout
      .split("\n")
      .filter((line) => /127\.0\.0\.1:\d+\s+\(LISTEN\)/.test(line));
    console.log(`Board listener: ${listeners.length > 0 ? oneLine(listeners.slice(0, 2).join("; ")) : "not detected"}`);
    if (appProcesses.length !== 1 || listeners.length !== 1) warnings += 1;
  } else {
    console.log("Background process: no app process");
    console.log("Board listener: not checked because Skill Central is not running");
    warnings += 1;
  }

  console.log(`Result: ${warnings === 0 ? "PASS" : `WARN (${warnings} item${warnings === 1 ? "" : "s"})`}`);
  if (warnings > 0) process.exitCode = 1;
}

async function findBrew() {
  for (const candidate of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the Intel or Apple Silicon location.
    }
  }
  return undefined;
}

async function plistValue(key) {
  const result = await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", `${APP_PATH}/Contents/Info.plist`]);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

function run(command, args) {
  return new Promise((resolve) => {
    let settled = false;
    try {
      const child = execFile(command, args, { encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (settled) return;
        settled = true;
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout: stdout || "",
          stderr: stderr || "",
        });
      });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode: 1, stdout: "", stderr: error.message });
      });
    } catch (error) {
      settled = true;
      resolve({ exitCode: 1, stdout: "", stderr: errorMessage(error) });
    }
  });
}

function firstLine(value) {
  return value.trim().split("\n", 1)[0];
}

function oneLine(value) {
  return value.trim().replace(/\s+/g, " ");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
