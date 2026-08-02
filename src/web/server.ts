// ============================================================================
// Web Board · Server
// ----------------------------------------------------------------------------
// Hono factory for the loopback Board API and bundled static frontend
// (dist/web/). The API exposes registry reads plus explicitly scoped local
// mutations such as connect, sync, authentication, and desktop updates.
//
// Endpoints:
//   GET  /api/health
//   GET  /api/layers
//   GET  /api/skills
//   GET  /api/skills/:id
//   GET  /api/rules
//   GET  /api/assets/scopes
//   GET  /api/project-identity
//   PUT  /api/assets/:assetType/:id/scope
//   POST /api/compile/preview
//   GET  /api/ide-health
//   POST /api/connect/plan
//   POST /api/connect/apply
//   POST /api/connect/rollback
//   GET  /api/runtime/status
//   POST /api/runtime/start
//   POST /api/runtime/stop
//   GET  /api/sync/status
//   POST /api/sync/plan
//   POST /api/sync/apply
//   GET  /api/sync/audits
//   GET  /api/sync/audit-file
//   GET  /api/sync/backup-file
// ============================================================================

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { load as parseYaml } from "js-yaml";

import { SkillEngine } from "../core/engine.js";
import { isCompileTarget } from "../adapters/registry.js";
import { compileIntentDryRun } from "../compiler/compiler.js";
import {
  applyConnectPlan,
  buildConnectPlan,
  rollbackConnectPlan,
  verifyConnectPlan,
} from "../connect/connect-plan.js";
import { checkIdeConnectionHealth } from "../health/ide-connection.js";
import { detectIdeRegistration } from "../ide-detection/detect.js";
import { isIdeTarget, listIdeDefinitions, SUPPORTED_IDES } from "../ide-detection/registry.js";
import { ensureAppState } from "../local-store/app-state.js";
import {
  GitHubDeviceFlowClient,
  tokenResponseToStoredToken,
  type GitHubDeviceCode,
  type GitHubDeviceFlowPending,
  type GitHubTokenResponse,
  type GitHubUser,
} from "../auth/github.js";
import {
  missingGitHubOAuthClientIdMessage,
  resolveGitHubOAuthClientId,
} from "../auth/github-config.js";
import {
  DevelopmentFileTokenStore,
  SecureTokenStoreError,
  type TokenStore,
} from "../auth/token-store.js";
import { LocalRuntimeManager } from "../runtime/manager.js";
import { loadConfig } from "../storage/config.js";
import { readAllLayers } from "../storage/reader.js";
import { validateSkill } from "../storage/parser.js";
import {
  DEFAULT_RULES_DIR,
  readAllRuleEntries,
  type LoadedRule,
} from "../storage/rule-reader.js";
import {
  readAssetScopeFile,
  updateAssetScopeFile,
} from "../storage/asset-scope-editor.js";
import { resolveProjectIdentity } from "../storage/project-identity.js";
import {
  buildSyncPlan,
  type SyncDirection,
  type SyncPlan,
  type SyncPlanOperation,
} from "../sync/sync-engine.js";
import {
  applySyncPlan,
  SyncApplyBlockedError,
  type SyncApplyReport,
} from "../sync/sync-apply.js";
import { backupBeforeWrite, listBackups, restoreBackup, sha256Of } from "./backup.js";
import type { SkillCentralConfig } from "../storage/config.js";
import type {
  LayerProvenance,
  SkillType,
  UniversalSkillSchemaVersion,
} from "../schema/universal-skill.js";
import type { McpServerConfig } from "../ide-detection/types.js";
import {
  assetAppliesTo,
  normaliseAssetScope,
  type AssetScope,
} from "../schema/asset-scope.js";
import type { RuleSeverity } from "../schema/rule.js";
import { VERSION } from "../version.js";
import type { RuntimeSnapshot } from "../runtime/manager.js";
import {
  UnsupportedUpdateController,
  type UpdateController,
} from "../update/types.js";

// ── Public types ───────────────────────────────────────────────────────────

export interface BoardDeps {
  config: SkillCentralConfig;
  engine: SkillEngine;
  /** Absolute path to the project root (for resolving layer file paths). */
  rootDir: string;
  /** Package version string returned by /api/health. */
  version: string;
  /** Local MCP process manager used by the desktop-console runtime controls. */
  runtime?: RuntimeController;
  tokenStore?: TokenStore;
  /** Receives redacted auth diagnostics; event values never contain credentials. */
  authLogger?: (event: BoardAuthLogEvent) => void;
  githubOAuthClientId?: string;
  githubClientFactory?: (clientId: string) => BoardGitHubClient;
  updater?: UpdateController;
  /** Desktop packages use their own executable as the MCP launcher. */
  mcpServerConfig?: McpServerConfig;
  /** Override the default .rules directory for embedded consumers and tests. */
  rulesDir?: string;
}

export interface BoardOptions {
  host?: string;
  port?: number;
  updater?: UpdateController;
  mcpServerConfig?: McpServerConfig;
  githubOAuthClientId?: string;
  tokenStore?: TokenStore;
  authLogger?: (event: BoardAuthLogEvent) => void;
}

export interface BoardServerHandle {
  host: string;
  port: number;
  server: ServerType;
}

export interface RuntimeController {
  getSnapshot(): RuntimeSnapshot;
  start(): RuntimeSnapshot;
  stop(): Promise<RuntimeSnapshot>;
}

export interface BoardGitHubClient {
  requestDeviceCode(): Promise<GitHubDeviceCode>;
  pollForToken(deviceCode: string): Promise<GitHubTokenResponse | GitHubDeviceFlowPending>;
  fetchUser(accessToken: string): Promise<GitHubUser>;
}

export interface BoardAuthLogEvent {
  operation: "status" | "device" | "poll" | "profile" | "logout";
  code: string;
}

const SYNC_APPLY_CONFIRMATION = "APPLY SYNC";

// ── Static asset resolution ────────────────────────────────────────────────

/**
 * Returns the directory containing the static frontend (index.html, app.js,
 * style.css). The first existing candidate wins.
 *
 * Why a fallback chain and not one canonical path:
 *   - `npm install` puts everything under `node_modules/@bobcgn/skill-central/`
 *     and the user can invoke the bin from any cwd, so cwd-relative lookup
 *     is unreliable.
 *   - `import.meta.url` is the one location guaranteed to point at *this*
 *     compiled module regardless of cwd. In production it lands inside
 *     `dist/web/` (same dir as the bundled assets). In tsx dev it lands
 *     inside `src/web/` and the assets live one step deeper at
 *     `src/web/static/`.
 *   - The cwd-relative candidates remain as a last-resort fallback for
 *     unusual layouts (e.g. someone copying `dist/web/` into a project).
 *
 * `SC_WEB_ROOT` env var always wins — useful for tests and custom deploys.
 */
