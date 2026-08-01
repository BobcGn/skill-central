// Integration coverage for the shared Rule/Skill applicability contract.
// Every fixture lives under one temporary root so the suite never edits the
// repository's real .skills/, .rules/, or project configuration.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { SkillEngine } from "../dist/core/engine.js";
import { createBoardApp } from "../dist/web/server.js";
import {
  assetAppliesTo,
  normaliseAssetScope,
  normaliseProjectId,
  validateAssetScope,
} from "../dist/schema/asset-scope.js";
import { validateUniversalSkillObject } from "../dist/schema/universal-skill.js";
import { queryRules } from "../dist/registry/rule-query.js";
import {
  readAssetScopeFile,
  updateAssetScopeFile,
} from "../dist/storage/asset-scope-editor.js";
import {
  projectIdFromGitRemote,
  resolveProjectIdentity,
} from "../dist/storage/project-identity.js";
import { parseRuleFile } from "../dist/storage/rule-reader.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "skill-central-scope-"));

try {
  const ids = {
    one: "git:github.com/acme/one",
    two: "git:github.com/acme/two",
    three: "git:github.com/acme/three",
  };

  assert.equal(projectIdFromGitRemote("git@github.com:Acme/One.git"), ids.one);
  assert.equal(projectIdFromGitRemote("https://github.com/acme/one.git"), ids.one);
  assert.equal(projectIdFromGitRemote("ssh://git@github.com/acme/one.git"), ids.one);
  assert.deepEqual(normaliseAssetScope({ projects: ["git:GitHub.com/Acme/One"] }), {
    projects: [ids.one],
  });

  // Identity coverage verifies URL normalisation and the portable-git/local-
  // path alias pair used during scope matching.
  const repo = path.join(root, "repo");
  await execFileAsync("git", ["init", repo]);
  await execFileAsync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:acme/one.git"]);
  const identity = await resolveProjectIdentity(repo);
  assert.equal(identity.id, ids.one);
  assert.equal(identity.source, "git");
  assert(identity.aliases.includes(normaliseProjectId(`path:${identity.root}`)));
  if (path.sep === "/") {
    assert(!identity.aliases.some((id) => id.startsWith("path:\\")));
  }

  assert.deepEqual(normaliseAssetScope(undefined), "global");
  assert.deepEqual(normaliseAssetScope({ projects: [ids.two, ids.one] }), {
    projects: [ids.one, ids.two],
  });
  assert.equal(assetAppliesTo("global", { projectIds: [ids.three] }), true);
  assert.equal(assetAppliesTo({ projects: [ids.one] }, { projectIds: [ids.one] }), true);
  assert.equal(assetAppliesTo({ projects: [ids.one, ids.two] }, { projectIds: [ids.two] }), true);
  assert.equal(assetAppliesTo({ projects: [ids.one, ids.two] }, { projectIds: [ids.three] }), false);
  assert(validateAssetScope({ projects: [] }).some((issue) => issue.fieldPath === "appliesTo.projects"));
  assert(validateAssetScope({ projects: [ids.one, ids.one] }).some((issue) => issue.reason.includes("duplicate")));
  assert(validateAssetScope({ projects: ["repo-name"] }).some((issue) => issue.fieldPath === "appliesTo.projects[0]"));
  assert(validateAssetScope({ projects: [ids.one], ignored: true }).some((issue) => issue.fieldPath === "appliesTo.ignored"));

  const invalidSkill = validateUniversalSkillObject({
    schemaVersion: "skillcentral.dev/v1",
    id: "invalid-scope",
    name: "Invalid scope",
    description: "Invalid scope fixture",
    type: "prompt",
    prompt: "body",
    appliesTo: { projects: ["not-a-project-id"] },
  }, "invalid-scope.yaml");
  assert.equal(invalidSkill.ok, false);
  assert(invalidSkill.issues.some((issue) => issue.fieldPath === "appliesTo.projects[0]"));

  // Engine coverage proves filtering runs before override/query consumers see
  // the registry, including waitForReady callers.
  const skillDir = path.join(root, "skills");
  await execFileAsync("mkdir", ["-p", skillDir]);
  const skillFiles = [
    ["global", "global"],
    ["one", { projects: [ids.one] }],
    ["both", { projects: [ids.one, ids.two] }],
  ];
  for (const [id, appliesTo] of skillFiles) {
    await writeFile(path.join(skillDir, `${id}.json`), JSON.stringify({
      schemaVersion: "skillcentral.dev/v1",
      id,
      name: id,
      description: `${id} fixture`,
      type: "prompt",
      prompt: `${id} body`,
      appliesTo,
    }, null, 2));
  }
  const layer = {
    id: "scope-test",
    name: "scope-test",
    path: skillDir,
    scope: "workspace",
    priority: 10,
    writable: true,
    trust: "local",
    sync: { enabled: false },
    visibility: "private",
  };
  const engine = new SkillEngine();
  await engine.reload([layer], { projectId: ids.one });
  assert.deepEqual(engine.listSkills().map((skill) => skill.id).sort(), ["both", "global", "one"]);
  await engine.reload([layer], { projectId: ids.two });
  assert.deepEqual(engine.listSkills().map((skill) => skill.id).sort(), ["both", "global"]);
  await engine.reload([layer], { projectId: ids.three });
  assert.deepEqual(engine.listSkills().map((skill) => skill.id), ["global"]);
  const readinessEngine = new SkillEngine();
  const reloadPromise = readinessEngine.reload([layer], { projectId: ids.one });
  await readinessEngine.waitForReady();
  assert.equal(readinessEngine.listSkills().length, 3);
  await reloadPromise;

  const ruleFile = path.join(root, "rule.yaml");
  await writeFile(ruleFile, `schemaVersion: skillcentral.dev/rule/v1
id: scope-rule
name: Scope rule
description: Scope rule fixture
body: Scoped rule body
appliesTo:
  projects:
    - ${ids.one}
    - ${ids.two}
`);
  const rule = await parseRuleFile(ruleFile);
  assert(rule);
  assert.equal(queryRules([rule], { scopeContext: { projectIds: [ids.two] } }).length, 1);
  assert.equal(queryRules([rule], { scopeContext: { projectIds: [ids.three] } }).length, 0);

  // Mutation coverage exercises both optimistic concurrency checks and both
  // serialisation formats without touching the source workspace.
  const before = await readAssetScopeFile(ruleFile);
  const afterGlobal = await updateAssetScopeFile(ruleFile, "global", { expectedSha256: before.sha256 });
  assert.equal(afterGlobal.appliesTo, "global");
  assert.match(await readFile(ruleFile, "utf8"), /appliesTo: global/);
  await assert.rejects(
    updateAssetScopeFile(ruleFile, { projects: [ids.one] }, { expectedSha256: before.sha256 }),
    /sha256 conflict/,
  );
  const afterProjects = await updateAssetScopeFile(ruleFile, { projects: [ids.one, ids.two] }, {
    expectedSha256: afterGlobal.sha256,
  });
  assert.deepEqual((await readAssetScopeFile(ruleFile)).appliesTo, afterProjects.appliesTo);

  const legacySkillFile = path.join(root, "legacy-skill.yaml");
  await writeFile(legacySkillFile, `id: legacy-scope
name: Legacy scope
description: Legacy scope fixture
type: prompt
prompt: Legacy body
`);
  const legacyBefore = await readAssetScopeFile(legacySkillFile);
  assert.equal(legacyBefore.assetType, "skill");
  assert.equal(legacyBefore.appliesTo, "global");
  const legacyAfter = await updateAssetScopeFile(legacySkillFile, { projects: [ids.one] }, {
    expectedSha256: legacyBefore.sha256,
  });
  assert.deepEqual(legacyAfter.appliesTo, { projects: [ids.one] });

  const jsonSkillFile = path.join(root, "json-skill.json");
  await writeFile(jsonSkillFile, JSON.stringify({
    schemaVersion: "skillcentral.dev/v1",
    id: "json-scope",
    name: "JSON scope",
    description: "JSON scope fixture",
    type: "prompt",
    prompt: "JSON body",
  }, null, 2));
  const jsonBefore = await readAssetScopeFile(jsonSkillFile);
  await updateAssetScopeFile(jsonSkillFile, { projects: [ids.two] }, {
    expectedSha256: jsonBefore.sha256,
  });
  assert.deepEqual(JSON.parse(await readFile(jsonSkillFile, "utf8")).appliesTo, { projects: [ids.two] });

  // Finally exercise public CLI surfaces against an isolated workspace so
  // command wiring cannot drift from the lower-level contract tests.
  const cliOutput = await execFileAsync(process.execPath, [
    path.resolve("dist/index.js"),
    "scope",
    "show",
    ruleFile,
    "--json",
  ], { cwd: process.cwd(), encoding: "utf8" });
  const cliAsset = JSON.parse(cliOutput.stdout);
  assert.equal(cliAsset.assetId, "scope-rule");
  assert.deepEqual(cliAsset.appliesTo, { projects: [ids.one, ids.two] });

  await execFileAsync(process.execPath, [
    path.resolve("dist/index.js"),
    "scope",
    "set",
    legacySkillFile,
    "--global",
    "--expected-sha256",
    legacyAfter.sha256,
    "--json",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal((await readAssetScopeFile(legacySkillFile)).appliesTo, "global");

  const cliWorkspace = path.join(root, "cli-workspace");
  const cliSkills = path.join(cliWorkspace, ".skills", "scope");
  const cliRules = path.join(cliWorkspace, ".rules");
  await execFileAsync("mkdir", ["-p", cliSkills, cliRules]);
  await writeFile(path.join(cliWorkspace, "skill-central.yaml"), `layers:
  - id: scope
    name: scope
    path: .skills/scope
    scope: workspace
    priority: 10
    writable: true
    trust: local
    visibility: private
    sync:
      enabled: false
`);
  await writeFile(path.join(cliSkills, "one.yaml"), `schemaVersion: skillcentral.dev/v1
id: cli-skill-one
name: CLI skill one
description: CLI scope fixture
type: prompt
prompt: CLI body
appliesTo:
  projects:
    - ${ids.one}
`);
  await writeFile(path.join(cliRules, "one.yaml"), `schemaVersion: skillcentral.dev/rule/v1
id: cli-rule-one
name: CLI rule one
description: CLI scope fixture
body: CLI rule body
appliesTo:
  projects:
    - ${ids.one}
`);
  const cliEntrypoint = path.resolve("dist/index.js");
  const matchingSkills = await execFileAsync(process.execPath, [cliEntrypoint, "list", "--project-id", ids.one], {
    cwd: cliWorkspace,
    encoding: "utf8",
  });
  const hiddenSkills = await execFileAsync(process.execPath, [cliEntrypoint, "list", "--project-id", ids.two], {
    cwd: cliWorkspace,
    encoding: "utf8",
  });
  assert.match(matchingSkills.stdout, /cli-skill-one/);
  assert.doesNotMatch(hiddenSkills.stdout, /cli-skill-one/);
  const matchingRules = await execFileAsync(process.execPath, [
    cliEntrypoint, "rules", "--dir", ".rules", "--project-id", ids.one,
  ], { cwd: cliWorkspace, encoding: "utf8" });
  const hiddenRules = await execFileAsync(process.execPath, [
    cliEntrypoint, "rules", "--dir", ".rules", "--project-id", ids.two,
  ], { cwd: cliWorkspace, encoding: "utf8" });
  assert.match(matchingRules.stdout, /cli-rule-one/);
  assert.doesNotMatch(hiddenRules.stdout, /cli-rule-one/);

  // Board coverage treats the scope index as a management view: assets remain
  // discoverable and editable after their runtime scope excludes this project.
  const boardLayerLowDir = path.join(repo, "board-skills-low");
  const boardLayerHighDir = path.join(repo, "board-skills-high");
  const boardRulesDir = path.join(repo, "board-rules");
  await Promise.all([
    mkdir(path.join(boardLayerLowDir, "nested"), { recursive: true }),
    mkdir(boardLayerHighDir, { recursive: true }),
    mkdir(path.join(boardRulesDir, "nested"), { recursive: true }),
  ]);
  const recoverSkillFile = path.join(boardLayerLowDir, "nested", "recover-source.yml");
  const duplicateLowFile = path.join(boardLayerLowDir, "nested", "duplicate-low.yml");
  const duplicateHighFile = path.join(boardLayerHighDir, "duplicate-high.json");
  const boardRuleFile = path.join(boardRulesDir, "nested", "rule-source.json");
  await writeFile(recoverSkillFile, `schemaVersion: skillcentral.dev/v1
id: board-recover
name: Board recover
description: Board recovery fixture
type: prompt
prompt: Board recovery body
appliesTo:
  projects:
    - ${ids.one}
`);
  await writeFile(duplicateLowFile, `schemaVersion: skillcentral.dev/v1
id: board-duplicate
name: Board duplicate low
description: Lower layer source fixture
type: prompt
prompt: Lower layer body
appliesTo: global
`);
  await writeFile(duplicateHighFile, JSON.stringify({
    schemaVersion: "skillcentral.dev/v1",
    id: "board-duplicate",
    name: "Board duplicate high",
    description: "Higher layer source fixture",
    type: "prompt",
    prompt: "Higher layer body",
    appliesTo: "global",
  }, null, 2));
  await writeFile(boardRuleFile, JSON.stringify({
    schemaVersion: "skillcentral.dev/rule/v1",
    id: "board-rule",
    name: "Board rule",
    description: "Board rule fixture",
    body: "Board rule body",
    appliesTo: "global",
  }, null, 2));

  const boardLayers = [
    { ...layer, id: "board-low", name: "board-low", path: boardLayerLowDir, priority: 5 },
    { ...layer, id: "board-high", name: "board-high", path: boardLayerHighDir, priority: 15 },
  ];
  const boardEngine = new SkillEngine();
  await boardEngine.reload(boardLayers, { projectRoot: repo });
  const boardApp = createBoardApp({
    config: { layers: boardLayers },
    engine: boardEngine,
    rootDir: repo,
    rulesDir: boardRulesDir,
    version: "scope-test",
  });
  const boardRequest = (requestPath, init) =>
    boardApp.request(`http://localhost${requestPath}`, init);
  const putScope = (assetType, id, body, origin = "http://localhost") => boardRequest(
    `/api/assets/${assetType}/${id}/scope`,
    {
      method: "PUT",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    },
  );

  const projectResponse = await boardRequest("/api/project-identity");
  assert.equal(projectResponse.status, 200);
  assert.equal((await projectResponse.json()).id, ids.one);

  const scopesResponse = await boardRequest("/api/assets/scopes");
  assert.equal(scopesResponse.status, 200);
  const scopeIndex = await scopesResponse.json();
  const recoverAsset = scopeIndex.assets.find((asset) => asset.source === recoverSkillFile);
  const duplicateLowAsset = scopeIndex.assets.find((asset) => asset.source === duplicateLowFile);
  const duplicateHighAsset = scopeIndex.assets.find((asset) => asset.source === duplicateHighFile);
  const ruleAsset = scopeIndex.assets.find((asset) => asset.source === boardRuleFile);
  assert(recoverAsset && duplicateLowAsset && duplicateHighAsset && ruleAsset);
  assert.equal(recoverAsset.assetType, "skill");
  assert.equal(ruleAsset.assetType, "rule");
  assert.equal(recoverAsset.appliesHere, true);
  assert.match(recoverAsset.source, /recover-source\.yml$/);
  assert.match(ruleAsset.source, /rule-source\.json$/);

  const initialSkills = await (await boardRequest("/api/skills")).json();
  const initialRules = await (await boardRequest("/api/rules")).json();
  assert(initialSkills.some((asset) => asset.id === "board-recover"));
  assert(initialSkills.some((asset) => asset.id === "board-duplicate"));
  assert(!initialSkills.some((asset) => asset.id === "board-rule"));
  assert(initialRules.some((asset) => asset.id === "board-rule"));
  assert(!initialRules.some((asset) => asset.id === "board-recover"));

  const moveRecoverResponse = await putScope("skill", "board-recover", {
    source: recoverSkillFile,
    appliesTo: { projects: [ids.two] },
    expectedSha256: recoverAsset.sha256,
  });
  assert.equal(moveRecoverResponse.status, 200);
  const movedRecover = await moveRecoverResponse.json();
  assert.equal(movedRecover.appliesHere, false);
  const movedSkills = await (await boardRequest("/api/skills")).json();
  assert(!movedSkills.some((asset) => asset.id === "board-recover"));
  const movedIndex = await (await boardRequest("/api/assets/scopes")).json();
  const recoverWhileHidden = movedIndex.assets.find((asset) => asset.source === recoverSkillFile);
  assert(recoverWhileHidden);
  assert.equal(recoverWhileHidden.appliesHere, false);
  const restoreRecoverResponse = await putScope("skill", "board-recover", {
    source: recoverSkillFile,
    appliesTo: "global",
    expectedSha256: movedRecover.sha256,
  });
  assert.equal(restoreRecoverResponse.status, 200);
  assert((await (await boardRequest("/api/skills")).json())
    .some((asset) => asset.id === "board-recover"));

  const ruleBefore = await readAssetScopeFile(boardRuleFile);
  const moveRuleResponse = await putScope("rule", "board-rule", {
    source: boardRuleFile,
    appliesTo: { projects: [ids.two] },
    expectedSha256: ruleBefore.sha256,
  });
  assert.equal(moveRuleResponse.status, 200);
  const movedRule = await moveRuleResponse.json();
  assert.equal(movedRule.appliesHere, false);
  const rulesWhileHidden = await (await boardRequest("/api/rules")).json();
  assert.equal(rulesWhileHidden.find((asset) => asset.id === "board-rule").appliesHere, false);
  const afterSuccessfulRuleWrite = await readFile(boardRuleFile, "utf8");
  const staleRuleResponse = await putScope("rule", "board-rule", {
    source: boardRuleFile,
    appliesTo: "global",
    expectedSha256: ruleBefore.sha256,
  });
  assert.equal(staleRuleResponse.status, 409);
  const staleRuleBody = await staleRuleResponse.json();
  assert.equal(staleRuleBody.current.sha256, movedRule.sha256);
  assert.equal(await readFile(boardRuleFile, "utf8"), afterSuccessfulRuleWrite);
  const restoreRuleResponse = await putScope("rule", "board-rule", {
    source: boardRuleFile,
    appliesTo: "global",
    expectedSha256: movedRule.sha256,
  });
  assert.equal(restoreRuleResponse.status, 200);

  const duplicateHighBefore = await readAssetScopeFile(duplicateHighFile);
  const editExactDuplicateResponse = await putScope("skill", "board-duplicate", {
    source: duplicateLowFile,
    appliesTo: { projects: [ids.two] },
    expectedSha256: duplicateLowAsset.sha256,
  });
  assert.equal(editExactDuplicateResponse.status, 200);
  assert.deepEqual((await readAssetScopeFile(duplicateLowFile)).appliesTo, { projects: [ids.two] });
  assert.equal((await readAssetScopeFile(duplicateHighFile)).sha256, duplicateHighBefore.sha256);
  const editedDuplicateLow = await editExactDuplicateResponse.json();
  assert.equal((await putScope("skill", "board-duplicate", {
    source: duplicateLowFile,
    appliesTo: "global",
    expectedSha256: editedDuplicateLow.sha256,
  })).status, 200);

  assert.equal((await putScope("skill", "board-recover", {
    source: recoverSkillFile,
    appliesTo: "global",
    expectedSha256: (await readAssetScopeFile(recoverSkillFile)).sha256,
  }, "https://example.invalid")).status, 403);
  assert.equal((await putScope("skill", "board-recover", {
    source: path.join(root, "not-discovered.yml"),
    appliesTo: "global",
  })).status, 404);
  assert.equal((await putScope("rule", "board-rule", {
    source: recoverSkillFile,
    appliesTo: "global",
  })).status, 404);
  assert.equal((await putScope("skill", "board-recover", {
    source: recoverSkillFile,
  })).status, 400);
  for (const invalidScope of [
    { projects: [] },
    { projects: [ids.one, ids.one] },
    { projects: [ids.one], unknown: true },
    { projects: ["repository-name"] },
  ]) {
    assert.equal((await putScope("skill", "board-recover", {
      source: recoverSkillFile,
      appliesTo: invalidScope,
    })).status, 400);
  }

  // The frontend is intentionally buildless; these checks guard the shipped
  // static bundle against losing the navigation or editor contract.
  const boardHtml = await readFile(path.resolve("dist/web/index.html"), "utf8");
  const boardJs = await readFile(path.resolve("dist/web/app.js"), "utf8");
  assert.match(boardHtml, /data-view="rules"/);
  assert.match(boardHtml, /id="scope-dialog"/);
  assert.match(boardHtml, /data-scope-mode="global"/);
  assert.match(boardHtml, /data-scope-mode="projects"/);
  assert.match(boardJs, /"nav\.rules": "Rules"/);
  assert.match(boardJs, /"scope\.title": "Asset scope"/);
  assert.match(boardJs, /"scope\.title": "资产作用域"/);
  assert.match(boardJs, /\/api\/assets\/\$\{asset\.assetType\}/);

  console.log("asset scope contract, Board recovery UI/API, filtering, and atomic editing passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
