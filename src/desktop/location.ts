// ============================================================================
// Install Location Defense
// ----------------------------------------------------------------------------
// Detects whether a packaged executable is running from an unpacked build
// location (e.g. `release-artifacts/mac-arm64/Skill Central.app`, Windows
// `win-unpacked/Skill Central.exe`) instead of the official install directory
// (/Applications on macOS, Program Files on Windows).
//
// Build scripts clean these staging copies after packaging, but a copy that
// already exists — or one produced by an older toolchain — can still be
// launched by hand. Running it next to the installed application creates
// confusing duplicates (extra Dock icons, a single-instance lock that silently
// redirects to another copy). The desktop entry point warns about this state
// so the duplicate is observable instead of mysterious.
//
// Path matching is deliberately separator- and case-insensitive so the same
// check is correct on macOS, Windows, and Linux.
// ============================================================================

const UNPACKED_PATH_PATTERN =
  /(^|\/)(release-artifacts|win-unpacked|__msi[^/]*|__uninstaller[^/]*)(\/|$)/;

/**
 * True when `execPath` looks like a build-staging copy rather than an
 * installed application. Normalizes backslashes and case before matching.
 */
export function isUnpackedBuildLocation(execPath: string): boolean {
  const normalized = execPath.replace(/\\/g, "/").toLowerCase();
  return UNPACKED_PATH_PATTERN.test(normalized);
}
