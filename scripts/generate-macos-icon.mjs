#!/usr/bin/env node
// ============================================================================
// macOS Icon Generator
// ----------------------------------------------------------------------------
// Derives both the packaged application icon and the small menu-bar image from
// the canonical web favicon using macOS system tooling. Non-macOS builds skip
// this step because their packaging targets do not consume ICNS assets.
// ============================================================================

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

if (process.platform !== "darwin") {
  console.log("Skipping macOS icon generation on this platform.");
  process.exit(0);
}

const source = path.resolve("src/web/static/favicon.ico");
const output = path.resolve("build/icon.icns");
const trayOutput = path.resolve("src/web/static/tray.png");
mkdirSync(path.dirname(output), { recursive: true });
execFileSync("/usr/bin/sips", ["-s", "format", "icns", source, "--out", output], {
  stdio: "inherit",
});
execFileSync("/usr/bin/sips", ["-s", "format", "png", "-z", "32", "32", source, "--out", trayOutput], {
  stdio: "inherit",
});
