// ============================================================================
// Storage / Asset Library
// ----------------------------------------------------------------------------
// Resolves the one explicit Skill + Rule source used by CLI, MCP, and Board.
// Project mode reads `.skills/` + `.rules/`. Custom mode is an opt-in user
// choice whose root must contain `skills/` + `rules/`.
// ============================================================================

import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const ASSET_LIBRARY_ROOT_ENV = "SKILL_CENTRAL_ASSET_ROOT";
export const ASSET_LIBRARY_SETTINGS_PATH_ENV = "SKILL_CENTRAL_SETTINGS_PATH";

export interface AssetLibraryContext {
  mode: "project" | "custom";
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
  const explicitRoot = nonEmptyString(environment[ASSET_LIBRARY_ROOT_ENV])
    ? environment[ASSET_LIBRARY_ROOT_ENV]
    : readAssetLibraryRoot(options);

  if (explicitRoot) {
    try {
      return validateCustomAssetLibrary(explicitRoot);
    } catch (err) {
      console.warn(`[skill-central] Ignoring unavailable custom asset library: ${errorMessage(err)}`);
    }
  }

  return {
    mode: "project",
    rootDir: root,
    skillsDir: path.join(root, ".skills"),
    rulesDir: path.join(root, ".rules"),
  };
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
