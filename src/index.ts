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
// ============================================================================

import { Command } from "commander";
import { startMcpServer } from "./mcp.js";
import { showBoard } from "./board.js";
import { runInit } from "./init.js";
import { cmdAdd } from "./commands/add.js";
import { cmdList } from "./commands/list.js";
import { cmdShow } from "./commands/show.js";
import { cmdRemove } from "./commands/remove.js";
import { cmdValidate } from "./commands/validate.js";
import { cmdDoctor } from "./commands/doctor.js";

const program = new Command();

program
  .name("skill-central")
  .description("Local MCP Server for cross-IDE AI skill distribution")
  .version("0.1.0");

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
  .description("Display loaded skills and layer hierarchy")
  .action(() => {
    showBoard().catch((err) => {
      console.error("[skill-central] Board error:", err);
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
  .option("--user", "Write to ~/.skill-central/skills/ instead of project .skills/")
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
  .option("--source", "Also print source file paths")
  .action((opts) => {
    cmdList({
      layer: opts.layer,
      type: opts.type,
      tag: opts.tag,
      source: opts.source,
    }).catch((err) => {
      console.error("[skill-central] List error:", err.message ?? err);
      process.exit(1);
    });
  });

program
  .command("show <id>")
  .description("Print full details + prompt body of a single skill")
  .action((id: string) => {
    cmdShow(id).catch((err) => {
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
  .command("doctor")
  .description("Scan layers for missing dirs, parse errors, id collisions, and orphan backups")
  .action(() => {
    cmdDoctor().catch((err) => {
      console.error("[skill-central] Doctor error:", err.message ?? err);
      process.exit(1);
    });
  });

program.parse(process.argv);
