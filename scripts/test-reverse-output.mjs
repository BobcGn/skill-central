#!/usr/bin/env node
// Integration coverage for the IDE/CLI reverse-output control plane.
// Every source and audit file lives under a temporary project root.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { SkillEngine } from "../dist/core/engine.js";
import { ReverseOutputService } from "../dist/reverse-output/service.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "skill-central-reverse-output-"));
const projectRoot = path.join(root, "project");
const appStateDir = path.join(root, "app-state");
const layerPath = path.join(projectRoot, ".skills", "02-workflows");
const rulesPath = path.join(projectRoot, ".rules", "00-governance");
const projectEnvironment = { ...process.env };
delete projectEnvironment.SKILL_CENTRAL_ASSET_ROOT;
projectEnvironment.SKILL_CENTRAL_SETTINGS_PATH = path.join(root, "project-settings.json");

const config = {
  layers: [{
    id: "02-workflows",
    name: "02-workflows",
    path: layerPath,
    scope: "workspace",
    priority: 20,
    writable: true,
    trust: "local",
    sync: { enabled: false },
    visibility: "private",
  }],
};

const skillAsset = {
  schemaVersion: "skillcentral.dev/v1",
  id: "reverse-ci-skill",
  name: "Reverse CI Skill",
  description: "Skill created through reverse output.",
  type: "prompt",
  tags: ["ci", "reverse-output"],
  prompt: "Preserve the reusable CI lesson.",
  appliesTo: "global",
};

const ruleAsset = {
  schemaVersion: "skillcentral.dev/rule/v1",
  id: "reverse-ci-rule",
  name: "Reverse CI Rule",
  description: "Rule created through reverse output.",
  severity: "warn",
  tags: ["ci", "reverse-output"],
  body: "Keep the reverse-output boundary explicit.",
  appliesTo: "global",
};

