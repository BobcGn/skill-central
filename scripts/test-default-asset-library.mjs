#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SkillEngine } from "../dist/core/engine.js";
import { RuleEngine } from "../dist/core/rule-engine.js";
import {
  DEFAULT_ASSET_LIBRARY_ROOT_ENV,
  resolveAssetLibrary,
  saveCustomAssetLibrary,
  clearCustomAssetLibrary,
} from "../dist/storage/asset-library.js";
import { loadConfig } from "../dist/storage/config.js";

const fixture = await mkdtemp(path.join(tmpdir(), "skill-central-default-library-"));
const projectRoot = path.join(fixture, "workspace");
const homeDir = path.join(fixture, "home");
const defaultRoot = path.join(homeDir, ".skill-central");
const settingsPath = path.join(fixture, "settings.json");

try {
  await mkdir(projectRoot, { recursive: true });
  const environment = { ...process.env };
  delete environment.SKILL_CENTRAL_ASSET_ROOT;
  delete environment[DEFAULT_ASSET_LIBRARY_ROOT_ENV];

  const initial = resolveAssetLibrary(projectRoot, { environment, homeDir, settingsPath });
  assert.equal(initial.mode, "default");
  assert.equal(initial.rootDir, defaultRoot);
  assert.equal(initial.skillsDir, path.join(defaultRoot, "skills"));
  assert.equal(initial.rulesDir, path.join(defaultRoot, "rules"));
  assert.equal(existsSync(initial.skillsDir), true, "startup must create the default skills directory");
  assert.equal(existsSync(initial.rulesDir), true, "startup must create the default rules directory");

  const configuredProjectRoot = path.join(fixture, "configured-workspace");
  const configuredHomeDir = path.join(fixture, "configured-home");
  await mkdir(configuredProjectRoot, { recursive: true });
  await writeFile(path.join(configuredProjectRoot, "skill-central.yaml"), "layers: []\n", "utf-8");
  const configured = resolveAssetLibrary(configuredProjectRoot, {
    environment,
    homeDir: configuredHomeDir,
    settingsPath: path.join(fixture, "configured-settings.json"),
  });
  assert.equal(configured.mode, "project");
  assert.equal(
    existsSync(path.join(configuredHomeDir, ".skill-central", "skills")),
    true,
    "project override startup must still initialize the default skills directory",
  );
  assert.equal(
    existsSync(path.join(configuredHomeDir, ".skill-central", "rules")),
    true,
    "project override startup must still initialize the default rules directory",
  );

  const nestedSkillDir = path.join(initial.skillsDir, "02-workflows", "deep", "nested");
  const nestedRuleDir = path.join(initial.rulesDir, "01-global", "deep", "nested");
  await mkdir(nestedSkillDir, { recursive: true });
  await mkdir(nestedRuleDir, { recursive: true });
  await writeFile(path.join(nestedSkillDir, "default-skill.yaml"), `schemaVersion: skillcentral.dev/v1
id: default-skill
name: Default Skill
description: Loaded from the default home asset library
type: prompt
prompt: default home source
`, "utf-8");
  await writeFile(path.join(initial.skillsDir, "history.yaml.bak.2026-08-11"), "not a live skill\n", "utf-8");
  await writeFile(path.join(nestedRuleDir, "default-rule.yaml"), `schemaVersion: skillcentral.dev/rule/v1
id: default-rule
name: Default Rule
description: Loaded from the default home rule library
body: Always use the selected asset root.
`, "utf-8");

  const config = loadConfig(projectRoot, { environment, homeDir, settingsPath });
  assert.equal(config.assetLibrary.mode, "default");
  assert.equal(config.layers.length, 1);
  assert.equal(config.layers[0].path, initial.skillsDir);
  const skillEngine = new SkillEngine();
  await skillEngine.reload(config.layers, { projectRoot, scopeContext: { projectIds: [] } });
  assert.deepEqual(skillEngine.listSkills().map((skill) => skill.id), ["default-skill"]);

  const previousDefaultRoot = process.env[DEFAULT_ASSET_LIBRARY_ROOT_ENV];
  const previousAssetRoot = process.env.SKILL_CENTRAL_ASSET_ROOT;
  process.env[DEFAULT_ASSET_LIBRARY_ROOT_ENV] = defaultRoot;
  process.env.SKILL_CENTRAL_ASSET_ROOT = defaultRoot;
  try {
    const ruleEngine = new RuleEngine();
    await ruleEngine.reload({ projectRoot, scopeContext: { projectIds: [] } });
    assert.deepEqual(ruleEngine.queryRules().map((rule) => rule.id), ["default-rule"]);
  } finally {
    if (previousDefaultRoot === undefined) delete process.env[DEFAULT_ASSET_LIBRARY_ROOT_ENV];
    else process.env[DEFAULT_ASSET_LIBRARY_ROOT_ENV] = previousDefaultRoot;
    if (previousAssetRoot === undefined) delete process.env.SKILL_CENTRAL_ASSET_ROOT;
    else process.env.SKILL_CENTRAL_ASSET_ROOT = previousAssetRoot;
  }

  const mcpEnvironment = {
    ...process.env,
    [DEFAULT_ASSET_LIBRARY_ROOT_ENV]: defaultRoot,
    SKILL_CENTRAL_SETTINGS_PATH: settingsPath,
    SKILL_CENTRAL_PROJECT_ROOT: projectRoot,
  };
  delete mcpEnvironment.SKILL_CENTRAL_ASSET_ROOT;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js", "mcp"],
    cwd: process.cwd(),
    env: mcpEnvironment,
    stderr: "pipe",
  });
  const client = new Client(
    { name: "default-asset-library-ci", version: "0.0.0" },
    { capabilities: {} },
  );
  try {
    await client.connect(transport);
    const resources = await client.listResources();
    const resourceUris = resources.resources.map((resource) => resource.uri);
    assert.equal(resourceUris.includes("skill://skill/default-skill"), true);
    assert.equal(resourceUris.includes("rule://rule/default-rule"), true);
  } finally {
    await client.close();
  }

  const customRoot = path.join(fixture, "custom-library");
  await mkdir(path.join(customRoot, "skills"), { recursive: true });
  await mkdir(path.join(customRoot, "rules"), { recursive: true });
  await saveCustomAssetLibrary(customRoot, { environment, homeDir, settingsPath });
  const custom = resolveAssetLibrary(projectRoot, { environment, homeDir, settingsPath });
  assert.equal(custom.mode, "custom");
  assert.equal(custom.rootDir, customRoot);

  await clearCustomAssetLibrary({ environment, homeDir, settingsPath });
  const restored = resolveAssetLibrary(projectRoot, { environment, homeDir, settingsPath });
  assert.equal(restored.mode, "default");
  assert.equal(restored.rootDir, defaultRoot);

  const overriddenRoot = path.join(fixture, "overridden-default");
  const overridden = resolveAssetLibrary(projectRoot, {
    environment: { ...environment, [DEFAULT_ASSET_LIBRARY_ROOT_ENV]: overriddenRoot },
    homeDir,
    settingsPath: path.join(fixture, "missing-settings.json"),
  });
  assert.equal(overridden.rootDir, overriddenRoot);
  assert.equal(existsSync(path.join(overriddenRoot, "skills")), true);
  assert.equal(existsSync(path.join(overriddenRoot, "rules")), true);

  console.log("Default asset library contract passed.");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
