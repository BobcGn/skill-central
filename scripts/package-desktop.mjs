#!/usr/bin/env node
// ============================================================================
// Desktop Packaging Entrypoint
// ----------------------------------------------------------------------------
// Validates release-only metadata, injects the project's public GitHub OAuth
// Client ID into the packaged package.json, and invokes electron-builder with
// the repository's supported macOS or Windows target matrix.
// ============================================================================

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const platform = process.argv[2];
const clientId = process.env.SKILL_CENTRAL_GITHUB_CLIENT_ID?.trim();

if (platform !== "mac" && platform !== "win") {
  console.error("Usage: node scripts/package-desktop.mjs <mac|win>");
  process.exit(2);
}

if (!clientId) {
  console.error(
    "SKILL_CENTRAL_GITHUB_CLIENT_ID is required to package the desktop app. " +
    "Use the public client ID of the project-owned GitHub OAuth App with Device Flow enabled.",
  );
  process.exit(1);
}

if (!/^[A-Za-z0-9._-]{8,128}$/.test(clientId)) {
  console.error("SKILL_CENTRAL_GITHUB_CLIENT_ID has an invalid format.");
  process.exit(1);
}

const targetArgs = platform === "mac"
  ? ["--mac", "dmg", "zip", "--x64", "--arm64"]
  : ["--win", "nsis", "msi", "zip", "--x64"];
const args = [
  require.resolve("electron-builder/cli.js"),
  ...targetArgs,
  "--publish",
  "never",
  // Client IDs are public identifiers. A client secret must never be added to
  // this metadata or any other desktop artifact.
  `-c.extraMetadata.skillCentral.githubOAuthClientId=${clientId}`,
];

if (process.argv.includes("--print-args")) {
  console.log(JSON.stringify(args.slice(1)));
  process.exit(0);
}

const child = spawn(process.execPath, args, { stdio: "inherit" });
child.once("error", (error) => {
  console.error(`Unable to start electron-builder: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`electron-builder terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
