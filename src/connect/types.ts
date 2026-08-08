// ============================================================================
// Connect / Types
// ----------------------------------------------------------------------------
// One-click connection transaction model for IDE MCP registration.
//
// Design intent:
// - "One click" is still a transaction: preview, backup, write, verify, and
//   rollback evidence must be visible to CLI and future desktop UI.
// - Steps are data so UI can render the same plan the CLI applies.
// - TODO(Phase 3B): expose this plan through the Web Board connect wizard.
// ============================================================================

import type { IdeConnectionHealth } from "../health/ide-connection.js";
import type { IdeConfigFormat, IdeTarget, McpServerConfig } from "../ide-detection/types.js";

export type ConnectStepKind = "detect" | "preview" | "backup" | "write" | "verify" | "rollback";
export type ConnectStepStatus = "pending" | "applied" | "skipped";

export interface ConnectPlanStep {
  kind: ConnectStepKind;
  status: ConnectStepStatus;
  title: string;
  detail: string;
}

export interface OneClickConnectPlan {
  target: IdeTarget;
  configPath: string;
  configFormat: IdeConfigFormat;
  serverName: "skill-central";
  desiredServer: McpServerConfig;
  currentServer?: McpServerConfig;
  currentRegistered: boolean;
  serverDrift: boolean;
  configExists: boolean;
  dryRun: boolean;
  force: boolean;
  backupPath?: string;
  diffPreview: string;
  steps: ConnectPlanStep[];
  health?: IdeConnectionHealth;
}
