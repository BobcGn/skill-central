#!/usr/bin/env node
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Hono } from "hono";

import { checkIdeConnectionHealth } from "../dist/health/ide-connection.js";
import { createSharedMcpHttpEndpoint } from "../dist/web/mcp-http.js";
import { createBoardApp } from "../dist/web/server.js";

const root = await mkdtemp(path.join(tmpdir(), "skill-central-shared-mcp."));
const skillsDir = path.join(root, "skills");
const rulesDir = path.join(root, "rules");
await Promise.all([mkdir(skillsDir), mkdir(rulesDir)]);

const engine = {
  waitForReady: async () => undefined,
  querySkills: () => ({ skills: [] }),
};
const config = {
  layers: [],
  assetLibrary: { mode: "custom", rootDir: root, skillsDir, rulesDir },
};
const endpoint = createSharedMcpHttpEndpoint({
  engine,
  getProjectRoot: () => root,
  getConfig: () => config,
});
const externallyBoundBoard = createBoardApp({
  engine,
  config,
  rootDir: root,
  mcpHttpEndpoint: endpoint,
  mcpHttpEnabled: false,
});
assert.equal(
  (await externallyBoundBoard.request("/mcp", { method: "POST" })).status,
  404,
  "Boards bound beyond loopback must not expose the MCP endpoint",
);
const app = new Hono();
app.all("/mcp", (c) => endpoint.handle(c.req.raw));
const httpServer = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });

try {
  if (!httpServer.listening) await once(httpServer, "listening");
  const address = httpServer.address();
  assert(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mcp`;

  const first = await connectClient(url, "shared-http-first");
  const second = await connectClient(url, "shared-http-second");
  assert.equal(endpoint.sessionCount(), 2, "two clients must share one HTTP server process with separate sessions");

  const tools = await first.client.listTools();
  assert(tools.tools.some((tool) => tool.name === "rules.list"));

  const configPath = path.join(root, "mcp.json");
  await writeFile(configPath, JSON.stringify({
    mcpServers: { "skill-central": { url } },
  }));
  const health = await checkIdeConnectionHealth("cursor", engine, {
    configPath,
    verify: true,
    timeoutMs: 2000,
  });
  assert.equal(health.status, "connected", health.errorSummary);
  assert.equal(health.serverUrl, url);

  await first.transport.terminateSession();
  await first.client.close();
  await waitForSessionCount(endpoint, 1);
  await second.transport.terminateSession();
  await second.client.close();
  await waitForSessionCount(endpoint, 0);
  console.log("Shared MCP HTTP contract passed: concurrent clients reuse one Board process and sessions close cleanly.");
} finally {
  await endpoint.close();
  if (httpServer.listening) {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
  await rm(root, { recursive: true, force: true });
}

async function connectClient(url, name) {
  const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  return { client, transport };
}

async function waitForSessionCount(endpoint, expected) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (endpoint.sessionCount() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(endpoint.sessionCount(), expected);
}
