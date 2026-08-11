// ============================================================================
// Storage / Asset Library
// ----------------------------------------------------------------------------
// Resolves the one explicit Skill + Rule source used by CLI, MCP, and Board.
// Default mode reads `~/.skill-central/skills` + `rules` and creates those
// directories on first startup. A governed project config remains an explicit
// project override, while custom mode is a persisted user choice whose root
// must contain `skills/` + `rules/`.
// ============================================================================

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const ASSET_LIBRARY_ROOT_ENV = "SKILL_CENTRAL_ASSET_ROOT";
export const ASSET_LIBRARY_SETTINGS_PATH_ENV = "SKILL_CENTRAL_SETTINGS_PATH";
export const DEFAULT_ASSET_LIBRARY_ROOT_ENV = "SKILL_CENTRAL_DEFAULT_ASSET_ROOT";

export interface AssetLibraryContext {
  mode: "default" | "project" | "custom";
  rootDir: string;
  skillsDir: string;
  rulesDir: string;
}

interface AssetLibrarySettings {
  schemaVersion: "skillcentral.dev/settings/v1";
  assetLibraryRoot: string | null;
  updatedAt: string;
}

export interface ResolveAssetLibraryOptions {
  environment?: NodeJS.ProcessEnv;
  homeDir?: string;
  settingsPath?: string;
}

export function resolveAssetLibrary(
  projectRoot: string = process.cwd(),
  options: ResolveAssetLibraryOptions = {},
): AssetLibraryContext {
  const root = path.resolve(projectRoot);
  const environment = options.environment ?? process.env;
  // The Home library is a product-level invariant, not merely a fallback.
  // Initialize it on every process startup even when an explicit project or
  // custom library becomes the active source for this workspace.
  const defaultLibrary = ensureDefaultAssetLibrary(options);
  const explicitRoot = nonEmptyString(environment[ASSET_LIBRARY_ROOT_ENV])
    ? environment[ASSET_LIBRARY_ROOT_ENV]
    : readAssetLibraryRoot(options);

  if (explicitRoot) {
    try {
      const custom = validateCustomAssetLibrary(explicitRoot);
      return custom.rootDir === defaultLibrary.rootDir
        ? defaultLibrary
        : custom;
    } catch (err) {
      console.warn(`[skill-central] Ignoring unavailable custom asset library: ${errorMessage(err)}`);
    }
  }

  if (hasProjectAssetConfig(root)) {
    return {
      mode: "project",
      rootDir: root,
      skillsDir: path.join(root, ".skills"),
      rulesDir: path.join(root, ".rules"),
    };
  }

  return defaultLibrary;
}

export function resolveDefaultAssetLibraryRoot(
  options: ResolveAssetLibraryOptions = {},
): string {
  const environment = options.environment ?? process.env;
  return path.resolve(
    environment[DEFAULT_ASSET_LIBRARY_ROOT_ENV]
      ?? path.join(options.homeDir ?? homedir(), ".skill-central"),
  );
}

export function ensureDefaultAssetLibrary(
  options: ResolveAssetLibraryOptions = {},
): AssetLibraryContext {
  const rootDir = resolveDefaultAssetLibraryRoot(options);
  const skillsDir = path.join(rootDir, "skills");
  const rulesDir = path.join(rootDir, "rules");
  try {
    mkdirSync(skillsDir, { recursive: true, mode: 0o700 });
    mkdirSync(rulesDir, { recursive: true, mode: 0o700 });
  } catch (err) {
    throw new Error(
      `cannot initialize default asset library at ${rootDir}: ${errorMessage(err)}`,
    );
  }
  return { mode: "default", rootDir, skillsDir, rulesDir };
}

export function validateCustomAssetLibrary(rootDir: string): AssetLibraryContext {
  const root = path.resolve(rootDir);
  requireDirectory(root, "asset library root");
  const skillsDir = path.join(root, "skills");
  const rulesDir = path.join(root, "rules");
  requireDirectory(skillsDir, "skills directory");
  requireDirectory(rulesDir, "rules directory");
  return { mode: "custom", rootDir: root, skillsDir, rulesDir };
}

export async function saveCustomAssetLibrary(
  rootDir: string,
  options: ResolveAssetLibraryOptions = {},
): Promise<AssetLibraryContext> {
  const context = validateCustomAssetLibrary(rootDir);
  await writeSettings({
    schemaVersion: "skillcentral.dev/settings/v1",
    assetLibraryRoot: context.rootDir,
    updatedAt: new Date().toISOString(),
  }, options);
  return context;
}

export async function clearCustomAssetLibrary(
  options: ResolveAssetLibraryOptions = {},
): Promise<void> {
  await writeSettings({
    schemaVersion: "skillcentral.dev/settings/v1",
    assetLibraryRoot: null,
    updatedAt: new Date().toISOString(),
  }, options);
}

export async function useDefaultAssetLibrary(
  options: ResolveAssetLibraryOptions = {},
): Promise<AssetLibraryContext> {
  const context = ensureDefaultAssetLibrary(options);
  await writeSettings({
    schemaVersion: "skillcentral.dev/settings/v1",
    assetLibraryRoot: context.rootDir,
    updatedAt: new Date().toISOString(),
  }, options);
  return context;
}

export function resolveAssetLibrarySettingsPath(
  options: ResolveAssetLibraryOptions = {},
): string {
  const environment = options.environment ?? process.env;
  return path.resolve(
    options.settingsPath
      ?? environment[ASSET_LIBRARY_SETTINGS_PATH_ENV]
      ?? path.join(options.homeDir ?? homedir(), ".skill-central", "settings.json"),
  );
}

function readAssetLibraryRoot(options: ResolveAssetLibraryOptions): string | undefined {
  const filePath = resolveAssetLibrarySettingsPath(options);
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<AssetLibrarySettings>;
    if (parsed.schemaVersion !== "skillcentral.dev/settings/v1") {
      console.warn(`[skill-central] Ignoring settings with unsupported schemaVersion: ${filePath}`);
      return undefined;
    }
    return nonEmptyString(parsed.assetLibraryRoot) ? parsed.assetLibraryRoot : undefined;
  } catch (err) {
    console.warn(`[skill-central] Ignoring unreadable asset library settings: ${filePath}: ${errorMessage(err)}`);
    return undefined;
  }
}

function hasProjectAssetConfig(rootDir: string): boolean {
  return ["skill-central.yaml", "skill-central.yml"]
    .some((name) => existsSync(path.join(rootDir, name)));
}

async function writeSettings(
  settings: AssetLibrarySettings,
  options: ResolveAssetLibraryOptions,
): Promise<void> {
  const filePath = resolveAssetLibrarySettingsPath(options);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporaryPath, filePath);
}

function requireDirectory(directory: string, label: string): void {
  try {
    if (!statSync(directory).isDirectory()) {
      throw new Error(`${label} is not a directory: ${directory}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(`${label} is not a directory:`)) throw err;
    throw new Error(`${label} does not exist or is not readable: ${directory}`);
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
