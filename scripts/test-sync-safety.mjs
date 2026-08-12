#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ensureAppState } from "../dist/local-store/app-state.js";
import { resolveRegistryRoot } from "../dist/sync/scanner.js";
import { buildSyncPlan, SyncPlanValidationError } from "../dist/sync/sync-engine.js";
import { applySyncPlan, SyncApplyBlockedError } from "../dist/sync/sync-apply.js";

const fixture = await mkdtemp(path.join(tmpdir(), "skill-central-sync-safety-"));
const localRoot = path.join(fixture, "local");
const localNested = path.join(localRoot, "nested");
const registryRoot = path.join(fixture, "registry");
const appStateRoot = path.join(fixture, "app-state");
const localFile = path.join(localNested, "preserved.yaml");

const layer = (id, layerPath, enabled = true) => ({
  id,
  name: id,
  path: layerPath,
  scope: "user",
  priority: 10,
  writable: true,
  trust: "local",
  sync: { enabled },
  visibility: "private",
});

try {
  await mkdir(localNested, { recursive: true });
  await mkdir(registryRoot, { recursive: true });
  await writeFile(localFile, "id: preserved\nname: Preserved\ndescription: local only\ntype: prompt\nprompt: keep\n", "utf8");

  assert.equal(resolveRegistryRoot("~", path.join(fixture, "home")), path.join(fixture, "home"));
  assert.equal(resolveRegistryRoot("~/registry", path.join(fixture, "home")), path.join(fixture, "home", "registry"));
  assert.throws(() => resolveRegistryRoot("/~/.skill-central"), /invalid registry path/);
  await assert.rejects(
    buildSyncPlan({ direction: "pull", registryDir: "/~/.skill-central", layers: [layer("local", localRoot)] }),
    (err) => err instanceof SyncPlanValidationError && /registry directory is invalid/.test(err.message),
  );

  await assert.rejects(
    buildSyncPlan({ direction: "pull", registryDir: registryRoot, layers: [layer("local", localRoot)] }),
    (err) => err instanceof SyncPlanValidationError && /manifest is invalid/.test(err.message),
  );
  await access(localFile);

  await writeFile(path.join(registryRoot, "manifest.yaml"), `schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: fixture
defaults:
  visibility: private
  syncMode: pull
layers:
  - id: local
    path: ../outside
    scope: user
    sync:
      enabled: true
    visibility: private
`, "utf8");
  await assert.rejects(
    buildSyncPlan({ direction: "pull", registryDir: registryRoot, layers: [layer("local", localRoot)] }),
    (err) => err instanceof SyncPlanValidationError && /manifest is invalid/.test(err.message),
  );
  await access(localFile);

  await writeFile(path.join(registryRoot, "manifest.yaml"), `schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: fixture
defaults:
  visibility: private
  syncMode: pull
layers:
  - id: local
    path: layers/local
    scope: user
    sync:
      enabled: true
    visibility: private
`, "utf8");
  await mkdir(path.join(registryRoot, "layers", "local"), { recursive: true });

  await assert.rejects(
    buildSyncPlan({
      direction: "pull",
      registryDir: registryRoot,
      layers: [layer("parent", localRoot), layer("child", localNested, false)],
    }),
    (err) => err instanceof SyncPlanValidationError && /layers overlap/.test(err.message),
  );
  await access(localFile);

  const plan = await buildSyncPlan({
    direction: "pull",
    registryDir: registryRoot,
    layers: [layer("local", localRoot)],
  });
  const retained = plan.operations.find((operation) => operation.relativePath === "nested/preserved.yaml");
  assert.equal(retained?.status, "noop");
  assert.match(retained?.reason ?? "", /not deletion evidence/);

  const appState = await ensureAppState({ overrideDir: appStateRoot });
  const legacyDeletePlan = {
    ...plan,
    operations: [{
      status: "delete-local",
      layerId: "local",
      relativePath: "nested/preserved.yaml",
      localPath: localFile,
      reason: "legacy missing-side inference",
    }],
  };
  await assert.rejects(
    applySyncPlan(legacyDeletePlan, { appState, force: true }),
    (err) => err instanceof SyncApplyBlockedError
      && err.report.preflightBlocked
      && err.report.operations[0]?.applyStatus === "blocked",
  );
  await access(localFile);

  console.log("Sync safety contract passed: invalid registries and inferred deletes perform zero asset writes.");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