export function resolveWebRoot(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates: Array<string | undefined> = [
    process.env.SC_WEB_ROOT,
    // Compiled: server.js sits next to index.html in dist/web/.
    here,
    // tsx dev: assets are at src/web/static/ (one step deeper than server.ts).
    path.join(here, "static"),
    // Cwd-relative fallbacks for non-standard invocations.
    path.join(process.cwd(), "dist", "web"),
    path.join(process.cwd(), "src", "web", "static"),
  ];

  for (const dir of candidates) {
    if (typeof dir === "string" && dir.length > 0 && existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return undefined;
}

// ── API helpers ────────────────────────────────────────────────────────────

interface SkillDto {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  schemaVersion: UniversalSkillSchemaVersion;
  sourceFormat: "legacy" | "universal";
  tags: string[];
  layer: string;
  priority: number;
  status: string;
  shadowedBy?: string;
  conflictWith?: string[];
  source: string;
  appliesTo: AssetScope;
  prompt?: string;
  /** Chinese variant of the prompt. Omitted when the skill has none. */
  prompt_zh?: string;
  inputSchema?: Record<string, unknown>;
  rawYaml?: string;
  sha256?: string;
}

interface RuleDto {
  id: string;
  name: string;
  description: string;
  body: string;
  tags: string[];
  severity: RuleSeverity;
  source: string;
  appliesTo: AssetScope;
  sha256: string;
  appliesHere: boolean;
}

interface ScopeAssetDto {
  assetType: "skill" | "rule";
  id: string;
  name: string;
  description: string;
  source: string;
  appliesTo: AssetScope;
  appliesHere: boolean;
  sha256: string;
  layer?: string;
  priority?: number;
  type?: SkillType;
  severity?: RuleSeverity;
  tags: string[];
}

interface LayerDto {
  name: string;
  path: string;
  priority: number;
  fileCount: number;
}

interface SkillResolutionDto {
  id: string;
  status: string;
  reason: string;
  candidates: SkillDto[];
}

type SyncConflictResolutionChoice = "use-local" | "use-remote" | "skip";

interface SyncConflictResolutionDto {
  layerId?: string;
  relativePath?: string;
  choice?: SyncConflictResolutionChoice;
  expectedLocalHash?: string;
  expectedRemoteHash?: string;
}

type SyncAuditOutcomeFilter = "all" | "blocked" | "applied" | "skipped";

interface SyncAuditFilters {
  outcome: SyncAuditOutcomeFilter;
  direction?: SyncDirection;
  layer?: string;
  since?: string;
  until?: string;
}

interface SyncAuditPage {
  items: SyncApplyReport[];
  nextCursor?: string;
}

type SyncPlanOperationWithDiff = SyncPlanOperation & {
  diffPreview?: string;
};

type SyncPlanWithDiff = Omit<SyncPlan, "operations"> & {
  operations: SyncPlanOperationWithDiff[];
};

/**
 * Build a SkillDto from the engine view.
 *
 * Phase 1B intent: the engine is now the source of truth for provenance and
 * resolution status. The board should not re-scan layers to infer a different
 * answer about which file is effective.
 */
async function buildSkillDto(
  resolvedSkill: {
    id: string;
    name: string;
    description: string;
    type: SkillType;
    schemaVersion: UniversalSkillSchemaVersion;
    sourceFormat: "legacy" | "universal";
    tags?: string[];
    priority: number;
    layer: LayerProvenance;
    status: string;
    shadowedBy?: LayerProvenance;
    conflictWith?: LayerProvenance[];
    prompt?: string;
    prompt_zh?: string;
    inputSchema?: Record<string, unknown>;
    appliesTo: AssetScope;
    source: string;
  },
  config: SkillCentralConfig,
  rootDir: string,
): Promise<SkillDto> {
  void config;
  const sourceLayer = resolvedSkill.layer.name;
  const sourcePath = path.resolve(rootDir, resolvedSkill.source);
  return {
    id: resolvedSkill.id,
    name: resolvedSkill.name,
    description: resolvedSkill.description,
    type: resolvedSkill.type,
    schemaVersion: resolvedSkill.schemaVersion,
    sourceFormat: resolvedSkill.sourceFormat,
    tags: resolvedSkill.tags ?? [],
    layer: sourceLayer,
    priority: resolvedSkill.priority,
    status: resolvedSkill.status,
    shadowedBy: resolvedSkill.shadowedBy?.name,
    conflictWith: resolvedSkill.conflictWith?.map((layer) => layer.name),
    source: sourcePath,
    appliesTo: resolvedSkill.appliesTo,
    prompt: resolvedSkill.prompt,
    prompt_zh: resolvedSkill.prompt_zh,
    inputSchema: resolvedSkill.inputSchema,
  };
}

async function buildRuleDto(
  entry: LoadedRule,
  rootDir: string,
  projectIds: string[],
): Promise<RuleDto> {
  const source = path.resolve(rootDir, entry.filePath);
  const raw = await readFile(source, "utf8");
  return {
    id: entry.rule.id,
    name: entry.rule.name,
    description: entry.rule.description,
    body: entry.rule.body,
    tags: entry.rule.tags ?? [],
    severity: entry.rule.severity,
    source,
    appliesTo: entry.rule.appliesTo,
    sha256: await sha256Of(raw),
    appliesHere: assetAppliesTo(entry.rule.appliesTo, { projectIds }),
  };
}

// ── Hono factory ───────────────────────────────────────────────────────────

/**
 * Create a Hono app exposing the read-only skill API. Pure factory — no
 * network listening happens here. The board command calls serve() on the
 * returned app.
 */
export function createBoardApp(deps: BoardDeps): Hono {
  const app = new Hono();
  const rulesDir = path.resolve(deps.rootDir, deps.rulesDir ?? DEFAULT_RULES_DIR);
  const runtime = deps.runtime ?? new LocalRuntimeManager();
  const updater = deps.updater ?? new UnsupportedUpdateController(
    deps.version,
    "Automatic updates are available in the packaged desktop app.",
  );
  let tokenStore = deps.tokenStore;
  // Device codes and OAuth clients stay server-side. The renderer receives an
  // opaque flow ID and user code, and never receives a device or access token.
  const pendingGitHubFlows = new Map<string, PendingGitHubFlow>();
  const getTokenStore = (): TokenStore => {
    tokenStore ??= new DevelopmentFileTokenStore({
      allowProduction: process.env.NODE_ENV !== "production",
    });
    return tokenStore;
  };
  const logAuthFailure = (operation: BoardAuthLogEvent["operation"], err: unknown): void => {
    // Do not forward Error objects: network libraries and OS credential stores
    // may include request bodies, paths, or native details in their messages.
    try {
      deps.authLogger?.({ operation, code: authErrorCode(operation, err) });
    } catch {
      // Authentication behavior must not depend on an optional diagnostic sink.
    }
  };
  const createGitHubClient = deps.githubClientFactory
    ?? ((clientId: string) => new GitHubDeviceFlowClient({ clientId, scope: "repo" }));
  // Resolve once at server creation. Request bodies cannot replace the
  // maintainer-controlled OAuth application identity.
  const githubOAuthClientId = resolveGitHubOAuthClientId({ override: deps.githubOAuthClientId });

  // ── /api/health ────────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({ ok: true, version: deps.version, skills: deps.engine.querySkills().skills.length }),
  );

  // ── Desktop updates ──────────────────────────────────────────────────
  app.get("/api/update/status", (c) => c.json(updater.getSnapshot()));
  app.post("/api/update/check", async (c) => {
    if (!isSameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.json({ error: "Cross-origin update request rejected." }, 403);
    }
    try {
      return c.json(await updater.check());
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 503);
    }
  });
  app.post("/api/update/install", async (c) => {
    if (!isSameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.json({ error: "Cross-origin update request rejected." }, 403);
    }
    try {
      return c.json(await updater.install());
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 503);
    }
  });

  // ── /api/ide-targets ────────────────────────────────────────────────
  app.get("/api/ide-targets", async (c) => {
    const targets = await Promise.all(listIdeDefinitions().map(async (definition) => {
      const registration = await detectIdeRegistration(definition.target);
      return {
        ...definition,
        configPath: registration.configPath,
        configExists: registration.configExists,
        registered: registration.registered,
        configReadable: registration.configReadable,
      };
    }));
    return c.json(targets);
  });

  // ── GitHub auth settings ─────────────────────────────────────────────
  app.get("/api/auth/github/status", async (c) => {
    try {
      const store = getTokenStore();
      const token = await store.get("github");
      return c.json({
        available: true,
        loggedIn: !!token,
        loginAvailable: !!githubOAuthClientId,
        configurationError: githubOAuthClientId ? undefined : missingGitHubOAuthClientIdMessage(),
        github: token ? {
          tokenType: token.tokenType,
          scope: token.scope,
          updatedAt: token.updatedAt,
        } : undefined,
        tokenStore: {
          kind: store.describe().kind,
          productionReady: store.describe().productionReady,
          warning: store.describe().warning,
        },
      });
    } catch (err) {
      logAuthFailure("status", err);
      return c.json({
        available: false,
        loggedIn: false,
        loginAvailable: false,
        error: authErrorMessage("status", err),
        code: authErrorCode("status", err),
      }, 503);
    }
  });

  app.post("/api/auth/github/device", async (c) => {
    if (!isSameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.json({ error: "Cross-origin GitHub login request rejected." }, 403);
    }
    if (!githubOAuthClientId) {
      return c.json({
        error: missingGitHubOAuthClientIdMessage(),
        code: "GITHUB_OAUTH_NOT_CONFIGURED",
      }, 503);
    }
    try {
      await getTokenStore().checkAvailability();
      const client = createGitHubClient(githubOAuthClientId);
      const device = await client.requestDeviceCode();
      const flowId = randomUUID();
      pendingGitHubFlows.set(flowId, {
        client,
        deviceCode: device.deviceCode,
        expiresAt: Date.now() + device.expiresIn * 1000,
        intervalSeconds: device.interval,
      });
      return c.json({
        flowId,
        userCode: device.userCode,
        verificationUri: device.verificationUri,
        expiresIn: device.expiresIn,
        interval: device.interval,
      });
    } catch (err) {
      logAuthFailure("device", err);
      return c.json({
        error: authErrorMessage("device", err),
        code: authErrorCode("device", err),
      }, err instanceof SecureTokenStoreError ? 503 : 502);
    }
  });

  app.post("/api/auth/github/poll", async (c) => {
    if (!isSameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.json({ error: "Cross-origin GitHub login request rejected." }, 403);
    }
    let body: { flowId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (!body.flowId) return c.json({ error: "flowId is required" }, 400);
    const flow = pendingGitHubFlows.get(body.flowId);
    if (!flow) return c.json({ error: "GitHub login flow not found or already completed" }, 404);
    if (Date.now() >= flow.expiresAt) {
      pendingGitHubFlows.delete(body.flowId);
      return c.json({ error: "GitHub login flow expired" }, 410);
    }
    try {
      const result = await flow.client.pollForToken(flow.deviceCode);
      if ("pending" in result) {
        flow.intervalSeconds += result.intervalAdjustmentSeconds;
        return c.json({ pending: true, retryAfter: flow.intervalSeconds });
      }
      await getTokenStore().set(tokenResponseToStoredToken(result));
      let user: GitHubUser | undefined;
      try {
        user = await flow.client.fetchUser(result.accessToken);
      } catch (err) {
        // Authentication succeeded even if the profile request is temporarily unavailable.
        logAuthFailure("profile", err);
      }
      pendingGitHubFlows.delete(body.flowId);
      return c.json({
        pending: false,
        loggedIn: true,
        user: user ? { id: user.id, login: user.login, name: user.name } : undefined,
      });
    } catch (err) {
      pendingGitHubFlows.delete(body.flowId);
      logAuthFailure("poll", err);
      return c.json({
        error: authErrorMessage("poll", err),
        code: authErrorCode("poll", err),
      }, err instanceof SecureTokenStoreError ? 503 : 502);
    }
  });

  app.post("/api/auth/github/logout", async (c) => {
    if (!isSameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.json({ error: "Cross-origin GitHub logout request rejected." }, 403);
    }
    try {
      await getTokenStore().delete("github");
      return c.json({ loggedIn: false });
    } catch (err) {
      logAuthFailure("logout", err);
      return c.json({
        error: authErrorMessage("logout", err),
        code: authErrorCode("logout", err),
      }, 503);
    }
  });

  // ── /api/layers ────────────────────────────────────────────────────────
  app.get("/api/layers", async (c) => {
    const layers: LayerDto[] = [];
    for (const layer of deps.config.layers) {
      let count = 0;
      try {
        const st = await stat(layer.path);
        if (st.isDirectory()) {
          const entries = await readAllLayers([layer]);
          count = entries.length;
        }
      } catch {
        // layer dir missing → 0 files
      }
      layers.push({
        name: layer.name,
        path: layer.path,
        priority: layer.priority,
        fileCount: count,
      });
    }
    return c.json(layers);
  });

  // ── /api/skills ────────────────────────────────────────────────────────
  app.get("/api/skills", async (c) => {
    const resolved = deps.engine.querySkills().skills;
    const dtos: SkillDto[] = [];
    for (const s of resolved) {
      dtos.push(await buildSkillDto(s, deps.config, deps.rootDir));
    }
    // Stable order: layer priority asc, then id asc.
    dtos.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    return c.json(dtos);
  });

  // ── /api/skills/:id ────────────────────────────────────────────────────
  app.get("/api/skills/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    // Attach raw YAML for the editor (read directly from disk).
    if (dto.source) {
      try {
        dto.rawYaml = await readFile(dto.source, "utf-8");
        dto.sha256 = await sha256Of(dto.rawYaml);
      } catch {
        // source disappeared — engine still resolves the in-memory copy
      }
    }
    return c.json(dto);
  });

  // ── Rules and shared asset scope ───────────────────────────────────────
  app.get("/api/project-identity", async (c) => {
    return c.json(await resolveProjectIdentity(deps.rootDir));
  });

  app.get("/api/rules", async (c) => {
    const identity = await resolveProjectIdentity(deps.rootDir);
    const entries = await readAllRuleEntries([rulesDir]);
    const dtos = await Promise.all(entries.map((entry) =>
      buildRuleDto(entry, deps.rootDir, identity.aliases)
    ));
    dtos.sort((a, b) => a.id.localeCompare(b.id) || a.source.localeCompare(b.source));
    return c.json(dtos);
  });

  app.get("/api/assets/scopes", async (c) => {
    const identity = await resolveProjectIdentity(deps.rootDir);
    const skillEntries = await readAllLayers(deps.config.layers);
    const ruleEntries = await readAllRuleEntries([rulesDir]);
    const skills = await Promise.all(skillEntries.map(async ({ schema, layer, filePath }) => {
      const source = path.resolve(deps.rootDir, filePath);
      const scopeFile = await readAssetScopeFile(source);
      return {
        assetType: "skill" as const,
        id: schema.id,
        name: schema.name,
        description: schema.description,
        source,
        appliesTo: schema.appliesTo,
        appliesHere: assetAppliesTo(schema.appliesTo, { projectIds: identity.aliases }),
        sha256: scopeFile.sha256,
        layer: layer.name,
        priority: layer.priority,
        type: schema.type,
        tags: schema.tags ?? [],
      } satisfies ScopeAssetDto;
    }));
    const rules = await Promise.all(ruleEntries.map(async (entry) => {
      const dto = await buildRuleDto(entry, deps.rootDir, identity.aliases);
      return {
        assetType: "rule" as const,
        id: dto.id,
        name: dto.name,
        description: dto.description,
        source: dto.source,
        appliesTo: dto.appliesTo,
        appliesHere: dto.appliesHere,
        sha256: dto.sha256,
        severity: dto.severity,
        tags: dto.tags,
      } satisfies ScopeAssetDto;
    }));
    const assets = [...skills, ...rules];
    assets.sort((a, b) =>
      a.assetType.localeCompare(b.assetType)
      || a.id.localeCompare(b.id)
      || a.source.localeCompare(b.source)
    );
    return c.json({ project: identity, assets });
  });

  app.put("/api/assets/:assetType/:id/scope", async (c) => {
    if (!isSameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.json({ error: "Cross-origin asset scope request rejected." }, 403);
    }
    const assetType = c.req.param("assetType");
    const id = c.req.param("id");
    if (assetType !== "skill" && assetType !== "rule") {
      return c.json({ error: "assetType must be skill or rule" }, 400);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }

    let body: { source?: string; appliesTo?: unknown; expectedSha256?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.source !== "string" || body.source.length === 0) {
      return c.json({ error: "source is required" }, 400);
    }
    if (body.expectedSha256 !== undefined && typeof body.expectedSha256 !== "string") {
      return c.json({ error: "expectedSha256 must be a string" }, 400);
    }
    if (!("appliesTo" in body)) {
      return c.json({ error: "appliesTo is required" }, 400);
    }

    let appliesTo: AssetScope;
    try {
      appliesTo = normaliseAssetScope(body.appliesTo);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }

    const requestedSource = path.resolve(body.source);
    const allowedSource = await resolveEditableAssetSource(
      assetType,
      id,
      requestedSource,
      deps,
      rulesDir,
    );
    if (!allowedSource) {
      return c.json({ error: "source is not a discovered asset matching this type and id" }, 404);
    }

    try {
      const updated = await updateAssetScopeFile(allowedSource, appliesTo, {
        expectedSha256: body.expectedSha256,
      });
      if (assetType === "skill") {
        await deps.engine.reload(deps.config.layers, { projectRoot: deps.rootDir });
      }
      const identity = await resolveProjectIdentity(deps.rootDir);
      return c.json({
        ...updated,
        appliesHere: assetAppliesTo(updated.appliesTo, { projectIds: identity.aliases }),
      });
    } catch (err) {
      const message = errorMessage(err);
      if (message.startsWith("sha256 conflict")) {
        let current: Awaited<ReturnType<typeof readAssetScopeFile>> | undefined;
        try {
          current = await readAssetScopeFile(allowedSource);
        } catch {
          // The source may have disappeared after discovery; the conflict still
          // remains actionable without returning arbitrary file content.
        }
        return c.json({ error: message, current }, 409);
      }
      return c.json({ error: message }, 400);
    }
  });

  // ── GET /api/skills/:id/resolution ────────────────────────────────────
  // Phase 3 closeout: the desktop console needs the full candidate chain, not
  // just the effective DTO, so users can inspect why a skill is shadowed or
  // conflicted before syncing or exporting it.
  app.get("/api/skills/:id/resolution", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    const record = deps.engine.listResolutionRecords().find((entry) => entry.id === id);
    if (!record) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const candidates: SkillDto[] = [];
    for (const candidate of record.candidates) {
      candidates.push(await buildSkillDto(candidate, deps.config, deps.rootDir));
    }
    return c.json({
      id: record.id,
      status: record.status,
      reason: record.reason,
      candidates,
    } satisfies SkillResolutionDto);
  });

  // ── POST /api/compile/preview ─────────────────────────────────────────
  // The local console uses the same compiler bundle as CLI `compile --json`.
  // That shared path is what keeps UI preview hashes aligned with export.
  app.post("/api/compile/preview", async (c) => {
    let body: { target?: string; intent?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.target !== "string" || !isCompileTarget(body.target)) {
      return c.json({ error: "target must be generic-mcp, cursor, or windsurf" }, 400);
    }
    if (typeof body.intent !== "string" || body.intent.length === 0) {
      return c.json({ error: "intent required" }, 400);
    }
    return c.json(compileIntentDryRun(deps.engine.listResolutionRecords(), {
      target: body.target,
      intent: body.intent,
    }));
  });

  // ── GET /api/ide-health ───────────────────────────────────────────────
  app.get("/api/ide-health", async (c) => {
    const target = c.req.query("target") ?? "cursor";
    const configPath = c.req.query("configPath");
    const verify = c.req.query("verify") === "true";
    if (!isIdeTarget(target)) {
      return c.json({ error: ideTargetError() }, 400);
    }
    return c.json(await checkIdeConnectionHealth(target, deps.engine, {
      configPath,
      verify,
    }));
  });

  // ── POST /api/connect/plan ────────────────────────────────────────────
  app.post("/api/connect/plan", async (c) => {
    let body: { target?: string; configPath?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.target !== "string" || !isIdeTarget(body.target)) {
      return c.json({ error: ideTargetError() }, 400);
    }
    return c.json(await buildConnectPlan(body.target, {
      configPath: body.configPath,
      dryRun: true,
      desiredServer: deps.mcpServerConfig,
    }));
  });

  // ── POST /api/connect/apply ───────────────────────────────────────────
  // This is the write side of the same transaction used by CLI connect. The
  // UI sends the explicit target/configPath from a prior preview so writes stay
  // auditable and do not depend on hidden browser state.
  app.post("/api/connect/apply", async (c) => {
    let body: { target?: string; configPath?: string; verify?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.target !== "string" || !isIdeTarget(body.target)) {
      return c.json({ error: ideTargetError() }, 400);
    }
    let plan = await buildConnectPlan(body.target, {
      configPath: body.configPath,
      desiredServer: deps.mcpServerConfig,
    });
    plan = await applyConnectPlan(plan);
    if (body.verify) {
      plan = await verifyConnectPlan(plan, deps.engine);
    }
    return c.json(plan);
  });

  // ── POST /api/connect/rollback ────────────────────────────────────────
  app.post("/api/connect/rollback", async (c) => {
    let body: { target?: string; configPath?: string; backupPath?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.target !== "string" || !isIdeTarget(body.target)) {
      return c.json({ error: ideTargetError() }, 400);
    }
    const plan = await buildConnectPlan(body.target, {
      configPath: body.configPath,
      desiredServer: deps.mcpServerConfig,
    });
    return c.json(await rollbackConnectPlan({
      ...plan,
      backupPath: body.backupPath,
    }));
  });

  // ── Runtime controls ──────────────────────────────────────────────────
  app.get("/api/runtime/status", (c) => c.json(runtime.getSnapshot()));
  app.post("/api/runtime/start", (c) => c.json(runtime.start()));
  app.post("/api/runtime/stop", async (c) => c.json(await runtime.stop()));

  // ── Sync controls ─────────────────────────────────────────────────────
  // The Web Board reuses Phase 4's plan/apply transaction instead of carrying
  // a browser-specific sync writer. That keeps preflight, backups, and audit
  // reports identical across CLI and desktop packaging.
  app.get("/api/sync/status", async (c) => {
    const appState = await ensureAppState({ overrideDir: c.req.query("appStateDir") });
    return c.json({
      localFirst: true,
      appState,
      layers: deps.config.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        path: layer.path,
        syncEnabled: layer.sync.enabled,
        visibility: layer.visibility,
      })),
    });
  });

  app.post("/api/sync/plan", async (c) => {
    let body: { registryDir?: string; direction?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.registryDir !== "string" || body.registryDir.length === 0) {
      return c.json({ error: "registryDir required" }, 400);
    }
    const direction = parseSyncDirection(body.direction);
    if (!direction) {
      return c.json({ error: "direction must be push, pull, or both" }, 400);
    }
    const plan = await buildSyncPlan({
      direction,
      registryDir: body.registryDir,
      layers: deps.config.layers,
    });
    return c.json(await attachSyncConflictDiffPreviews(plan));
  });

  app.post("/api/sync/apply", async (c) => {
    let body: {
      registryDir?: string;
      direction?: string;
      force?: boolean;
      confirm?: string;
      appStateDir?: string;
      resolutions?: SyncConflictResolutionDto[];
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.registryDir !== "string" || body.registryDir.length === 0) {
      return c.json({ error: "registryDir required" }, 400);
    }
    // This endpoint can write files, so require a typed confirmation before
    // any plan is applied. It prevents accidental clicks while still keeping
    // local desktop use lightweight.
    if (body.confirm !== SYNC_APPLY_CONFIRMATION) {
      return c.json({ error: `confirm must equal ${SYNC_APPLY_CONFIRMATION}` }, 400);
    }
    const direction = parseSyncDirection(body.direction);
    if (!direction) {
      return c.json({ error: "direction must be push, pull, or both" }, 400);
    }
    const appState = await ensureAppState({ overrideDir: body.appStateDir });
    let plan = await buildSyncPlan({
      direction,
      registryDir: body.registryDir,
      layers: deps.config.layers,
    });
    const resolutionResult = applySyncConflictResolutions(plan, body.resolutions ?? []);
    if ("error" in resolutionResult) {
      return c.json({ error: resolutionResult.error }, 400);
    }
    plan = resolutionResult.plan;
    try {
      return c.json(await applySyncPlan(plan, {
        appState,
        force: !!body.force,
      }));
    } catch (err) {
      if (err instanceof SyncApplyBlockedError) {
        // A blocked preflight is expected sync evidence, not a server crash.
        // Return the report so the UI can show the same audit-grade details
        // written to app state.
        return c.json({ error: err.message, report: err.report }, 409);
      }
      throw err;
    }
  });

  app.get("/api/sync/audits", async (c) => {
    const limit = parsePositiveInt(c.req.query("limit"), 10);
    const cursor = c.req.query("cursor");
    const paged = c.req.query("page") === "true";
    const appState = await ensureAppState({ overrideDir: c.req.query("appStateDir") });
    const filters = parseSyncAuditFilters({
      outcome: c.req.query("outcome"),
      direction: c.req.query("direction"),
      layer: c.req.query("layer"),
      since: c.req.query("since"),
      until: c.req.query("until"),
    });
    if ("error" in filters) {
      return c.json({ error: filters.error }, 400);
    }
    const page = await listSyncApplyAuditPage(appState.paths.audit, {
      limit,
      cursor,
      filters: filters.filters,
    });
    const items = filterSyncApplyAudits(page.items, filters.filters);
    if (paged) {
      return c.json({ items, nextCursor: page.nextCursor });
    }
    return c.json(items);
  });

  app.get("/api/sync/audit-file", async (c) => {
    const appState = await ensureAppState({ overrideDir: c.req.query("appStateDir") });
    const file = c.req.query("path");
    if (typeof file !== "string" || file.length === 0) {
      return c.json({ error: "path required" }, 400);
    }
    const resolved = path.resolve(file);
    const auditRoot = path.resolve(appState.paths.audit);
    if (!resolved.startsWith(`${auditRoot}${path.sep}`) || !/^sync-apply\..+\.json$/.test(path.basename(resolved))) {
      return c.json({ error: "audit path is outside app state audit directory" }, 400);
    }
    return c.json({
      path: resolved,
      content: await readFile(resolved, "utf-8"),
    });
  });

  app.get("/api/sync/backup-file", async (c) => {
    const limit = parsePositiveInt(c.req.query("limit"), 20);
    const appState = await ensureAppState({ overrideDir: c.req.query("appStateDir") });
    const file = c.req.query("path");
    if (typeof file !== "string" || file.length === 0) {
      return c.json({ error: "path required" }, 400);
    }
    const allowed = await listSyncBackupPaths(appState.paths.audit, limit);
    const resolved = path.resolve(file);
    if (!allowed.has(resolved)) {
      return c.json({ error: "backup path is not referenced by recent sync audit reports" }, 400);
    }
    return c.json({
      path: resolved,
      content: await readFile(resolved, "utf-8"),
    });
  });

  // ── PUT /api/skills/:id — edit + save ─────────────────────────────────
  app.put("/api/skills/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    let body: { rawYaml?: string; expectedSha256?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.rawYaml !== "string") {
      return c.json({ error: "rawYaml must be a string" }, 400);
    }

    // Resolve the source file path (same logic as GET).
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    if (!dto.source) {
      return c.json({ error: "source path not resolved" }, 500);
    }

    // 1. Optimistic-concurrency check.
    let currentRaw = "";
    let currentSha = "";
    try {
      currentRaw = await readFile(dto.source, "utf-8");
      currentSha = await sha256Of(currentRaw);
    } catch {
      return c.json({ error: "source file disappeared" }, 410);
    }
    if (body.expectedSha256 && body.expectedSha256 !== currentSha) {
      return c.json(
        {
          error: "sha256 conflict — file changed since you loaded it",
          currentSha256: currentSha,
          currentRawYaml: currentRaw,
        },
        409,
      );
    }

    // 2. Parse + validate.
    let parsed: unknown;
    try {
      parsed = parseYaml(body.rawYaml);
    } catch (err) {
      return c.json(
        { error: `YAML parse error: ${(err as Error).message}` },
        400,
      );
    }
    if (typeof parsed !== "object" || parsed === null) {
      return c.json({ error: "YAML did not parse to an object" }, 400);
    }
    const schemaObj = parsed as Record<string, unknown>;
    const validated = validateSkill(schemaObj, dto.source);
    if (!validated) {
      return c.json({ error: "schema validation failed" }, 400);
    }

    // 3. Reject id change (would orphan the original file).
    if (validated.id !== id) {
      return c.json(
        {
          error: `id change not allowed: original="${id}", new="${validated.id}". Use remove + add to move skills across layers.`,
        },
        400,
      );
    }

    // 4. Backup existing file (if any) before write.
    await backupBeforeWrite(dto.source);

    // 5. Write.
    await writeFile(dto.source, body.rawYaml, "utf-8");

    // 6. Reload the engine so the in-memory view reflects the new file.
    // Without this, /api/skills continues to serve the pre-edit copy and
    // the board UI looks stale immediately after Save (issue #2 — board
    // not syncing after edit). For ~16 skills × 4 layers the cost is
    // negligible; no need to surgically re-read just one file.
    try {
      await deps.engine.reload(deps.config.layers, { projectRoot: deps.rootDir });
    } catch (err) {
      // A reload failure shouldn't fail the save — the file is on disk.
      // Log it server-side; the UI will see the stale data until the
      // user refreshes or another edit triggers another reload.
      console.error("[skill-central] post-write reload failed:", err);
    }

    // 7. New sha256.
    const newSha = await sha256Of(body.rawYaml);

    return c.json({ ok: true, sha256: newSha });
  });

  // ── GET /api/skills/:id/backups ────────────────────────────────────────
  app.get("/api/skills/:id/backups", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    if (!dto.source) return c.json([]);
    const backups = await listBackups(dto.source);
    return c.json(backups);
  });

  // ── POST /api/skills/:id/restore ──────────────────────────────────────
  app.post("/api/skills/:id/restore", async (c) => {
    const id = c.req.param("id");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      return c.json({ error: "invalid id format" }, 400);
    }
    let body: { backupFile?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    if (typeof body.backupFile !== "string") {
      return c.json({ error: "backupFile required" }, 400);
    }
    const resolved = deps.engine.getSkill(id);
    if (!resolved) {
      return c.json({ error: `skill not found: ${id}` }, 404);
    }
    const dto = await buildSkillDto(resolved, deps.config, deps.rootDir);
    if (!dto.source) {
      return c.json({ error: "source path not resolved" }, 500);
    }
    try {
      await restoreBackup(dto.source, body.backupFile);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
    return c.json({ ok: true });
  });

  // ── POST /api/reload — re-read all layers from disk ──────────────────
  // Without this endpoint, edits made to .yaml files outside the board
  // (e.g. in vim) don't surface until the server restarts. The board UI's
  // "↻ Refresh" button POSTs here before re-fetching the list.
  app.post("/api/reload", async (c) => {
    try {
      await deps.engine.reload(deps.config.layers, { projectRoot: deps.rootDir });
      return c.json({ ok: true, skills: deps.engine.listSkills().length });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // ── Static assets ─────────────────────────────────────────────────────
  // Hand-rolled minimal static middleware. We deliberately do not depend on
  // hono/serve-static because its Node adapter in this Hono version requires
  // a custom getContent() callback, which is more code than this version.
  const webRoot = resolveWebRoot();
  if (webRoot) {
    app.get("*", async (c) => {
      const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
      // Path-traversal defence: resolve and ensure inside webRoot.
      const filePath = path.resolve(webRoot, "." + reqPath);
      if (!filePath.startsWith(path.resolve(webRoot))) {
        return c.text("forbidden", 403);
      }
      try {
        const st = await stat(filePath);
        if (!st.isFile()) return c.notFound();
        const content = await readFile(filePath);
        return new Response(content, {
          status: 200,
          headers: {
            "content-type": mimeFor(reqPath),
            "cache-control": "no-cache",
          },
        });
      } catch {
        return c.notFound();
      }
    });
  } else {
    app.get("/", (c) =>
      c.text(
        "skill-central web assets not found. Run `npm run build:web` first.\n",
        500,
      ),
    );
  }

  return app;
}

// ── Tiny mime map ──────────────────────────────────────────────────────────

function mimeFor(p: string): string {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function listSyncApplyAudits(
  auditDir: string,
  limit: number,
  filters: Pick<SyncAuditFilters, "since" | "until"> = {},
): Promise<SyncApplyReport[]> {
  return (await listSyncApplyAuditPage(auditDir, { limit, filters })).items;
}

async function listSyncApplyAuditPage(
  auditDir: string,
  options: {
    limit: number;
    cursor?: string;
    filters: Pick<SyncAuditFilters, "since" | "until">;
  },
): Promise<SyncAuditPage> {
  let entries;
  try {
    entries = await readdir(auditDir, { withFileTypes: true });
  } catch {
    return { items: [] };
  }
  const sortedFiles = entries
    .filter((entry) => entry.isFile() && /^sync-apply\..+\.json$/.test(entry.name))
    // Large audit directories should avoid opening JSON files that the time
    // window can reject by filename alone. The JSON `appliedAt` check still
    // runs later as the source-of-truth validation.
    .filter((entry) => auditFilenameWithinTimeWindow(entry.name, options.filters))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  // Cursor is the last file name returned by the previous page. It keeps the
  // contract stable across local paths while preserving newest-first ordering.
  const cursorIndex = options.cursor
    ? sortedFiles.findIndex((fileName) => fileName === options.cursor)
    : -1;
  if (options.cursor && cursorIndex < 0) return { items: [] };
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const pageFiles = sortedFiles.slice(start, start + options.limit);
  const nextCursor = start + options.limit < sortedFiles.length ? pageFiles.at(-1) : undefined;
  const reports: SyncApplyReport[] = [];
  for (const fileName of pageFiles) {
    const file = path.join(auditDir, fileName);
    try {
      const parsed = JSON.parse(await readFile(file, "utf-8")) as SyncApplyReport;
      if (parsed.schemaVersion === "skillcentral.dev/sync-apply/v1") {
        reports.push({ ...parsed, auditPath: parsed.auditPath || file });
      }
    } catch {
      // Ignore malformed audit artifacts; the console should remain usable and
      // the bad file can still be inspected directly from the audit directory.
    }
  }
  return { items: reports, nextCursor };
}

async function listSyncBackupPaths(auditDir: string, limit: number): Promise<Set<string>> {
  const reports = await listSyncApplyAudits(auditDir, limit);
  const paths = new Set<string>();
  for (const report of reports) {
    for (const operation of report.operations) {
      if (operation.backupPath) {
        paths.add(path.resolve(operation.backupPath));
      }
    }
  }
  return paths;
}

function auditFilenameWithinTimeWindow(
  fileName: string,
  filters: Pick<SyncAuditFilters, "since" | "until">,
): boolean {
  const timestampMs = auditTimestampFromFileName(fileName);
  // Older/manual files with non-standard names remain readable; they just
  // cannot benefit from filename prefiltering and will be checked by JSON.
  if (timestampMs === undefined) return true;
  if (filters.since && timestampMs < Date.parse(filters.since)) return false;
  if (filters.until && timestampMs > Date.parse(filters.until)) return false;
  return true;
}

function auditTimestampFromFileName(fileName: string): number | undefined {
  const match = /^sync-apply\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/.exec(fileName);
  if (!match) return undefined;
  const [, date, hour, minute, second, ms] = match;
  const timestamp = Date.parse(`${date}T${hour}:${minute}:${second}.${ms}Z`);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function parseSyncAuditFilters(input: {
  outcome?: string;
  direction?: string;
  layer?: string;
  since?: string;
  until?: string;
}): { filters: SyncAuditFilters } | { error: string } {
  const outcome = input.outcome ?? "all";
  if (!isSyncAuditOutcomeFilter(outcome)) {
    return { error: "outcome must be all, blocked, applied, or skipped" };
  }
  const direction = input.direction && input.direction !== "all"
    ? parseSyncDirection(input.direction)
    : undefined;
  if (input.direction && input.direction !== "all" && !direction) {
    return { error: "direction must be all, push, pull, or both" };
  }
  for (const [key, value] of [["since", input.since], ["until", input.until]] as const) {
    if (value && Number.isNaN(Date.parse(value))) {
      return { error: `${key} must be an ISO timestamp` };
    }
  }
  if (input.since && input.until && Date.parse(input.since) > Date.parse(input.until)) {
    return { error: "since must be earlier than until" };
  }
  return {
    filters: {
      outcome,
      direction,
      layer: input.layer && input.layer !== "all" ? input.layer : undefined,
      since: input.since,
      until: input.until,
    },
  };
}

function filterSyncApplyAudits(
  audits: SyncApplyReport[],
  filters: SyncAuditFilters,
): SyncApplyReport[] {
  // Filtering is a view concern: it never rewrites the audit reports. The full
  // report remains available through audit-file when users need raw evidence.
  return audits.filter((audit) => {
    if (filters.direction && audit.direction !== filters.direction) return false;
    if (filters.since && Date.parse(audit.appliedAt) < Date.parse(filters.since)) return false;
    if (filters.until && Date.parse(audit.appliedAt) > Date.parse(filters.until)) return false;
    if (filters.layer && !audit.operations.some((operation) => operation.layerId === filters.layer)) return false;
    if (filters.outcome === "blocked") return audit.preflightBlocked || (audit.counts.blocked || 0) > 0;
    if (filters.outcome === "applied") return (audit.counts.applied || 0) > 0;
    if (filters.outcome === "skipped") return (audit.counts.skipped || 0) > 0;
    return true;
  });
}

function isSyncAuditOutcomeFilter(value: string): value is SyncAuditOutcomeFilter {
  return value === "all" || value === "blocked" || value === "applied" || value === "skipped";
}

function parseSyncDirection(value: string | undefined): SyncDirection | undefined {
  const direction = value ?? "both";
  return direction === "push" || direction === "pull" || direction === "both" ? direction : undefined;
}

async function attachSyncConflictDiffPreviews(plan: SyncPlan): Promise<SyncPlanWithDiff> {
  const operations: SyncPlanOperationWithDiff[] = [];
  for (const operation of plan.operations) {
    if (operation.status !== "conflict") {
      operations.push(operation);
      continue;
    }
    operations.push({
      ...operation,
      // The preview is advisory UI evidence. It is intentionally kept out of
      // sync-engine/apply so the audited plan and plan hash remain based on
      // file identities and hashes, not on a truncated display string.
      diffPreview: await buildSyncConflictDiffPreview(operation),
    });
  }
  return { ...plan, operations };
}

async function buildSyncConflictDiffPreview(operation: SyncPlanOperation): Promise<string> {
  if (!operation.localPath || !operation.remotePath) return "(missing local or remote path)";
  try {
    const [localRaw, remoteRaw] = await Promise.all([
      readFile(operation.localPath, "utf-8"),
      readFile(operation.remotePath, "utf-8"),
    ]);
    return unifiedLineDiff(localRaw, remoteRaw, {
      fromLabel: "local",
      toLabel: "remote",
      contextLines: 2,
      maxLines: 80,
    });
  } catch (err) {
    return `diff unavailable: ${(err as Error).message}`;
  }
}

function unifiedLineDiff(
  fromRaw: string,
  toRaw: string,
  options: {
    fromLabel: string;
    toLabel: string;
    contextLines: number;
    maxLines: number;
  },
): string {
  const fromLines = fromRaw.split(/\r?\n/);
  const toLines = toRaw.split(/\r?\n/);
  const maxLength = Math.max(fromLines.length, toLines.length);
  const changed = new Set<number>();
  for (let index = 0; index < maxLength; index += 1) {
    if ((fromLines[index] ?? "") !== (toLines[index] ?? "")) {
      changed.add(index);
    }
  }
  if (changed.size === 0) return "(hash differs, text preview is identical)";

  const included = new Set<number>();
  for (const index of changed) {
    for (
      let cursor = Math.max(0, index - options.contextLines);
      cursor <= Math.min(maxLength - 1, index + options.contextLines);
      cursor += 1
    ) {
      included.add(cursor);
    }
  }

  const out = [`--- ${options.fromLabel}`, `+++ ${options.toLabel}`];
  let previous = -2;
  for (const index of Array.from(included).sort((a, b) => a - b)) {
    if (out.length >= options.maxLines) {
      out.push("... diff truncated ...");
      break;
    }
    if (index > previous + 1) out.push("@@");
    const fromLine = fromLines[index];
    const toLine = toLines[index];
    if ((fromLine ?? "") === (toLine ?? "")) {
      out.push(` ${fromLine ?? ""}`);
    } else {
      if (fromLine !== undefined) out.push(`-${fromLine}`);
      if (toLine !== undefined) out.push(`+${toLine}`);
    }
    previous = index;
  }
  return out.join("\n");
}

function applySyncConflictResolutions(
  plan: SyncPlan,
  resolutions: SyncConflictResolutionDto[],
): { plan: SyncPlan } | { error: string } {
  if (resolutions.length === 0) return { plan };
  const byKey = new Map<string, SyncConflictResolutionDto>();
  for (const resolution of resolutions) {
    if (typeof resolution.layerId !== "string" || resolution.layerId.length === 0) {
      return { error: "resolution.layerId required" };
    }
    if (typeof resolution.relativePath !== "string" || resolution.relativePath.length === 0) {
      return { error: "resolution.relativePath required" };
    }
    if (!isSyncConflictResolutionChoice(resolution.choice)) {
      return { error: "resolution.choice must be use-local, use-remote, or skip" };
    }
    const key = syncOperationKey(resolution.layerId, resolution.relativePath);
    if (byKey.has(key)) {
      return { error: `duplicate resolution for ${key}` };
    }
    byKey.set(key, resolution);
  }

  const operations: SyncPlanOperation[] = [];
  for (const operation of plan.operations) {
    const key = syncOperationKey(operation.layerId, operation.relativePath);
    const resolution = byKey.get(key);
    if (!resolution) {
      operations.push(operation);
      continue;
    }
    if (operation.status !== "conflict") {
      return { error: `resolution target is not a conflict: ${key}` };
    }
    const converted = resolveSyncConflict(operation, resolution);
    if ("error" in converted) return converted;
    operations.push(converted.operation);
    byKey.delete(key);
  }

  const unresolved = Array.from(byKey.keys());
  if (unresolved.length > 0) {
    return { error: `resolution target not found in plan: ${unresolved[0]}` };
  }

  return {
    plan: {
      ...plan,
      operations,
      counts: countSyncPlanOperations(operations),
    },
  };
}

function resolveSyncConflict(
  operation: SyncPlanOperation,
  resolution: SyncConflictResolutionDto,
): { operation: SyncPlanOperation } | { error: string } {
  const key = syncOperationKey(operation.layerId, operation.relativePath);
  // Hash checks make the resolution an approval of the just-reviewed plan, not
  // a stale browser decision that can silently apply after files changed.
  if (resolution.expectedLocalHash && resolution.expectedLocalHash !== operation.localHash) {
    return { error: `local hash changed for ${key}; rebuild the sync plan before apply` };
  }
  if (resolution.expectedRemoteHash && resolution.expectedRemoteHash !== operation.remoteHash) {
    return { error: `remote hash changed for ${key}; rebuild the sync plan before apply` };
  }
  if (resolution.choice === "use-remote") {
    return {
      operation: {
        ...operation,
        status: "update-local",
        reason: "conflict resolved explicitly: use remote version",
      },
    };
  }
  if (resolution.choice === "use-local") {
    return {
      operation: {
        ...operation,
        status: "update-remote",
        reason: "conflict resolved explicitly: use local version",
      },
    };
  }
  return {
    operation: {
      ...operation,
      status: "noop",
      reason: "conflict resolved explicitly: skip this file",
    },
  };
}

function isSyncConflictResolutionChoice(value: unknown): value is SyncConflictResolutionChoice {
  return value === "use-local" || value === "use-remote" || value === "skip";
}

function countSyncPlanOperations(operations: SyncPlanOperation[]): SyncPlan["counts"] {
  const statuses: SyncPlanOperation["status"][] = [
    "create-local",
    "create-remote",
    "update-local",
    "update-remote",
    "delete-local",
    "delete-remote",
    "conflict",
    "noop",
    "excluded-policy",
  ];
  return Object.fromEntries(statuses.map((status) => [
    status,
    operations.filter((operation) => operation.status === status).length,
  ])) as SyncPlan["counts"];
}

function syncOperationKey(layerId: string, relativePath: string): string {
  return `${layerId}/${relativePath}`;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : fallback;
}

interface PendingGitHubFlow {
  client: BoardGitHubClient;
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
}

function ideTargetError(): string {
  return `target must be one of: ${SUPPORTED_IDES.join(", ")}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function authErrorCode(operation: BoardAuthLogEvent["operation"], err: unknown): string {
  if (err instanceof SecureTokenStoreError) return err.code;
  const codes: Record<BoardAuthLogEvent["operation"], string> = {
    status: "GITHUB_AUTH_STATUS_FAILED",
    device: "GITHUB_DEVICE_REQUEST_FAILED",
    poll: "GITHUB_LOGIN_FAILED",
    profile: "GITHUB_PROFILE_REQUEST_FAILED",
    logout: "GITHUB_LOGOUT_FAILED",
  };
  return codes[operation];
}

function authErrorMessage(operation: BoardAuthLogEvent["operation"], err: unknown): string {
  if (err instanceof SecureTokenStoreError) return err.message;
  const messages: Record<BoardAuthLogEvent["operation"], string> = {
    status: "GitHub authentication status is temporarily unavailable.",
    device: "Unable to start GitHub authentication. Check the connection and try again.",
    poll: "GitHub authentication could not be completed. Start a new login attempt.",
    profile: "GitHub profile information is temporarily unavailable.",
    logout: "The stored GitHub credential could not be removed.",
  };
  return messages[operation];
}

function isSameOriginRequest(requestUrl: string, origin: string | undefined): boolean {
  // Browser mutation requests must originate from this loopback Board. Calls
  // without Origin remain available to local non-browser clients such as CLI
  // diagnostics and tests.
  if (origin === undefined) return true;
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

async function resolveEditableAssetSource(
  assetType: "skill" | "rule",
  id: string,
  requestedSource: string,
  deps: BoardDeps,
  rulesDir: string,
): Promise<string | undefined> {
  if (assetType === "skill") {
    // Scan configured source layers rather than only the effective Engine view.
    // An out-of-scope or shadowed Skill must remain editable so users can bring
    // it back into the current project without dropping to the CLI.
    const entries = await readAllLayers(deps.config.layers);
    const sources = entries
      .filter((entry) => entry.schema.id === id)
      .map((entry) => path.resolve(deps.rootDir, entry.filePath));
    return sources.find((source) => source === requestedSource);
  }

  const entries = await readAllRuleEntries([rulesDir]);
  return entries
    .filter((entry) => entry.rule.id === id)
    .map((entry) => path.resolve(deps.rootDir, entry.filePath))
    .find((source) => source === requestedSource);
}

// ── Server bootstrap ───────────────────────────────────────────────────────

/**
 * Start the Hono server. The caller owns the returned server handle and may
 * close it during application shutdown.
 */
export function startBoardServer(opts: BoardOptions = {}): BoardServerHandle {
  const config = loadConfig();
  const engine = new SkillEngine();
  const version = VERSION;
  const rootDir = process.cwd();

  // Block on initial load so /api/skills returns immediately.
  // (engine.reload is sync-ish at startup; Hono handlers are async so it's fine.)
  void engine.reload(config.layers, { projectRoot: rootDir });

  const app = createBoardApp({
    config,
    engine,
    rootDir,
    version,
    runtime: new LocalRuntimeManager(),
    updater: opts.updater,
    mcpServerConfig: opts.mcpServerConfig,
    githubOAuthClientId: opts.githubOAuthClientId,
    tokenStore: opts.tokenStore,
    authLogger: opts.authLogger,
  });

  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 5417;

  const server = serve({ fetch: app.fetch, port, hostname: host });

  return { port, host, server };
}
