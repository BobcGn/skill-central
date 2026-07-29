// ============================================================================
// Local Store / Paths
// ----------------------------------------------------------------------------
// Resolves desktop-safe application state locations.
//
// Design intent:
// - Skill source files remain governed by configured layers (`.skills`,
//   `~/.skill-central/skills`, team packages, etc.).
// - App state, audit logs, cache, token metadata, and sync metadata live in an
//   OS app-data directory by default. Deleting app state must not delete skills.
// - Tests and packaged desktop shells can override the root with
//   `SKILL_CENTRAL_APP_STATE_DIR`.
// ============================================================================

import { homedir, platform, tmpdir } from "node:os";
import path from "node:path";

export interface LocalStorePaths {
  root: string;
  state: string;
  audit: string;
  cache: string;
  sync: string;
  tokens: string;
  sessions: string;
}

export interface ResolveLocalStorePathsOptions {
  overrideDir?: string;
  platform?: NodeJS.Platform;
  homeDir?: string;
}

export function resolveLocalStorePaths(options: ResolveLocalStorePathsOptions = {}): LocalStorePaths {
  const root = path.resolve(
    options.overrideDir ??
      process.env.SKILL_CENTRAL_APP_STATE_DIR ??
      defaultAppStateRoot(options.platform ?? platform(), options.homeDir ?? homedir()),
  );

  return {
    root,
    state: path.join(root, "state"),
    audit: path.join(root, "audit"),
    cache: path.join(root, "cache"),
    sync: path.join(root, "sync"),
    tokens: path.join(root, "tokens"),
    sessions: path.join(root, "sessions"),
  };
}

function defaultAppStateRoot(os: NodeJS.Platform, home: string): string {
  if (os === "darwin") return path.join(home, "Library", "Application Support", "skill-central");
  if (os === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "skill-central",
    );
  }
  if (home && home !== "/") return path.join(home, ".local", "share", "skill-central");
  return path.join(tmpdir(), "skill-central");
}
