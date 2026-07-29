// ============================================================================
// Local Store / App State
// ----------------------------------------------------------------------------
// Creates and reports local application state directories.
//
// Design intent:
// - Phase 4 sync/login features need durable local metadata, but that metadata
//   must be recoverable independently from skill source layers.
// - The manifest is deliberately small and machine-readable so CLI, Web Board,
//   and future desktop shells can show the same storage boundary evidence.
// ============================================================================

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveLocalStorePaths, type LocalStorePaths } from "./paths.js";

export interface AppStateManifest {
  schemaVersion: "skillcentral.dev/app-state/v1";
  createdAt: string;
  updatedAt: string;
  paths: LocalStorePaths;
  notes: string[];
}

export interface EnsureAppStateOptions {
  overrideDir?: string;
}

export async function ensureAppState(options: EnsureAppStateOptions = {}): Promise<AppStateManifest> {
  const paths = resolveLocalStorePaths({ overrideDir: options.overrideDir });
  for (const dir of [paths.root, paths.state, paths.audit, paths.cache, paths.sync, paths.tokens, paths.sessions]) {
    await mkdir(dir, { recursive: true });
  }

  const manifestPath = appStateManifestPath(paths);
  const now = new Date().toISOString();
  const existing = await readManifest(manifestPath);
  const manifest: AppStateManifest = {
    schemaVersion: "skillcentral.dev/app-state/v1",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    paths,
    notes: [
      "Skill source layers are intentionally not stored under app state.",
      "Token files in development fallback are metadata-only boundaries, not production credential storage.",
      "Workflow sessions live under app state so desktop restarts can resume orchestration without touching skill sources.",
    ],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  return manifest;
}

export function appStateManifestPath(paths: LocalStorePaths): string {
  return path.join(paths.state, "app-state.json");
}

async function readManifest(filePath: string): Promise<AppStateManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf-8")) as AppStateManifest;
    return parsed.schemaVersion === "skillcentral.dev/app-state/v1" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
