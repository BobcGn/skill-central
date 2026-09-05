// ============================================================================
// Board / Shared MCP HTTP Endpoint
// ----------------------------------------------------------------------------
// The packaged desktop app is a long-lived local service. Exposing MCP through
// its existing loopback HTTP listener lets many IDE sessions share that one
// process instead of each allocating a persistent stdio child.
// ============================================================================

import { randomUUID } from "node:crypto";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import type { SkillEngine } from "../core/engine.js";
import { RuleEngine } from "../core/rule-engine.js";
import { registerHandlers } from "../protocol/handler.js";
import type { SkillCentralConfig } from "../storage/config.js";
import { VERSION } from "../version.js";

interface McpHttpSession {
  server: Server;
  transport: WebStandardStreamableHTTPServerTransport;
  lastActivityAt: number;
}

const MAX_MCP_HTTP_SESSIONS = 128;
const MCP_HTTP_SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

export interface SharedMcpHttpEndpoint {
  handle(request: Request): Promise<Response>;
  close(): Promise<void>;
  sessionCount(): number;
}

export interface SharedMcpHttpEndpointOptions {
  engine: SkillEngine;
  getProjectRoot: () => string;
  getConfig: () => SkillCentralConfig;
}

export function createSharedMcpHttpEndpoint(
  options: SharedMcpHttpEndpointOptions,
): SharedMcpHttpEndpoint {
  const sessions = new Map<string, McpHttpSession>();

  const closeSession = async (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    await session.server.close().catch(() => session.transport.close().catch(() => undefined));
  };

  const pruneSessions = async (): Promise<void> => {
    const expiredBefore = Date.now() - MCP_HTTP_SESSION_IDLE_MS;
    const expired = [...sessions.entries()]
      .filter(([, session]) => session.lastActivityAt < expiredBefore)
      .map(([id]) => id);
    await Promise.allSettled(expired.map(closeSession));

    while (sessions.size >= MAX_MCP_HTTP_SESSIONS) {
      const oldest = [...sessions.entries()]
        .sort((left, right) => left[1].lastActivityAt - right[1].lastActivityAt)[0];
      if (!oldest) break;
      await closeSession(oldest[0]);
    }
  };

  return {
    async handle(request: Request): Promise<Response> {
      if (!isLoopbackRequest(request)) {
        return jsonRpcError(403, -32000, "MCP endpoint is available on loopback only.");
      }
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) {
        return jsonRpcError(403, -32000, "Cross-origin MCP request rejected.");
      }

      const sessionId = request.headers.get("mcp-session-id");
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) return jsonRpcError(404, -32001, "Session not found.");
        session.lastActivityAt = Date.now();
        return session.transport.handleRequest(request);
      }

      if (request.method !== "POST") {
        return jsonRpcError(400, -32000, "Mcp-Session-Id is required.");
      }

      let body: unknown;
      try {
        body = await request.clone().json();
      } catch {
        return jsonRpcError(400, -32700, "Invalid JSON body.");
      }
      if (!isInitializeRequest(body)) {
        return jsonRpcError(400, -32000, "Initialize request required for a new MCP session.");
      }

      await pruneSessions();
      await options.engine.waitForReady();
      const projectRoot = options.getProjectRoot();
      const config = options.getConfig();
      const ruleEngine = new RuleEngine();
      await ruleEngine.reload({
        projectRoot,
        globalRulesDir: config.assetLibrary?.rulesDir,
        projectRulesDir: config.assetLibrary?.rulesDir,
      });

      let initializedSessionId: string | undefined;
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          initializedSessionId = id;
          sessions.set(id, { server, transport, lastActivityAt: Date.now() });
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
        },
      });
      const server = new Server(
        { name: "skill-central", version: VERSION },
        { capabilities: { prompts: {}, tools: {}, resources: {} } },
      );
      registerHandlers(server, options.engine, ruleEngine, { config, projectRoot });
      server.onclose = () => {
        if (initializedSessionId) sessions.delete(initializedSessionId);
      };
      await server.connect(transport);

      try {
        const response = await transport.handleRequest(request, { parsedBody: body });
        if (!initializedSessionId) await server.close().catch(() => undefined);
        return response;
      } catch (error) {
        await server.close().catch(() => undefined);
        throw error;
      }
    },

    async close(): Promise<void> {
      await Promise.allSettled([...sessions.keys()].map(closeSession));
      sessions.clear();
    },

    sessionCount(): number {
      return sessions.size;
    },
  };
}

function isLoopbackRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function jsonRpcError(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });
}
