// ============================================================================
// Sync Command
// ----------------------------------------------------------------------------
// Phase 4 entrypoint for local-first sync state.
//
// Design intent:
// - `sync status` works without login and proves local app-state boundaries.
// - `sync login` starts GitHub Device Flow but persists tokens only through the
//   TokenStore boundary introduced in Phase 4A.
// - `sync repo --dry-run` previews private repo binding/creation; no GitHub
//   repo writes happen in this slice.
// - `sync scan --dry-run` validates a local checkout of the remote registry
//   layout before any push/pull code is allowed to write.
// - `sync plan --dry-run` turns local/remote hashes into an auditable operation
//   plan; apply code must consume this contract instead of reclassifying files.
// - `sync apply` consumes that plan, creates backups for destructive writes, and
//   writes an app-state audit report.
// ============================================================================

import { ensureAppState } from "../local-store/app-state.js";
import { DevelopmentFileTokenStore, type TokenStore } from "../auth/token-store.js";
import {
  GitHubDeviceFlowClient,
  tokenResponseToStoredToken,
} from "../auth/github.js";
import {
  missingGitHubOAuthClientIdMessage,
  resolveGitHubOAuthClientId,
} from "../auth/github-config.js";
import { buildGitHubRegistryRepoPlan } from "../sync/github-registry.js";
import { scanRemoteRegistry } from "../sync/scanner.js";
import { buildSyncPlan, type SyncDirection, type SyncPlan } from "../sync/sync-engine.js";
import {
  applySyncPlan,
  SyncApplyBlockedError,
  type SyncApplyReport,
} from "../sync/sync-apply.js";
import { loadConfig } from "../storage/config.js";

export interface SyncOptions {
  action?: string;
  appStateDir?: string;
  json?: boolean;
  clientId?: string;
  poll?: boolean;
  owner?: string;
  repo?: string;
  exists?: boolean;
  dryRun?: boolean;
  force?: boolean;
  registryDir?: string;
  direction?: string;
}

const DEFAULT_GITHUB_SCOPE = "repo";

export async function cmdSync(opts: SyncOptions): Promise<void> {
  const action = opts.action ?? "status";
  if (action === "status") {
    await printStatus(opts);
    return;
  }
  if (action === "login") {
    await login(opts);
    return;
  }
  if (action === "logout") {
    await logout(opts);
    return;
  }
  if (action === "repo") {
    await repoPlan(opts);
    return;
  }
  if (action === "scan") {
    await scan(opts);
    return;
  }
  if (action === "plan") {
    await plan(opts);
    return;
  }
  if (action === "apply") {
    await apply(opts);
    return;
  }
  throw new Error(`Unsupported sync action: ${action}. Supported: status, login, logout, repo, scan, plan, apply`);
}

async function scan(opts: SyncOptions): Promise<void> {
  if (!opts.dryRun) {
    throw new Error("sync scan currently requires --dry-run; scanner is non-mutating by design.");
  }
  if (!opts.registryDir) {
    throw new Error("sync scan requires --registry-dir <path>");
  }
  await prepareLocalSync(opts);
  const report = await scanRemoteRegistry(opts.registryDir);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("");
  console.log("▸ Remote registry scan");
  console.log("  " + "-".repeat(72));
  console.log(`  Root        : ${report.root}`);
  console.log(`  Manifest    : ${report.manifestOk ? "ok" : "invalid"}`);
  console.log(`  Importable  : ${report.importableFiles.length}`);
  console.log(`  Workspaces  : ${report.workspaceProfiles.length}`);
  console.log(`  Unknown     : ${report.unknownFiles.length}`);
  console.log(`  Issues      : ${report.issues.length}`);
  if (report.issues.length > 0) {
    for (const issue of report.issues.slice(0, 10)) {
      console.log(`  • ${issue.filePath}: ${issue.fieldPath}: ${issue.reason}`);
    }
  }
  console.log("");
}

async function plan(opts: SyncOptions): Promise<void> {
  if (!opts.dryRun) {
    throw new Error("sync plan currently requires --dry-run; apply is not enabled in this slice.");
  }
  if (!opts.registryDir) {
    throw new Error("sync plan requires --registry-dir <path>");
  }
  const direction = parseDirection(opts.direction);
  await prepareLocalSync(opts);
  const config = loadConfig();
  const syncPlan = await buildSyncPlan({
    direction,
    registryDir: opts.registryDir,
    layers: config.layers,
  });
  if (opts.json) {
    console.log(JSON.stringify(syncPlan, null, 2));
    return;
  }
  printPlan(syncPlan);
}

