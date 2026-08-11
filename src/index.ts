#!/usr/bin/env node
// ============================================================================
// skill-central  CLI Entry
// ----------------------------------------------------------------------------
// Routes subcommands to the appropriate module:
//   skill-central mcp     →  Stdio MCP Server (IDE-facing, silent)
//   skill-central board   →  Developer terminal dashboard
//   skill-central init    →  Scaffold .skills/ directory and config
//   skill-central add     →  Create a new skill definition file
//   skill-central list    →  List all loaded skills (with filters)
//   skill-central show    →  Print full skill details + prompt body
//   skill-central remove  →  Delete a skill file
//   skill-central validate→  Validate one or more skill files
//   skill-central rules   →  List all loaded rules (with filters)
//   skill-central validate-rule → Validate one or more rule files
//   skill-central scope   →  Inspect or atomically edit Skill/Rule scope
//   skill-central reverse-output → Preview/apply/rollback IDE reverse output
//   skill-central compile →  Preview target artifacts without writing files
//   skill-central export  →  Write compiled artifacts with conflict protection
//   skill-central connect →  Preview/apply/verify IDE MCP registration
//   skill-central sync    →  Inspect local-first sync/app-state boundary
//   skill-central session →  Inspect durable workflow session state
//   skill-central workflow→  Start/advance durable workflow sessions
//   skill-central capabilities → Print target adapter capability matrix
// ============================================================================

import { Command } from "commander";
import { startMcpServer } from "./mcp.js";
import { runBoard } from "./commands/board.js";
import { runInit } from "./init.js";
import { cmdAdd } from "./commands/add.js";
import { cmdList } from "./commands/list.js";
import { cmdShow } from "./commands/show.js";
import { cmdRemove } from "./commands/remove.js";
import { cmdValidate } from "./commands/validate.js";
import { cmdRules } from "./commands/rules.js";
import { cmdValidateRule } from "./commands/validate-rule.js";
import { cmdScope } from "./commands/scope.js";
import { cmdReverseOutput } from "./commands/reverse-output.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdInstall } from "./commands/install.js";
import { cmdUpdate } from "./commands/update.js";
import { cmdUninstall } from "./commands/uninstall.js";
import { cmdRegister } from "./commands/register.js";
import { cmdCompile } from "./commands/compile.js";
import { cmdExport } from "./commands/export.js";
import { cmdConnect } from "./commands/connect.js";
import { cmdSync } from "./commands/sync.js";
import { cmdSession } from "./commands/session.js";
import { cmdWorkflow } from "./commands/workflow.js";
import { cmdCapabilities } from "./commands/capabilities.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("skill-central")
  .description("Local MCP Server for cross-IDE AI skill distribution")
  .version(VERSION, "-v, --version");

program
  .command("mcp")
  .description("Start Stdio MCP Server (for IDE integration)")
  .action(() => {
    startMcpServer().catch((err) => {
      console.error("[skill-central] Fatal:", err);
      process.exit(1);
    });
  });

