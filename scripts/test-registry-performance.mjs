#!/usr/bin/env node
// ============================================================================
// Registry Query Performance Fixture
// ----------------------------------------------------------------------------
// Generates 1000 temporary local Universal Skill v1 files, loads them through
// the real storage/engine path, then measures registry query latency.
//
// Design intent:
// - Measure query performance separately from file discovery and YAML parsing;
//   Phase 1's latency target is about Registry queries over already-loaded
//   local skills, not install-time disk IO.
// - Use real on-disk skill files before measurement so the fixture still proves
//   the schema/parser/engine pipeline can handle the 1000-skill shape.
// - Keep all generated files under the OS temp directory and always clean up.
// ============================================================================

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { SkillEngine } from "../dist/core/engine.js";

const SKILL_COUNT = 1000;
const MAX_QUERY_MS = 200;

const root = await mkdtemp(path.join(tmpdir(), "skill-central-registry-perf-"));

try {
  const layerPath = path.join(root, "skills");
  await mkdir(layerPath, { recursive: true });
  await generateSkills(layerPath);

  const engine = new SkillEngine();
  await engine.reload([
    {
      id: "perf",
      name: "Performance",
      path: layerPath,
      scope: "workspace",
      priority: 50,
      writable: false,
      trust: "local",
      sync: { enabled: false },
      visibility: "private",
    },
  ]);

  const loaded = engine.querySkills({ status: "any" }).totalCandidates;
  if (loaded !== SKILL_COUNT) {
    throw new Error(`expected ${SKILL_COUNT} loaded candidates, got ${loaded}`);
  }

  const results = [
    measure("id", () => engine.querySkills({ id: "perf-skill-0999" })),
    measure("type", () => engine.querySkills({ type: "workflow" })),
    measure("tag", () => engine.querySkills({ tags: ["perf-tag-7"] })),
    measure("intent", () => engine.querySkills({ intent: "perf-intent-9" })),
  measure("capability", () => engine.querySkills({ capabilities: ["perf.capability.c11"] })),
    measure("status-any", () => engine.querySkills({ status: "any" })),
  ];

  for (const result of results) {
    if (result.elapsedMs > MAX_QUERY_MS) {
      throw new Error(
        `${result.name} query took ${result.elapsedMs.toFixed(2)}ms; expected <= ${MAX_QUERY_MS}ms`,
      );
    }
  }

  console.log(
    results
      .map((result) => `${result.name}=${result.elapsedMs.toFixed(2)}ms/${result.count}`)
      .join(" "),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

async function generateSkills(layerPath) {
  const writes = [];
  for (let i = 0; i < SKILL_COUNT; i++) {
    const id = `perf-skill-${String(i).padStart(4, "0")}`;
    const type = typeFor(i);
    writes.push(writeFile(path.join(layerPath, `${id}.yaml`), skillYaml(id, type, i), "utf-8"));
  }
  await Promise.all(writes);
}

function measure(name, run) {
  const start = performance.now();
  const result = run();
  const elapsedMs = performance.now() - start;
  return { name, elapsedMs, count: result.totalCandidates };
}

function typeFor(index) {
  const types = ["prompt", "tool", "workflow", "policy", "context-router"];
  return types[index % types.length];
}

function skillYaml(id, type, index) {
  const capability = `perf.capability.c${index % 20}`;
  const intent = `perf-intent-${index % 20}`;
  const tag = `perf-tag-${index % 20}`;
  const inputBlock = type === "tool"
    ? [
        "inputSchema:",
        "  type: object",
        "  properties:",
        "    value:",
        "      type: string",
      ].join("\n")
    : "";

  return [
    "schemaVersion: skillcentral.dev/v1",
    `id: ${id}`,
    `name: ${id}`,
    "description: Registry performance fixture skill",
    `type: ${type}`,
    `tags: [perf, ${tag}]`,
    "activation:",
    `  intents: [${intent}]`,
    "capabilities:",
    `  required: [${capability}]`,
    inputBlock,
    "prompt:",
    "  role: user",
    `  template: \"Fixture prompt ${index}\"`,
    "",
  ].filter(Boolean).join("\n");
}
