#!/usr/bin/env node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = await mkdtemp(path.join(tmpdir(), "skill-central-mcp-gate-"));
const globalRulesDir = path.join(fixtureRoot, "global-rules");

try {
  await createFixture();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "dist", "index.js"), "mcp"],
    cwd: fixtureRoot,
    env: {
      ...getDefaultEnvironment(),
      SKILL_CENTRAL_GLOBAL_RULES_DIR: globalRulesDir,
      SKILL_CENTRAL_USER_SKILLS_DIR: path.join(fixtureRoot, "user-skills"),
      SKILL_CENTRAL_SETTINGS_PATH: path.join(fixtureRoot, "settings.json"),
      SKILL_CENTRAL_DEFAULT_ASSET_ROOT: path.join(fixtureRoot, "default-library"),
      SKILL_CENTRAL_ASSET_ROOT: "",
    },
    stderr: "pipe",
  });
  const client = new Client(
    { name: "skill-central-release-mcp-gate", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    await assertResources(client);
    await assertPrompts(client);
    await assertTools(client);
    await assertNegativeBoundaries(client);
  } finally {
    await client.close().catch(() => undefined);
  }

  console.log("MCP release gate passed: Skills and Rules are discoverable and consumable.");
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

async function createFixture() {
  await mkdir(path.join(fixtureRoot, ".skills", "01-global"), { recursive: true });
  await mkdir(path.join(fixtureRoot, ".rules"), { recursive: true });
  await mkdir(globalRulesDir, { recursive: true });

  await writeFile(path.join(fixtureRoot, "skill-central.yaml"), [
    "layers:",
    "  - id: gate-global",
    "    name: gate-global",
    "    path: .skills/01-global",
    "    scope: workspace",
    "    priority: 10",
    "    writable: true",
    "    trust: local",
    "    sync: { enabled: false }",
    "    visibility: private",
    "",
  ].join("\n"));
  await writeFile(path.join(fixtureRoot, ".skills", "01-global", "gate-prompt.yaml"), [
    "id: gate-prompt",
    "name: Gate Prompt",
    "description: MCP release-gate prompt",
    "type: prompt",
    "tags: [release-gate]",
    "prompt: Always preserve release-gate evidence.",
    "",
  ].join("\n"));
  await writeFile(path.join(globalRulesDir, "shared-policy.yaml"), ruleYaml(
    "shared-policy",
    "Global body that must be overridden by the project covenant.",
    "warn",
  ));
  await writeFile(path.join(globalRulesDir, "global-only.yaml"), ruleYaml(
    "global-only",
    "Global rules remain visible from every project.",
    "info",
  ));
  await writeFile(path.join(fixtureRoot, ".rules", "shared-policy.yaml"), ruleYaml(
    "shared-policy",
    "Project covenant overrides the same-id global rule.",
    "error",
  ));
}

async function assertResources(client) {
  const listed = await client.listResources();
  for (const uri of [
    "skill://registry",
    "skill://skill/gate-prompt",
    "rule://registry",
    "rule://rule/global-only",
    "rule://rule/shared-policy",
  ]) {
    assert(listed.resources.some((resource) => resource.uri === uri), `missing resource ${uri}`);
  }

  const skill = jsonContent(await client.readResource({ uri: "skill://skill/gate-prompt" }));
  assert(skill.prompt === "Always preserve release-gate evidence.", "skill body is not readable");

  const registry = jsonContent(await client.readResource({ uri: "rule://registry" }));
  assert(registry.rules.length === 2, `expected two effective rules, received ${registry.rules.length}`);
  const overridden = registry.rules.find((rule) => rule.id === "shared-policy");
  assert(overridden?.library === "project", "project rule did not override global same-id rule");
  assert(overridden?.severity === "error", "effective project rule metadata is incorrect");
}

async function assertPrompts(client) {
  const listed = await client.listPrompts();
  for (const name of ["gate-prompt", "rules:all", "rule:global-only", "rule:shared-policy"]) {
    assert(listed.prompts.some((prompt) => prompt.name === name), `missing prompt ${name}`);
  }
  const allRules = await client.getPrompt({ name: "rules:all" });
  const body = allRules.messages.map((message) => message.content?.text ?? "").join("\n");
  assert(body.includes("Global rules remain visible"), "rules:all omitted the global rule body");
  assert(body.includes("Project covenant overrides"), "rules:all omitted the project rule body");
  assert(!body.includes("Global body that must be overridden"), "rules:all leaked a shadowed global rule");
}

async function assertTools(client) {
  const listed = await client.listTools();
  for (const name of ["rules.list", "rules.get"]) {
    assert(listed.tools.some((tool) => tool.name === name), `missing tool ${name}`);
  }
  const listResult = jsonTool(await client.callTool({
    name: "rules.list",
    arguments: { severity: "error" },
  }));
  assert(listResult.count === 1 && listResult.rules[0].id === "shared-policy", "rules.list filter failed");
  assert(!("body" in listResult.rules[0]), "rules.list should return metadata without duplicating bodies");

  const getResult = jsonTool(await client.callTool({
    name: "rules.get",
    arguments: { id: "shared-policy" },
  }));
  assert(getResult.body.includes("Project covenant overrides"), "rules.get did not return the full body");
}

async function assertNegativeBoundaries(client) {
  await mustReject(
    () => client.readResource({ uri: "rule://rule/unknown" }),
    "unknown rule resource",
  );
  await mustReject(
    () => client.getPrompt({ name: "rules:all", arguments: { severity: "critical" } }),
    "invalid rule severity",
  );
  await mustReject(
    () => client.callTool({ name: "rules.get", arguments: { id: "" } }),
    "empty rule id",
  );
}

function ruleYaml(id, body, severity) {
  return [
    "schemaVersion: skillcentral.dev/rule/v1",
    `id: ${id}`,
    `name: ${id}`,
    `description: ${id} release-gate fixture`,
    `severity: ${severity}`,
    "tags: [release-gate]",
    "appliesTo: global",
    "body: |",
    `  ${body}`,
    "",
  ].join("\n");
}

function jsonContent(result) {
  const content = result.contents[0];
  assert(content?.text, "resource returned no text content");
  return JSON.parse(content.text);
}

function jsonTool(result) {
  const content = result.content[0];
  assert(content?.type === "text", "tool returned no text content");
  return JSON.parse(content.text);
}

async function mustReject(operation, label) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assert(rejected, `${label} should reject`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