async function apply(opts: SyncOptions): Promise<void> {
  if (opts.dryRun) {
    throw new Error("sync apply does not accept --dry-run; use sync plan for a non-mutating preview.");
  }
  if (!opts.registryDir) {
    throw new Error("sync apply requires --registry-dir <path>");
  }
  const direction = parseDirection(opts.direction);
  const { manifest } = await prepareLocalSync(opts);
  const config = loadConfig();
  const syncPlan = await buildSyncPlan({
    direction,
    registryDir: opts.registryDir,
    layers: config.layers,
  });
  try {
    const report = await applySyncPlan(syncPlan, {
      appState: manifest,
      force: !!opts.force,
    });
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printApplyReport(report);
  } catch (err) {
    if (err instanceof SyncApplyBlockedError) {
      if (opts.json) {
        console.log(JSON.stringify(err.report, null, 2));
        throw new Error("Sync apply blocked; review JSON report for blocked operations.");
      }
      printApplyReport(err.report);
      throw new Error("Sync apply blocked; no further action taken for blocked operations.");
    }
    throw err;
  }
}

async function printStatus(opts: SyncOptions): Promise<void> {
  const { manifest, tokenStore } = await prepareLocalSync(opts);
  const githubToken = await tokenStore.get("github");
  const report = {
    localFirst: true,
    loggedIn: !!githubToken,
    github: githubToken
      ? {
          tokenType: githubToken.tokenType,
          scope: githubToken.scope,
          updatedAt: githubToken.updatedAt,
        }
      : undefined,
    appState: manifest,
    tokenStore: tokenStore.describe(),
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("");
  console.log("▸ Sync status");
  console.log("  " + "-".repeat(72));
  console.log(`  Local-first : ${report.localFirst ? "yes" : "no"}`);
  console.log(`  GitHub login: ${report.loggedIn ? "present" : "not configured"}`);
  console.log(`  App state   : ${manifest.paths.root}`);
  console.log(`  Audit logs  : ${manifest.paths.audit}`);
  console.log(`  Sync meta   : ${manifest.paths.sync}`);
  console.log(`  Cache       : ${manifest.paths.cache}`);
  console.log(`  Token store : ${report.tokenStore.kind}`);
  console.log(`  Token path  : ${report.tokenStore.path ?? "(managed by OS)"}`);
  if (report.github?.scope) console.log(`  Scope       : ${report.github.scope}`);
  if (report.tokenStore.warning) console.log(`  Warning     : ${report.tokenStore.warning}`);
  console.log("");
}

async function login(opts: SyncOptions): Promise<void> {
  const { tokenStore } = await prepareLocalSync(opts);
  const clientId = resolveGitHubOAuthClientId({ override: opts.clientId });
  if (!clientId) {
    throw new Error(missingGitHubOAuthClientIdMessage());
  }
  const client = new GitHubDeviceFlowClient({
    clientId,
    scope: DEFAULT_GITHUB_SCOPE,
  });
  const device = await client.requestDeviceCode();
  const report = {
    provider: "github",
    userCode: device.userCode,
    verificationUri: device.verificationUri,
    expiresIn: device.expiresIn,
    interval: device.interval,
    polling: !!opts.poll,
    stored: false,
  };

  if (opts.poll) {
    const token = await pollUntilToken(client, device.deviceCode, device.interval, device.expiresIn);
    await tokenStore.set(tokenResponseToStoredToken(token));
    report.stored = true;
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("");
  console.log("▸ GitHub device login");
  console.log("  " + "-".repeat(72));
  console.log(`  Open : ${device.verificationUri}`);
  console.log(`  Code : ${device.userCode}`);
  console.log(`  Poll : ${opts.poll ? "enabled" : "disabled; rerun with --poll after user approval"}`);
  console.log("");
}

async function logout(opts: SyncOptions): Promise<void> {
  const { tokenStore } = await prepareLocalSync(opts);
  await tokenStore.delete("github");
  const report = { provider: "github", loggedOut: true };
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("\n✓ GitHub token removed from TokenStore boundary.\n");
}

async function repoPlan(opts: SyncOptions): Promise<void> {
  if (!opts.dryRun) {
    throw new Error("sync repo currently requires --dry-run; remote writes are not enabled in this slice.");
  }
  const { tokenStore } = await prepareLocalSync(opts);
  const token = await tokenStore.get("github");
  const owner = opts.owner ?? process.env.GITHUB_USER ?? "unknown-owner";
  const plan = buildGitHubRegistryRepoPlan({
    owner,
    repo: opts.repo,
    exists: opts.exists,
  });
  const report = {
    loggedIn: !!token,
    plan,
  };
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("");
  console.log("▸ GitHub registry repo plan");
  console.log("  " + "-".repeat(72));
  console.log(`  Action : ${plan.action}`);
  console.log(`  Repo   : ${plan.owner}/${plan.repo}`);
  console.log(`  Private: ${plan.visibility === "private" ? "yes" : "no"}`);
  console.log(`  Writes : none (--dry-run)`);
  console.log("");
  console.log(plan.manifestPreview);
}

function printPlan(plan: SyncPlan): void {
  console.log("");
  console.log("▸ Sync dry-run plan");
  console.log("  " + "-".repeat(72));
  console.log(`  Direction   : ${plan.direction}`);
  console.log(`  Remote root : ${plan.remoteRoot}`);
  console.log(`  Manifest    : ${plan.scanner.manifestOk ? "ok" : "invalid"}`);
  console.log(`  Writes      : none (--dry-run)`);
  console.log(`  Operations  : ${plan.operations.length}`);
  for (const [status, count] of Object.entries(plan.counts)) {
    if (count > 0) console.log(`  ${status.padEnd(15)}: ${count}`);
  }
  if (plan.operations.length > 0) {
    console.log("");
    console.log("  Preview:");
    for (const operation of plan.operations.slice(0, 12)) {
      console.log(`  • ${operation.status} ${operation.layerId}/${operation.relativePath}`);
      console.log(`    ${operation.reason}`);
    }
  }
  if (plan.operations.length > 12) {
    console.log(`  ... ${plan.operations.length - 12} more operations`);
  }
  console.log("");
}

function printApplyReport(report: SyncApplyReport): void {
  console.log("");
  console.log("▸ Sync apply report");
  console.log("  " + "-".repeat(72));
  console.log(`  Direction : ${report.direction}`);
  console.log(`  Remote    : ${report.remoteRoot}`);
  console.log(`  Force     : ${report.force ? "yes" : "no"}`);
  console.log(`  Audit     : ${report.auditPath}`);
  console.log(`  Plan hash : ${report.planHash}`);
  for (const [status, count] of Object.entries(report.counts)) {
    if (count > 0) console.log(`  ${status.padEnd(8)}: ${count}`);
  }
  if (report.operations.length > 0) {
    console.log("");
    console.log("  Results:");
    for (const operation of report.operations.slice(0, 12)) {
      console.log(`  • ${operation.applyStatus} ${operation.plannedStatus} ${operation.layerId}/${operation.relativePath}`);
      console.log(`    ${operation.reason}`);
      if (operation.backupPath) console.log(`    backup: ${operation.backupPath}`);
    }
  }
  if (report.operations.length > 12) {
    console.log(`  ... ${report.operations.length - 12} more operations`);
  }
  console.log("");
}

function parseDirection(value: string | undefined): SyncDirection {
  const direction = value ?? "both";
  if (direction === "push" || direction === "pull" || direction === "both") {
    return direction;
  }
  throw new Error("sync plan --direction must be one of: push, pull, both");
}

async function prepareLocalSync(opts: SyncOptions): Promise<{
  manifest: Awaited<ReturnType<typeof ensureAppState>>;
  tokenStore: TokenStore;
}> {
  const manifest = await ensureAppState({ overrideDir: opts.appStateDir });
  const tokenStore = new DevelopmentFileTokenStore({
    appStateDir: opts.appStateDir,
    allowProduction: process.env.NODE_ENV !== "production",
  });
  return { manifest, tokenStore };
}

async function pollUntilToken(
  client: GitHubDeviceFlowClient,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
) {
  const deadline = Date.now() + expiresInSeconds * 1000;
  let interval = intervalSeconds;
  while (Date.now() < deadline) {
    await delay(interval * 1000);
    const result = await client.pollForToken(deviceCode);
    if ("pending" in result) {
      interval += result.intervalAdjustmentSeconds;
      continue;
    }
    return result;
  }
  throw new Error("GitHub device flow expired before authorization completed");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