try {
  await mkdir(layerPath, { recursive: true });
  await mkdir(rulesPath, { recursive: true });
  await writeFile(
    path.join(projectRoot, "skill-central.yaml"),
    `layers:
  - id: 02-workflows
    name: 02-workflows
    path: ${layerPath}
    scope: workspace
    priority: 20
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private
`,
    "utf8",
  );

  const engine = new SkillEngine();
  await engine.reload(config.layers, { projectRoot });
  const service = new ReverseOutputService({ config, projectRoot, engine });
  const execute = (input) => service.execute({
    placement: input.assetType === "rule" ? "covenant-rule" : "skill",
    placementReason: "Fixture explicitly records the Skill Central boundary decision.",
    ...input,
  });

  const preview = await execute({
    action: "preview",
    assetType: "skill",
    operation: "create",
    source: "ide:codex",
    context: "CI found a reusable review pattern.",
    target: "02-workflows",
    asset: skillAsset,
    appStateDir,
  });
  assert.equal(preview.status, "preview");
  assert.equal(preview.proposal?.canApply, true);
  assert(preview.proposal?.checks.some((check) => check.id === "schema" && check.status === "passed"));
  assert(preview.proposal?.checks.some((check) => check.id === "placement-boundary" && check.status === "passed"));
  assert(preview.proposal?.diffPreview.includes("+ id: reverse-ci-skill"));

  const skillPath = path.join(layerPath, "reverse-ci-skill.yaml");
  await assert.rejects(stat(skillPath), { code: "ENOENT" });

  const { appliesTo: _missingScope, ...skillWithoutScope } = skillAsset;
  await assert.rejects(
    execute({
      action: "preview",
      assetType: "skill",
      operation: "create",
      source: "ide:codex",
      context: "Scope omission must be explicit.",
      target: "02-workflows",
      asset: skillWithoutScope,
      appStateDir,
    }),
    /asset\.appliesTo is required/,
  );

  await assert.rejects(
    execute({
      action: "preview",
      assetType: "skill",
      operation: "create",
      source: "ide:codex",
      context: "Schema version must be explicit.",
      target: "02-workflows",
      asset: {
        ...skillAsset,
        id: "reverse-invalid-schema",
        schemaVersion: "skillcentral.dev/unknown/v1",
      },
      appStateDir,
    }),
    /reverse output skills require skillcentral\.dev\/v1/,
  );

  await assert.rejects(
    execute({
      action: "preview",
      assetType: "rule",
      operation: "create",
      source: "ide:claude",
      context: "IDE-native rules must stay in the IDE environment.",
      target: ".rules/00-governance",
      placement: "ide-native-rule",
      placementReason: "This is a local bootloader instruction.",
      asset: ruleAsset,
      appStateDir,
    }),
    /IDE-native rules cannot be promoted/,
  );

  const promoted = await execute({
    action: "apply",
    assetType: "skill",
    operation: "create",
    source: "ide:codex",
    context: "CI found a reusable review pattern.",
    target: "02-workflows",
    asset: skillAsset,
    decision: "promote",
    appStateDir,
  });
  assert.equal(promoted.status, "applied");
  assert.equal(promoted.verification?.status, "verified");
  assert.equal(engine.getSkill("reverse-ci-skill")?.id, "reverse-ci-skill");
  assert(promoted.auditPath);
  assert.equal(JSON.parse(await readFile(promoted.auditPath, "utf8")).status, "applied");

  const duplicate = await execute({
    action: "preview",
    assetType: "skill",
    operation: "create",
    source: "ide:codex",
    context: "Duplicate candidate.",
    target: "02-workflows",
    asset: skillAsset,
    appStateDir,
  });
  assert.equal(duplicate.status, "blocked");
  assert.equal(duplicate.proposal?.canApply, false);
  assert(duplicate.proposal?.checks.some((check) =>
    check.id === "duplicate-conflict" && check.status === "failed"));

  const oldSkillRaw = await readFile(skillPath, "utf8");
  const oldSkillSha = sha256(oldSkillRaw);
  const updatedSkill = {
    ...skillAsset,
    prompt: "Preserve the updated reusable CI lesson.",
  };
  const updated = await execute({
    action: "apply",
    assetType: "skill",
    operation: "update",
    source: "ide:codex",
    context: "The same lesson was refined after another review.",
    target: "02-workflows",
    asset: updatedSkill,
    expectedSha256: oldSkillSha,
    decision: "promote",
    appStateDir,
  });
  assert.equal(updated.status, "applied");
  assert(updated.backupPath);
  assert.equal(await readFile(updated.backupPath, "utf8"), oldSkillRaw);
  const updatedRaw = await readFile(skillPath, "utf8");
  assert.match(updatedRaw, /updated reusable CI lesson/);

  await assert.rejects(
    execute({
      action: "rollback",
      targetPath: skillPath,
      backupPath: updated.backupPath,
      appStateDir,
    }),
    /expectedSha256 is required/,
  );
  await assert.rejects(
    execute({
      action: "rollback",
      targetPath: skillPath,
      backupPath: updated.backupPath,
      expectedSha256: "0".repeat(64),
      appStateDir,
    }),
    /sha256 conflict/,
  );

  const rolledBack = await execute({
    action: "rollback",
    targetPath: skillPath,
    backupPath: updated.backupPath,
    expectedSha256: sha256(updatedRaw),
    appStateDir,
  });
  assert.equal(rolledBack.status, "rolled-back");
  assert.equal(await readFile(skillPath, "utf8"), oldSkillRaw);
  assert(rolledBack.auditPath);

  const wrongShaUpdate = await execute({
    action: "apply",
    assetType: "skill",
    operation: "update",
    source: "ide:codex",
    context: "Concurrent update must be rejected.",
    target: "02-workflows",
    asset: updatedSkill,
    expectedSha256: "0".repeat(64),
    decision: "promote",
    appStateDir,
  });
  assert.equal(wrongShaUpdate.status, "blocked");
  assert.equal(wrongShaUpdate.verification, undefined);
  assert(wrongShaUpdate.auditPath);
  assert.equal(await readFile(skillPath, "utf8"), oldSkillRaw);

  const rulePromoted = await execute({
    action: "apply",
    assetType: "rule",
    operation: "create",
    source: "ide:claude",
    context: "The session produced a reusable project covenant.",
    target: ".rules/00-governance",
    asset: ruleAsset,
    decision: "promote",
    appStateDir,
  });
  assert.equal(rulePromoted.status, "applied");
  assert.equal(rulePromoted.verification?.status, "verified");
  assert.equal(await readFile(path.join(rulesPath, "reverse-ci-rule.yaml"), "utf8").then((raw) => raw.includes("reverse-ci-rule")), true);

  const invalidRule = await execute({
    action: "preview",
    assetType: "rule",
    operation: "create",
    source: "ide:claude",
    context: "Invalid rule schema must be blocked.",
    target: ".rules/00-governance",
    asset: {
      ...ruleAsset,
      id: "reverse-invalid-rule",
      body: 42,
    },
    appStateDir,
  });
  assert.equal(invalidRule.status, "blocked");
  assert.equal(invalidRule.proposal?.canApply, false);
  assert(invalidRule.proposal?.checks.some((check) =>
    check.id === "schema" && check.status === "failed"));

  const traversal = await execute({
    action: "preview",
    assetType: "rule",
    operation: "create",
    source: "ide:claude",
    context: "Rule targets must remain under .rules.",
    target: ".rules/../outside",
    asset: {
      ...ruleAsset,
      id: "reverse-traversal-rule",
    },
    appStateDir,
  });
  assert.equal(traversal.status, "blocked");
  assert.equal(traversal.proposal?.canApply, false);
  assert(traversal.proposal?.checks.some((check) =>
    check.id === "target" && check.status === "failed"));

  const deferred = await execute({
    action: "apply",
    assetType: "skill",
    operation: "create",
    source: "ide:codex",
    context: "Candidate needs more evidence.",
    target: "02-workflows",
    asset: {
      ...skillAsset,
      id: "reverse-deferred-skill",
    },
    decision: "defer",
    appStateDir,
  });
  assert.equal(deferred.status, "recorded");
  assert(deferred.auditPath);
  await assert.rejects(stat(path.join(layerPath, "reverse-deferred-skill.yaml")), { code: "ENOENT" });

  const discarded = await execute({
    action: "apply",
    assetType: "skill",
    operation: "create",
    source: "ide:codex",
    context: "Candidate is intentionally discarded.",
    target: "02-workflows",
    asset: {
      ...skillAsset,
      id: "reverse-discarded-skill",
    },
    decision: "discard",
    appStateDir,
  });
  assert.equal(discarded.status, "recorded");
  assert.equal(discarded.decision, "discard");
  assert(discarded.auditPath);
  await assert.rejects(stat(path.join(layerPath, "reverse-discarded-skill.yaml")), { code: "ENOENT" });

  const cliAssetPath = path.join(root, "cli-skill.yaml");
  await writeFile(cliAssetPath, `${yamlSkill("reverse-cli-skill")}\n`, "utf8");
  const cli = await execFileAsync(process.execPath, [
    path.resolve("dist/index.js"),
    "reverse-output",
    "preview",
    "--asset-type",
    "skill",
    "--operation",
    "create",
    "--source",
    "ide:codex",
    "--context",
    "CLI preview",
    "--target",
    "02-workflows",
    "--placement",
    "skill",
    "--placement-reason",
    "CLI fixture is a reusable Skill candidate.",
    "--asset-file",
    cliAssetPath,
    "--project-root",
    projectRoot,
    "--json",
  ], { cwd: process.cwd(), encoding: "utf8", env: projectEnvironment });
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.status, "preview");
  assert.equal(cliResult.proposal.assetId, "reverse-cli-skill");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("dist/index.js"), "mcp"],
    cwd: projectRoot,
    env: projectEnvironment,
    stderr: "pipe",
  });
  const client = new Client(
    { name: "skill-central-reverse-output-ci", version: "0.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert(tools.tools.some((tool) => tool.name === "reverse_output"));

    const mcpPreview = await client.callTool({
      name: "reverse_output",
      arguments: {
        action: "preview",
        assetType: "skill",
        operation: "create",
        source: "ide:codex",
        context: "MCP candidate",
        target: "02-workflows",
        placement: "skill",
        placementReason: "MCP fixture is a reusable Skill candidate.",
        asset: {
          ...skillAsset,
          id: "reverse-mcp-skill",
        },
        appStateDir,
      },
    });
    const mcpBody = JSON.parse(mcpPreview.content[0].text);
    assert.equal(mcpBody.status, "preview");
    assert.equal(mcpBody.proposal.assetId, "reverse-mcp-skill");

    const mcpApply = await client.callTool({
      name: "reverse_output",
      arguments: {
        action: "apply",
        assetType: "skill",
        operation: "create",
        source: "ide:codex",
        context: "MCP candidate",
        target: "02-workflows",
        placement: "skill",
        placementReason: "MCP fixture is a reusable Skill candidate.",
        asset: {
          ...skillAsset,
          id: "reverse-mcp-skill",
        },
        decision: "promote",
        appStateDir,
      },
    });
    const mcpApplyBody = JSON.parse(mcpApply.content[0].text);
    assert.equal(mcpApplyBody.status, "applied");
  } catch (err) {
    console.error("MCP reverse-output test failed:", err);
    throw err;
  } finally {
    const closed = await Promise.race([
      client.close().then(() => true).catch(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    if (!closed) {
      console.error("MCP reverse-output client close timed out");
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("reverse output preview/apply/defer/update/rollback/CLI/MCP matrix passed");

function yamlSkill(id) {
  return `schemaVersion: skillcentral.dev/v1
id: ${id}
name: Reverse CLI Skill
description: CLI reverse output fixture
type: prompt
prompt: CLI reverse output
appliesTo: global`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
