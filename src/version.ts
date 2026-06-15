// ============================================================================
// skill-central · Single source of truth for the package version
// ----------------------------------------------------------------------------
// CLI `--version`, MCP `serverInfo.version`, and the web board's
// `/api/health.version` MUST all agree with the published npm tarball.
//
// Three options were considered:
//
//   1. Read `package.json` at runtime via fs.readFileSync — works but adds
//      an I/O call on every CLI startup and couples to dist/ layout.
//
//   2. `process.env.npm_package_version` — only populated by `npm run`,
//      not by `node dist/index.js` or by global installs.
//
//   3. Import the JSON at compile time (this file). `resolveJsonModule`
//      inlines the literal into the compiled JS, so the value is frozen
//      at build time and matches what the publish step just packed.
//      `prepublishOnly` runs `npm run build` first, so this stays in
//      lockstep with the published version.
//
// This module deliberately exports only `VERSION` (not the whole pkg) so
// callers can't accidentally read other fields that change less often.
// ============================================================================

import pkg from "../package.json" with { type: "json" };

/**
 * The package version string. Mirrors `package.json#version`.
 *
 * @example
 * ```ts
 * import { VERSION } from "./version.js";
 * program.version(VERSION);
 * ```
 */
export const VERSION: string = pkg.version;