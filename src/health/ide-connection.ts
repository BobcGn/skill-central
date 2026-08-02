// ============================================================================
// Health / IDE Connection
// ----------------------------------------------------------------------------
// Reusable IDE connection health check for CLI and future desktop UI.
//
// Design intent:
// - Health must prove the full path: registered config, executable MCP command,
//   initialize handshake, prompts/list, tools/list, and registry count parity.
// - Failure results are structured with next actions so UI can guide repair
//   instead of rendering a dead-end "failed" label.
// - The stdio probe is bounded by a timeout to avoid hanging doctor/desktop
//   refresh loops when a command blocks or a sandbox denies execution.
// ============================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { detectIdeRegistration } from "../ide-detection/detect.js";
import type { IdeDetectionOptions, IdeTarget, McpServerConfig } from "../ide-detection/types.js";
import type { SkillEngine } from "../core/engine.js";
import { BUILTIN_CONTROL_TOOL_NAMES } from "../protocol/tools.js";
import { VERSION } from "../version.js";

export type IdeConnectionStatus =
  | "connected"
  | "connected-with-drift"
  | "registered"
  | "not-registered"
  | "server-stopped"
  | "handshake-failed"
  | "permission-blocked"
  | "unknown-error";

export interface IdeConnectionHealth {
  target: IdeTarget;
  status: IdeConnectionStatus;
  registered: boolean;
  configPath: string;
  serverCommand?: string;
  serverArgs?: string[];
  serverVersion?: string;
  promptCount: number;
  toolCount: number;
  loadedSkillCount: number;
  registryPromptCount: number;
  registryToolCount: number;
  registryLoadedSkillCount: number;
  missingSkillIds: string[];
  extraSkillIds: string[];
  lastCheckedAt: string;
  failureStage?: "config" | "spawn" | "initialize" | "prompts/list" | "tools/list" | "drift";
  errorSummary?: string;
  diagnosticLog?: string;
  nextActions: string[];
}

export interface IdeConnectionHealthOptions extends IdeDetectionOptions {
  verify?: boolean;
  timeoutMs?: number;
}

interface ProbeResult {
  serverVersion?: string;
  promptIds: string[];
  toolIds: string[];
  diagnosticLog: string;
}

export async function checkIdeConnectionHealth(
  target: IdeTarget,
  engine: SkillEngine,
  options: IdeConnectionHealthOptions = {},
): Promise<IdeConnectionHealth> {
  await engine.waitForReady();
  const baseline = registryBaseline(engine);
  const registration = await detectIdeRegistration(target, options);
  const base = {
    target,
    registered: registration.registered,
    configPath: registration.configPath,
    promptCount: 0,
    toolCount: 0,
    loadedSkillCount: 0,
    registryPromptCount: baseline.promptIds.length,
    registryToolCount: baseline.toolIds.length,
    registryLoadedSkillCount: baseline.skillIds.length,
    missingSkillIds: baseline.skillIds,
    extraSkillIds: [],
    lastCheckedAt: new Date().toISOString(),
  };

  if (!registration.configExists || !registration.registered) {
    return {
      ...base,
      status: "not-registered",
      failureStage: "config",
      errorSummary: registration.error ?? "skill-central is not registered in this IDE MCP config.",
      nextActions: [
        `Run skill-central register ${target}`,
        "Open the IDE MCP settings and confirm the skill-central server entry exists.",
      ],
    };
  }

  if (!registration.configReadable) {
    return {
      ...base,
      status: "permission-blocked",
      failureStage: "config",
      errorSummary: registration.error ?? "IDE config exists but could not be read.",
      nextActions: [
        `Check read permissions for ${registration.configPath}`,
        "Fix malformed JSON before running health check again.",
      ],
    };
  }

  const server = registration.server!;
  const registeredBase = {
    ...base,
    serverCommand: server.command,
    serverArgs: server.args,
  };

  if (options.verify !== true) {
    return {
      ...registeredBase,
      status: "registered",
      errorSummary: "Registered config was found; MCP probe was not requested.",
      nextActions: ["Run doctor with --verify to execute initialize/prompts/list/tools/list probe."],
    };
  }

  try {
    const probe = await probeMcpServer(server, options.timeoutMs ?? 8000);
    const promptIds = new Set(probe.promptIds);
    const toolIds = new Set(probe.toolIds);
    const loadedIds = new Set([...probe.promptIds, ...probe.toolIds]);
    const missing = baseline.skillIds.filter((id) => !loadedIds.has(id));
    const extra = [...loadedIds].filter((id) => !baseline.skillIdSet.has(id));
    const status = missing.length === 0 && extra.length === 0 ? "connected" : "connected-with-drift";

    return {
      ...registeredBase,
      status,
      serverVersion: probe.serverVersion,
      promptCount: promptIds.size,
      toolCount: toolIds.size,
      loadedSkillCount: loadedIds.size,
      missingSkillIds: missing,
      extraSkillIds: extra,
      diagnosticLog: probe.diagnosticLog,
      failureStage: status === "connected-with-drift" ? "drift" : undefined,
      errorSummary: status === "connected-with-drift"
        ? "MCP probe succeeded, but IDE-visible skill ids differ from Registry effective prompt/tool ids."
        : undefined,
      nextActions: status === "connected"
        ? ["No action required."]
        : ["Reload skill-central MCP server in the IDE.", `Run skill-central register ${target} to refresh config.`],
    };
  } catch (err) {
    return {
      ...registeredBase,
      status: classifyProbeError(err),
      failureStage: classifyProbeStage(err),
      errorSummary: err instanceof Error ? err.message : String(err),
      diagnosticLog: diagnosticFromError(err),
      nextActions: nextActionsForProbeError(target, err),
    };
  }
}

