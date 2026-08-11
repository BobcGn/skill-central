#!/usr/bin/env node
import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const script = path.join("scripts", "test.sh");
const bash = process.platform === "win32" ? resolveWindowsBash() : "bash";
const result = spawnSync(bash, [script], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(`[skill-central] Failed to start test runner: ${result.error.message}`);
  if (process.platform === "win32") {
    console.error("[skill-central] Install Git for Windows or set SKILL_CENTRAL_BASH to a Git Bash executable.");
  }
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);

const mcpGate = spawnSync(process.execPath, [path.join("scripts", "test-mcp-protocol.mjs")], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: false,
});
if (mcpGate.error) {
  console.error(`[skill-central] Failed to start MCP release gate: ${mcpGate.error.message}`);
  process.exit(1);
}

process.exit(mcpGate.status ?? 1);

function resolveWindowsBash() {
  const explicit = process.env.SKILL_CENTRAL_BASH;
  if (explicit && canExecute(explicit)) return explicit;

  const candidates = [
    process.env.GIT_BASH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canExecute(candidate)) return candidate;
  }

  return "bash";
}

function canExecute(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
