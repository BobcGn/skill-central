// ============================================================================
// IDE Detection / Types
// ----------------------------------------------------------------------------
// Shared IDE registration model for register, health, and future connect flows.
//
// Design intent:
// - Phase 3 must not let CLI, Web Board, and desktop shell each guess IDE
//   config locations differently. This module is the first stable seam for
//   target IDE discovery.
// - Config path overrides are explicit because hard-coded OS paths are a known
//   roadmap返工 trigger.
// ============================================================================

export type IdeTarget = "codex" | "claude" | "trae" | "cursor" | "windsurf" | "cline";

export type IdeConfigFormat = "json" | "toml";

export interface IdeTargetDefinition {
  target: IdeTarget;
  label: string;
  description: string;
  configFormat: IdeConfigFormat;
  docsUrl: string;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface IdeDetectionOptions {
  configPath?: string;
}

export interface IdeRegistration {
  target: IdeTarget;
  configPath: string;
  configFormat: IdeConfigFormat;
  configExists: boolean;
  configReadable: boolean;
  registered: boolean;
  server?: McpServerConfig;
  error?: string;
}
