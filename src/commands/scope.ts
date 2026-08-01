// ============================================================================
// Scope Command
// ----------------------------------------------------------------------------
// `scope current` reports the detected project identity. `scope show` and
// `scope set` inspect or atomically edit the shared Rule/Skill `appliesTo`
// contract. Mutations are delegated to the storage transaction so this command
// never performs ad hoc YAML/JSON rewriting.
// ============================================================================

import {
  formatAssetScope,
  normaliseAssetScope,
  normaliseProjectId,
  type AssetScope,
} from "../schema/asset-scope.js";
import {
  readAssetScopeFile,
  updateAssetScopeFile,
} from "../storage/asset-scope-editor.js";
import { resolveProjectIdentity } from "../storage/project-identity.js";

export interface ScopeOptions {
  action?: string;
  file?: string;
  global?: boolean;
  projects?: string;
  currentProject?: boolean;
  projectRoot?: string;
  expectedSha256?: string;
  json?: boolean;
}

export async function cmdScope(options: ScopeOptions): Promise<void> {
  const action = options.action ?? "current";
  if (action === "current") {
    const identity = await resolveProjectIdentity(options.projectRoot);
    print(identity, options.json);
    return;
  }
  if (!options.file) throw new Error(`scope ${action} requires <file>`);

  if (action === "show") {
    const asset = await readAssetScopeFile(options.file);
    print({ ...asset, scope: formatAssetScope(asset.appliesTo) }, options.json);
    return;
  }
  if (action !== "set") {
    throw new Error("Usage: skill-central scope [current|show|set] [file]");
  }

  const appliesTo = await requestedScope(options);
  const asset = await updateAssetScopeFile(options.file, appliesTo, {
    expectedSha256: options.expectedSha256,
  });
  print({ ...asset, scope: formatAssetScope(asset.appliesTo) }, options.json);
}

async function requestedScope(options: ScopeOptions): Promise<AssetScope> {
  // Modes are mutually exclusive to prevent an ambiguous command from
  // silently broadening or narrowing where an asset applies.
  const modes = [options.global, options.currentProject, Boolean(options.projects)].filter(Boolean);
  if (modes.length !== 1) {
    throw new Error("scope set requires exactly one of --global, --current-project, or --projects");
  }
  if (options.global) return "global";
  if (options.currentProject) {
    const identity = await resolveProjectIdentity(options.projectRoot);
    return { projects: [identity.id] };
  }
  const projects = (options.projects ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normaliseProjectId);
  if (projects.length === 0) throw new Error("--projects requires at least one project id");
  return normaliseAssetScope({ projects });
}

function print(value: unknown, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (isAsset(value)) {
    console.log("");
    console.log(`  ${value.assetType} ${value.assetId}`);
    console.log(`  File  : ${value.filePath}`);
    console.log(`  Scope : ${value.scope}`);
    console.log(`  SHA   : ${value.sha256}`);
    console.log("");
    return;
  }
  const identity = value as { id: string; aliases: string[]; root: string; source: string };
  console.log("");
  console.log(`  Project ID : ${identity.id}`);
  console.log(`  Source     : ${identity.source}`);
  console.log(`  Root       : ${identity.root}`);
  console.log(`  Aliases    : ${identity.aliases.join(", ")}`);
  console.log("");
}

function isAsset(value: unknown): value is {
  assetType: string;
  assetId: string;
  filePath: string;
  scope: string;
  sha256: string;
} {
  return typeof value === "object" && value !== null && "assetType" in value;
}
