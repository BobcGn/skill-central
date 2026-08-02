#!/usr/bin/env node
// ============================================================================
// Unpacked App Cleanup (cross-platform)
// ----------------------------------------------------------------------------
// electron-builder writes complete runnable app bundles (macOS `.app`,
// Windows `win-unpacked/`, MSI staging dirs) into the configured output
// directory while building DMG/ZIP/EXE/MSI artifacts, and leaves them behind
// after the build. Those copies are not deliverables: keeping them means
// multiple runnable "Skill Central" applications exist next to the one
// officially installed in /Applications (macOS) or Program Files (Windows).
//
// This module removes exactly the known electron-builder intermediate
// directories from the output directory. It is deliberately conservative:
// only fixed, well-known names are deleted and real deliverables
// (*.dmg / *.zip / *.exe / *.msi / *.blockmap / *.yml) are never touched.
// Node `fs.rmSync` keeps the behavior identical on macOS and Windows, so the
// same logic protects platforms we cannot test right now.
// ============================================================================

import { rmSync, statSync } from "node:fs";
import { join } from "node:path";

// electron-builder intermediate directory names inside the output directory:
// - mac / mac-arm64 / mac-universal : macOS appOutDir per architecture
// - win / win-unpacked              : Windows appOutDir / NSIS unpacked app
// - __msi* / __uninstaller*         : MSI staging and NSIS uninstaller dirs
export const UNPACKED_DIR_NAMES = [
  "mac",
  "mac-arm64",
  "mac-universal",
  "win",
  "win-unpacked",
  "__msi",
  "__msi-x64",
  "__msi-arm64",
  "__uninstaller",
  "__uninstaller-nsis",
];

/**
 * Remove electron-builder intermediate unpacked app directories under
 * `outputDir`. Returns the list of removed directory names. Missing entries
 * are skipped silently; a non-directory entry with a matching name is left
 * untouched (never delete a real deliverable).
 *
 * @param {string} outputDir
 * @param {{ log?: (line: string) => void }} [options]
 * @returns {string[]}
 */
export function cleanupUnpackedArtifacts(outputDir, options = {}) {
  const log = options.log ?? ((line) => console.log(`[cleanup] ${line}`));
  const removed = [];
  for (const name of UNPACKED_DIR_NAMES) {
    const target = join(outputDir, name);
    let isDirectory = false;
    try {
      isDirectory = statSync(target).isDirectory();
    } catch {
      // Missing entry — nothing to remove.
      continue;
    }
    if (!isDirectory) {
      // Defensive: only directories are intermediate staging areas. A file
      // with the same name would be an unexpected deliverable — never delete.
      log(`skipped non-directory entry: ${name}`);
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    removed.push(name);
  }
  if (removed.length > 0) {
    log(`removed unpacked app dirs: ${removed.join(", ")}`);
  } else {
    log("no unpacked app dirs to remove");
  }
  return removed;
}
