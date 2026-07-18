// ============================================================================
// MCP Server Command
// ----------------------------------------------------------------------------
// "skill-central mcp" — 纯静默 Stdio 模式，专供 IDE (Cursor / Windsurf) 调用。
// 所有 console.log 被静默或重定向到 stderr，确保 stdout 仅供 JSON-RPC 使用。
// ============================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SkillEngine } from "./core/engine.js";
import { registerHandlers } from "./protocol/handler.js";
import { loadConfig } from "./storage/config.js";
import { VERSION } from "./version.js";

/**
 * 启动 MCP Server 并绑定 Stdio 传输。
 * 此函数不会正常返回，进程会持续监听 stdin 上的 JSON-RPC 消息。
 */
export async function startMcpServer(): Promise<void> {
  // ── 抑制 console.log 等 stdout 输出 ─────────────────────────────────────
  // MCP Stdio 协议以 stdout 作为 JSON-RPC 传输通道。任何输出到 stdout 的数据
  // 都会破坏协议帧，导致 IDE 无法解析响应。所有调试信息一律走 stderr。
  const log = console.log;
  const info = console.info;
  const debug = console.debug;
  console.log = (...args: unknown[]) => console.error("[mcp]", ...args);
  console.info = (...args: unknown[]) => console.error("[mcp:info]", ...args);
  console.debug = (...args: unknown[]) => console.error("[mcp:debug]", ...args);

  const config = loadConfig();

  const server = new Server(
    { name: "skill-central", version: VERSION },
    { capabilities: { prompts: {}, tools: {} } },
  );

  const engine = new SkillEngine();
  registerHandlers(server, engine);

  await engine.reload(config.layers);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 这里需要静默—不输出到 stdout
  // 但 stderr 的启动日志对调试仍有帮助
  console.error("[skill-central] MCP server ready on stdio");
}