async function probeMcpServer(server: McpServerConfig, timeoutMs: number): Promise<ProbeResult> {
  const chunks: Buffer[] = [];

  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args ?? [],
    env: server.env,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) =>
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))),
  );
  const client = new Client({ name: "skill-central-health", version: VERSION }, { capabilities: {} });

  return withTimeout((async () => {
    try {
      await client.connect(transport);
      const prompts = await client.listPrompts();
      const tools = await client.listTools();
      const serverVersion = client.getServerVersion();
      return {
        serverVersion: serverVersion ? `${serverVersion.name}@${serverVersion.version}` : undefined,
        promptIds: prompts.prompts.map((prompt) => prompt.name),
        toolIds: tools.tools.map((tool) => tool.name),
        diagnosticLog: Buffer.concat(chunks).toString("utf-8").trim(),
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  })(), timeoutMs, "initialize");
}

function registryBaseline(engine: SkillEngine) {
  const promptIds = engine.querySkills({ type: "prompt" }).skills.map((skill) => skill.id).sort();
  // MCP tools/list contains user-authored tool skills from the Registry and
  // control-plane tools owned by skill-central itself. Keep both in the parity
  // baseline so health drift means a real IDE-visible mismatch, not an expected
  // built-in command surface.
  const toolIds = [
    ...engine.querySkills({ type: "tool" }).skills.map((skill) => skill.id),
    ...BUILTIN_CONTROL_TOOL_NAMES,
  ].sort();
  const skillIds = Array.from(new Set([...promptIds, ...toolIds])).sort();
  return {
    promptIds,
    toolIds,
    skillIds,
    skillIdSet: new Set(skillIds),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, stage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProbeError(stage, `MCP probe timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class ProbeError extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
  }
}

function classifyProbeError(err: unknown): IdeConnectionStatus {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("EACCES") || message.includes("permission")) return "permission-blocked";
  if (message.includes("ENOENT") || message.includes("spawn")) return "server-stopped";
  return "handshake-failed";
}

function classifyProbeStage(err: unknown): IdeConnectionHealth["failureStage"] {
  if (err instanceof ProbeError) return err.stage as IdeConnectionHealth["failureStage"];
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("ENOENT") || message.includes("spawn")) return "spawn";
  return "initialize";
}

function diagnosticFromError(err: unknown): string | undefined {
  return err instanceof Error && err.stack ? err.stack : undefined;
}

function nextActionsForProbeError(target: IdeTarget, err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("ENOENT")) {
    return [
      "Ensure the configured MCP command is available on PATH.",
      `Run skill-central register ${target} after installing or building the CLI.`,
    ];
  }
  if (message.includes("EACCES") || message.includes("permission")) {
    return ["Check executable permissions and IDE sandbox settings.", "Retry from a shell where the command is allowed."];
  }
  return [
    "Run the configured command manually to inspect stderr.",
    "Reload or restart the IDE MCP integration after fixing the command.",
  ];
}