program
  .command("board")
  .description("Start web dashboard (default) or show terminal table (--cli)")
  .option("--cli", "Force terminal-table output (skip web UI)")
  .option("--no-web", "Alias for --cli")
  .option("--port <port>", "Web dashboard port (default 5417; auto +1 on conflict)")
  .option("--host <addr>", "Bind address (default 127.0.0.1; non-loopback requires --i-understand-nonlocal)")
  .option("--i-understand-nonlocal", "Acknowledge risk of binding to a non-loopback address")
  .action((opts) => {
    runBoard({
      cli: !!(opts.cli || opts.web === false),
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      host: opts.host,
      iUnderstandNonlocal: opts.iUnderstandNonlocal,
    }).catch((err) => {
      console.error("[skill-central] Board error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("init")
  .description("Scaffold .skills/ directory with sample definitions")
  .action(() => {
    runInit().catch((err) => {
      console.error("[skill-central] Init error:", err);
      process.exit(1);
    });
  });

program
  .command("add")
  .description("Create a new skill definition file (auto-selects layer from tags)")
  .option("--id <id>", "Skill id in kebab-case (required unless --from-file)")
  .option("-n, --name <name>", "Human-readable name (required unless --from-file)")
  .option("-d, --description <text>", "Short description (required unless --from-file)")
  .option("-t, --type <type>", 'Skill type: "prompt" or "tool" (default: prompt)')
  .option("--tags <tags>", "Comma-separated tags (used for layer inference)")
  .option("--prompt <text>", "Inline prompt content (mutually exclusive with --prompt-file)")
  .option("--prompt-file <path>", "Read prompt content from a file")
  .option("--from-file <path>", "Copy an existing skill file verbatim (overrides other content flags)")
  .option("--layer <layer>", "Force target layer (bypasses tag inference)")
  .option("--user", "Write to the default or explicitly selected user Asset Library")
  .option("--force", "Overwrite existing file (creates a .bak.<ts> backup)")
  .option("-y, --yes", "Skip confirmations")
  .action((opts) => {
    cmdAdd({
      id: opts.id,
      name: opts.name,
      description: opts.description,
      type: opts.type,
      tags: opts.tags,
      prompt: opts.prompt,
      promptFile: opts.promptFile,
      fromFile: opts.fromFile,
      layer: opts.layer,
      user: opts.user,
      force: opts.force,
      yes: opts.yes,
    }).catch((err) => {
      console.error("[skill-central] Add error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("list")
  .description("List all loaded skills (filters: --layer, --type, --tag)")
  .option("--layer <name>", "Only show skills from this layer")
  .option("--type <type>", 'Only show skills of this type ("prompt" or "tool")')
  .option("--tag <tag>", "Only show skills with this tag")
  .option("--project-root <path>", "Override the current project root for scope filtering")
  .option("--project-id <id>", "Override the current git:/path: project id")
  .option("--source", "Also print source file paths")
  .action((opts) => {
    cmdList({
      layer: opts.layer,
      type: opts.type,
      tag: opts.tag,
      source: opts.source,
      projectRoot: opts.projectRoot,
      projectId: opts.projectId,
    }).catch((err) => {
      console.error("[skill-central] List error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("show <id>")
  .description("Print full details + prompt body of a single skill")
  .option("--project-root <path>", "Override the current project root for scope filtering")
  .option("--project-id <id>", "Override the current git:/path: project id")
  .action((id: string, opts) => {
    cmdShow(id, { projectRoot: opts.projectRoot, projectId: opts.projectId }).catch((err) => {
      console.error("[skill-central] Show error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("remove <id>")
  .description("Delete a skill definition file (use --layer if id exists in multiple layers)")
  .option("--layer <name>", "Specify which layer to remove from (required if id spans layers)")
  .option("--force", "Skip confirmation")
  .action((id: string, opts) => {
    cmdRemove(id, {
      layer: opts.layer,
      force: opts.force,
    }).catch((err) => {
      console.error("[skill-central] Remove error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("validate <files...>")
  .description("Parse and validate one or more skill definition files")
  .action((files: string[]) => {
    cmdValidate(files).catch((err) => {
      console.error("[skill-central] Validate error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("rules")
  .description("List applicable rules from global and project libraries (filters: --tag, --severity)")
  .option("--tag <tag>", "Only show rules with this tag")
  .option("--severity <severity>", 'Only show rules of this severity ("info", "warn", or "error")')
  .option("--dir <path>", "Override the active Asset Library rules directory")
  .option("--project-root <path>", "Override the current project root for scope filtering")
  .option("--project-id <id>", "Override the current git:/path: project id")
  .action((opts) => {
    cmdRules({
      tag: opts.tag,
      severity: opts.severity,
      dir: opts.dir,
      projectRoot: opts.projectRoot,
      projectId: opts.projectId,
    }).catch((err) => {
      console.error("[skill-central] Rules error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("validate-rule <files...>")
  .description("Parse and validate one or more rule definition files")
  .action((files: string[]) => {
    cmdValidateRule(files).catch((err) => {
      console.error("[skill-central] Validate-rule error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("scope [action] [file]")
  .description("Inspect project identity or show/set a Skill/Rule appliesTo scope")
  .option("--global", "Set the asset scope to global")
  .option("--current-project", "Bind the asset to the detected current project")
  .option("--projects <ids>", "Bind to comma-separated git:/path: project ids")
  .option("--project-root <path>", "Override the project root used for identity detection")
  .option("--expected-sha256 <hash>", "Reject the write when file content has changed")
  .option("--json", "Print machine-readable output")
  .action((action: string | undefined, file: string | undefined, opts) => {
    cmdScope({
      action,
      file,
      global: opts.global,
      currentProject: opts.currentProject,
      projects: opts.projects,
      projectRoot: opts.projectRoot,
      expectedSha256: opts.expectedSha256,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Scope error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("doctor")
  .description("Scan layers for missing dirs, parse errors, id collisions, and orphan backups")
  .option("--ide <target>", "Also run IDE connection health check: codex, claude, trae, cursor, windsurf, cline")
  .option("--config-path <path>", "Override IDE MCP config path for --ide")
  .option("--verify", "Run MCP initialize/prompts/list/tools/list probe for --ide")
  .option("--json", "Print machine-readable doctor report")
  .action((opts) => {
    cmdDoctor({
      ide: opts.ide,
      configPath: opts.configPath,
      verify: opts.verify,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Doctor error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("install <source>")
  .description("Install a skill from github: or npm: URL (P10 adds npm)")
  .option("--layer <layer>", "Force target layer (bypasses tag inference)")
  .option("--project", "Install into project .skills/ (default: user ~/.skill-central/skills/)")
  .option("-y, --yes", "Skip installation confirmation")
  .action((source: string, opts) => {
    cmdInstall(source, {
      layer: opts.layer,
      project: opts.project,
      yes: opts.yes,
    }).catch((err) => {
      console.error("[skill-central] Install error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("update [id]")
  .description("Re-fetch installed skill(s) from their source. With no id, updates all.")
  .option("--project", "Update into project scope (default: user)")
  .option("-y, --yes", "Skip per-skill confirmation (default: non-interactive)")
  .action((id: string | undefined, opts) => {
    cmdUpdate(id, {
      yes: opts.yes,
      project: opts.project,
    }).catch((err) => {
      console.error("[skill-central] Update error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("uninstall <id>")
  .description("Remove an installed skill (file + lock entry)")
  .option("--purge-backups", "Also remove the .bak.* siblings")
  .option("-y, --yes", "Skip confirmation")
  .action((id: string, opts) => {
    cmdUninstall(id, {
      yes: opts.yes,
      purgeBackups: opts.purgeBackups,
    }).catch((err) => {
      console.error("[skill-central] Uninstall error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("register [ide]")
  .description("Automatically register skill-central into IDE MCP configurations (codex, claude, trae, cursor, windsurf, cline). Omitting [ide] auto-detects existing configs.")
  .option("--remove", "Remove the skill-central registration from the IDE config")
  .option("--config-path <path>", "Override IDE MCP config path")
  .action((ide: string | undefined, opts) => {
    cmdRegister(ide, {
      remove: opts.remove,
      configPath: opts.configPath,
    }).catch((err) => {
      console.error("[skill-central] Register error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("reverse-output <action>")
  .description("Preview/apply/rollback a structured IDE reverse-output proposal")
  .option("--asset-type <type>", 'Asset type: "skill" or "rule"')
  .option("--operation <operation>", 'Operation: "create" or "update"')
  .option("--source <source>", "Proposal source, such as ide:codex")
  .option("--context <context>", "Work context for the proposal")
  .option("--target <target>", "Skill layer id/name or directory under .rules/")
  .option("--placement <placement>", "Placement: skill, covenant-rule, ide-native-rule, or project-local")
  .option("--placement-reason <text>", "Why the candidate belongs in the selected placement")
  .option("--asset-file <path>", "JSON/YAML asset object for preview/apply")
  .option("--decision <decision>", 'Apply decision: "promote", "defer", or "discard"')
  .option("--expected-sha256 <hash>", "Expected source hash for update/rollback")
  .option("--app-state-dir <path>", "Override app-state directory for audit evidence")
  .option("--target-path <path>", "Existing asset path for rollback")
  .option("--backup-path <path>", "Sibling backup path for rollback")
  .option("--project-root <path>", "Override project root")
  .option("--json", "Print machine-readable result")
  .action((action: string, opts) => {
    cmdReverseOutput({
      action,
      assetType: opts.assetType,
      operation: opts.operation,
      source: opts.source,
      context: opts.context,
      target: opts.target,
      placement: opts.placement,
      placementReason: opts.placementReason,
      assetFile: opts.assetFile,
      decision: opts.decision,
      expectedSha256: opts.expectedSha256,
      appStateDir: opts.appStateDir,
      targetPath: opts.targetPath,
      backupPath: opts.backupPath,
      projectRoot: opts.projectRoot,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Reverse output error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("compile")
  .description("Compile skills for a target IDE without writing files (Phase 2B dry-run)")
  .requiredOption("--target <target>", "Target adapter: generic-mcp, cursor, windsurf")
  .requiredOption("--intent <intent>", "Intent, skill id, or tag to compile")
  .option("--dry-run", "Preview artifacts without writing files")
  .option("--json", "Print the machine-readable compile bundle")
  .action((opts) => {
    cmdCompile({
      target: opts.target,
      intent: opts.intent,
      dryRun: opts.dryRun,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Compile error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("export")
  .description("Export compiled artifacts with preview, conflict checks, and backups")
  .requiredOption("--target <target>", "Target adapter: generic-mcp, cursor, windsurf")
  .requiredOption("--intent <intent>", "Intent, skill id, or tag to export")
  .requiredOption("--out <dir>", "Output directory")
  .option("--dry-run", "Print planned writes without writing files")
  .option("--stdout", "Print artifact contents to stdout without writing files")
  .option("--json", "Print the machine-readable export plan without writing files")
  .option("--force", "Overwrite different existing files after creating .bak.<timestamp> backups")
  .action((opts) => {
    cmdExport({
      target: opts.target,
      intent: opts.intent,
      out: opts.out,
      dryRun: opts.dryRun,
      stdout: opts.stdout,
      json: opts.json,
      force: opts.force,
    }).catch((err) => {
      console.error("[skill-central] Export error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("connect")
  .description("Preview, apply, verify, or rollback IDE MCP registration")
  .requiredOption("--target <ide>", "IDE target: codex, claude, trae, cursor, windsurf, cline")
  .option("--config-path <path>", "Override IDE MCP config path")
  .option("--dry-run", "Print connection plan without writing files")
  .option("--verify", "After writing, run MCP initialize/prompts/list/tools/list health probe")
  .option("--json", "Print machine-readable connect plan")
  .option("--rollback", "Restore a backup created by connect")
  .option("--backup-path <path>", "Backup path to restore with --rollback")
  .action((opts) => {
    cmdConnect({
      target: opts.target,
      configPath: opts.configPath,
      dryRun: opts.dryRun,
      verify: opts.verify,
      json: opts.json,
      rollback: opts.rollback,
      backupPath: opts.backupPath,
    }).catch((err) => {
      console.error("[skill-central] Connect error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("sync [action]")
  .description("Inspect local-first sync state and preview GitHub sync setup")
  .option("--app-state-dir <path>", "Override app state directory for tests or desktop shells")
  .option("--client-id <id>", "GitHub OAuth app client id for sync login")
  .option("--poll", "Poll GitHub Device Flow until an access token is available")
  .option("--owner <owner>", "GitHub owner for sync repo planning")
  .option("--repo <repo>", "GitHub repo name for sync repo planning")
  .option("--registry-dir <path>", "Local remote-registry checkout path for sync scan/plan")
  .option("--direction <direction>", "Sync plan direction: push, pull, or both")
  .option("--exists", "Treat the planned GitHub repo as existing")
  .option("--dry-run", "Preview sync changes without local or remote writes")
  .option("--force", "Allow sync apply to update or delete existing files after backups")
  .option("--json", "Print machine-readable sync status")
  .action((action: string | undefined, opts) => {
    cmdSync({
      action,
      appStateDir: opts.appStateDir,
      clientId: opts.clientId,
      poll: opts.poll,
      owner: opts.owner,
      repo: opts.repo,
      registryDir: opts.registryDir,
      direction: opts.direction,
      exists: opts.exists,
      dryRun: opts.dryRun,
      force: opts.force,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Sync error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("session [action]")
  .description("Create, list, inspect, or update durable workflow sessions")
  .option("--app-state-dir <path>", "Override app state directory for tests or desktop shells")
  .option("--workflow-id <id>", "Workflow id for session create")
  .option("--session-id <id>", "Session id for show/status")
  .option("--status <status>", "New status for session status: created, running, blocked, completed, failed")
  .option("--reason <text>", "Audit reason for create/status")
  .option("--trigger <text>", "Audit trigger for create/status")
  .option("--topic <topic>", "Blackboard topic for publish/topic")
  .option("--producer <id>", "Blackboard producer id for publish")
  .option("--kind <kind>", "Blackboard entry kind for publish")
  .option("--content <json-or-text>", "Blackboard entry content for publish")
  .option("--summary <text>", "Blackboard entry summary for publish")
  .option("--refs <uris>", "Comma-separated reference URIs for publish")
  .option("--json", "Print machine-readable session output")
  .action((action: string | undefined, opts) => {
    cmdSession({
      action,
      appStateDir: opts.appStateDir,
      workflowId: opts.workflowId,
      sessionId: opts.sessionId,
      status: opts.status,
      reason: opts.reason,
      trigger: opts.trigger,
      topic: opts.topic,
      producer: opts.producer,
      kind: opts.kind,
      content: opts.content,
      summary: opts.summary,
      refs: opts.refs,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Session error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("workflow [action]")
  .description("Start, advance, publish to, or summarize workflow sessions")
  .option("--app-state-dir <path>", "Override app state directory for tests or desktop shells")
  .option("--workflow-id <id>", "Workflow id for start")
  .option("--session-id <id>", "Session id for next/publish/summarize")
  .option("--topic <topic>", "Blackboard topic for publish")
  .option("--producer <id>", "Blackboard producer id for publish")
  .option("--kind <kind>", "Blackboard entry kind for publish")
  .option("--content <json-or-text>", "Blackboard entry content for publish")
  .option("--summary <text>", "Blackboard entry summary for publish/summarize")
  .option("--refs <uris>", "Comma-separated reference URIs for publish")
  .option("--json", "Print machine-readable workflow output")
  .action((action: string | undefined, opts) => {
    cmdWorkflow({
      action,
      appStateDir: opts.appStateDir,
      workflowId: opts.workflowId,
      sessionId: opts.sessionId,
      topic: opts.topic,
      producer: opts.producer,
      kind: opts.kind,
      content: opts.content,
      summary: opts.summary,
      refs: opts.refs,
      json: opts.json,
    }).catch((err) => {
      console.error("[skill-central] Workflow error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("capabilities")
  .description("Print a target adapter capability matrix")
  .requiredOption("--target <target>", "Target adapter: generic-mcp, cursor, windsurf")
  .action((opts) => {
    try {
      cmdCapabilities({ target: opts.target });
    } catch (err) {
      console.error("[skill-central] Capabilities error:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse(process.argv);
