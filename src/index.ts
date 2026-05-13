#!/usr/bin/env node
// ============================================================================
// skill-central  CLI Entry
// ----------------------------------------------------------------------------
// Routes subcommands to the appropriate module:
//   skill-central mcp     →  Stdio MCP Server (IDE-facing, silent)
//   skill-central board   →  Developer terminal dashboard
//   skill-central init    →  Scaffold .skills/ directory and config
// ============================================================================

import { Command } from "commander";
import { startMcpServer } from "./mcp.js";
import { showBoard } from "./board.js";
import { runInit } from "./init.js";

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

program.parse(process.argv);
