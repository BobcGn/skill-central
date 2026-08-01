#!/usr/bin/env bash
# ============================================================================
# skill-central 集成测试脚本
# ============================================================================
# 用法: npm test (自动通过 pretest 先构建) 或 bash scripts/test.sh
#
# 测试范围:
#   1. CLI 基本可用性 (--version, --help)
#   2. 准备测试环境
#   3. 添加技能 (add)
#   4. 列表验证 (list)
#   5. Universal Skill v1 / legacy compatibility
#   6. 可配置 Layer System / conflict handling
#   7. Registry Query API
#   8. Registry performance fixture
#   9. Lockfile source metadata / migration
#   10. Target adapters / capabilities
#   11. Compiler dry-run
#   12. Phase 5I MCP resource router
#   13. Phase 5J durable session store
#   14. Phase 5K topic blackboard
#   15. Phase 5L workflow scheduler
#   16. Phase 5M MCP workflow tools
#   17. Export transaction
#   18. IDE connection health
#   19. One-click connect plan
#   20. Web local console APIs
#   21. 医生诊断 (doctor)
#   22. Phase 4A/B local app state / GitHub auth boundary
#   23. Phase 4D/E sync engine dry-run plan / apply transaction
#   24. Rules 规则库、Asset Scope 与 Web Board 作用域管理
#
# 此脚本假设 dist/ 已构建完毕。如果通过 npm test 调用，
# pretest 钩子会自动执行 npm run build && npm run build:web。
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TEST_BIN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/skill-central-bin.XXXXXX")"
export PATH="$TEST_BIN_DIR:$PWD/node_modules/.bin:$PATH"
unset SKILL_CENTRAL_GITHUB_CLIENT_ID

# Homebrew documents exit 1 as a valid "outdated items found" result in some
# versions. This executable proves the updater still consumes the JSON report.
cat > "$TEST_BIN_DIR/brew-outdated-fixture" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  tap-info)
    echo '[{"name":"bobcgn/skill-central","installed":true,"trusted":true}]'
    ;;
  list)
    echo 'skill-central 1.0.0-alpha.0'
    ;;
  update)
    ;;
  outdated)
    echo '{"casks":[{"name":"skill-central","current_version":"1.0.0-alpha.1"}]}'
    exit 1
    ;;
  *)
    echo "unexpected fixture command: $*" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$TEST_BIN_DIR/brew-outdated-fixture"

cat > "$TEST_BIN_DIR/skill-central" <<EOF
#!/usr/bin/env bash
exec node "$PWD/dist/index.js" "\$@"
EOF
chmod +x "$TEST_BIN_DIR/skill-central"

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

# Several checks temporarily replace project state. User-home fixtures are kept
# under TEST_BIN_DIR, so the suite never reads or overwrites a real lockfile.
cleanup() {
  if [ -f skill-central.yaml.bak.ci ]; then
    mv skill-central.yaml.bak.ci skill-central.yaml
  fi
  rm -rf .skills/ci-conflict-a .skills/ci-conflict-b
  rm -rf .skill-central-export-ci
  rm -rf .skill-central-ide-health-ci
  rm -rf .skill-central-connect-ci
  rm -rf .skill-central-web-ci
  rm -rf .skill-central-session-ci
  rm -rf .skill-central-app-state-ci
  rm -rf .skill-central-registry-ci
  rm -rf .skills/sync-ci-global .skills/sync-ci-workflows .skills/web-sync-ci
  rm -f \
    .skills/02-workflows/test-skill.yaml \
    .skills/02-workflows/test-v1-prompt.yaml \
    .skills/02-workflows/test-v1-tool.yaml \
    .skills/02-workflows/test-v1-workflow.yaml \
    .skills/02-workflows/test-v1-blocked-workflow.yaml \
    .skills/02-workflows/test-v1-policy.yaml \
    .skills/02-workflows/test-v1-context-router.yaml \
    .skills/02-workflows/test-invalid-missing-id.yaml \
    .skills/02-workflows/test-invalid-type.yaml \
    .skills/02-workflows/test-invalid-capability.yaml \
    .skills/01-global/test-layer-shadow.yaml \
    .skills/02-workflows/test-layer-shadow.yaml \
    .skills/01-global/test-sync-noop.yaml \
    .skills/01-global/test-sync-create-local.yaml \
    .skills/01-global/test-sync-create-remote.yaml \
    .skills/01-global/test-sync-conflict.yaml \
    .skills/01-global/test-sync-delete-local.yaml \
    .skills/02-workflows/test-sync-excluded.yaml \
    .skills/sync-ci-global/test-sync-noop.yaml \
    .skills/sync-ci-global/test-sync-create-local.yaml \
    .skills/sync-ci-global/test-sync-create-remote.yaml \
    .skills/sync-ci-global/test-sync-conflict.yaml \
    .skills/sync-ci-global/test-sync-delete-local.yaml \
    .skills/sync-ci-workflows/test-sync-excluded.yaml \
    .skills/web-sync-ci/web-apply-create-local.yaml \
    .skills/web-sync-ci/web-apply-conflict.yaml
  rm -f .skills/01-global/test-sync-conflict.yaml.bak.* .skills/01-global/test-sync-delete-local.yaml.bak.*
  rm -f .skills/web-sync-ci/web-apply-conflict.yaml.bak.*
  rm -rf .rules-ci .rules-empty-ci
  rm -rf "$TEST_BIN_DIR"
}
trap cleanup EXIT

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           skill-central  集成测试                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. CLI 基本可用性 ────────────────────────────────────────────────────────
echo "→ 1/24 CLI 基本检查..."

node dist/index.js --version > /dev/null \
  && pass "--version 正常" \
  || fail "--version 失败"

node dist/index.js --help > /dev/null \
  && pass "--help 正常" \
  || fail "--help 失败"

# ── 2. 准备测试环境 ──────────────────────────────────────────────────────────
echo ""
echo "→ 2/24 准备测试环境..."

# 模拟真实的四层 skill 目录结构（参考 CI 流程）
mkdir -p .skills/01-global .skills/02-workflows .skills/03-domains .skills/04-tech-stack
pass ".skills/ 目录已就绪"

# ── 3. 添加测试技能 ──────────────────────────────────────────────────────────
echo ""
echo "→ 3/24 添加测试技能..."

node dist/index.js add \
  --id test-skill \
  --name "Test Skill" \
  --description "CI integration test skill" \
  --tags "ci,test" \
  --prompt "This is a test prompt for CI." \
  --yes \
  && pass "add 命令成功" \
  || fail "add 命令失败"

# ── 4. 验证技能列表 ──────────────────────────────────────────────────────────
echo ""
echo "→ 4/24 验证技能列表..."

node dist/index.js list | grep -q "test-skill" \
  && pass "list 包含 legacy test-skill" \
  || fail "list 中未找到 test-skill"

# ── 5. Universal Skill v1 / legacy compatibility ───────────────────────────
echo ""
echo "→ 5/24 Universal Skill v1 / legacy compatibility..."

cat > .skills/02-workflows/test-v1-prompt.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-v1-prompt
name: Test V1 Prompt
description: CI universal prompt skill
type: prompt
tags: [ci, universal]
activation:
  intents: [test-intent]
capabilities:
  required: [mcp.prompts.get]
targets:
  genericMcp:
    injection:
      mode: prompt
prompt:
  role: user
  template: "This is a v1 prompt."
YAML

cat > .skills/02-workflows/test-v1-tool.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-v1-tool
name: Test V1 Tool
description: CI universal tool skill
type: tool
tags: [ci, universal]
capabilities:
  required: [mcp.tools.call]
inputs:
  type: object
  properties:
    value:
      type: string
  required: [value]
prompt: "Tool value: {{value}}"
YAML

cat > .skills/02-workflows/test-v1-workflow.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-v1-workflow
name: Test V1 Workflow
description: CI universal workflow skill
type: workflow
tags: [ci, workflow]
activation:
  intents: [ci-workflow]
capabilities:
  required: [ide.agent.readFiles, ide.agent.experimentalMissing]
  optional: [ide.agent.runCommand]
degradation:
  whenMissing:
    ide.agent.experimentalMissing:
      mode: manual-instructions
      message: "Run the experimental step manually."
workflow:
  strategy: sequential
  steps:
    - id: collect
      uses: prompt
      outputTopic: ci.collect
    - id: review
      uses: prompt
      dependsOn: [collect]
      outputTopic: ci.review
prompt:
  role: user
  template: "Workflow prompt body."
YAML

cat > .skills/02-workflows/test-v1-blocked-workflow.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-v1-blocked-workflow
name: Test V1 Blocked Workflow
description: CI workflow that requires an external blackboard topic
type: workflow
tags: [ci, workflow]
context:
  subscribe:
    - topic: external.ready
workflow:
  strategy: sequential
  steps:
    - id: wait-for-context
      uses: prompt
      outputTopic: ci.blocked
prompt:
  role: user
  template: "Use only subscribed context."
YAML

cat > .skills/02-workflows/test-v1-policy.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-v1-policy
name: Test V1 Policy
description: CI universal policy skill
type: policy
tags: [ci, policy]
capabilities:
  denied: [skillcentral.host.writeProjectFiles]
context:
  publish:
    - topic: policy.ci
prompt:
  role: system
  template: "Follow CI policy."
YAML

cat > .skills/02-workflows/test-v1-context-router.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-v1-context-router
name: Test V1 Context Router
description: CI universal context router skill
type: context-router
tags: [ci, context]
context:
  subscribe:
    - topic: session.intent
  publish:
    - topic: routing.result
capabilities:
  optional: [mcp.resources.read]
prompt:
  role: user
  template: "Route context."
YAML

node dist/index.js validate \
  .skills/02-workflows/test-v1-prompt.yaml \
  .skills/02-workflows/test-v1-tool.yaml \
  .skills/02-workflows/test-v1-workflow.yaml \
  .skills/02-workflows/test-v1-blocked-workflow.yaml \
  .skills/02-workflows/test-v1-policy.yaml \
  .skills/02-workflows/test-v1-context-router.yaml \
  && pass "6 个 Universal Skill v1 示例通过校验" \
  || fail "Universal Skill v1 示例校验失败"

node dist/index.js list | grep -q "test-v1-workflow" \
  && pass "list 可加载非 prompt/tool 的 v1 skill" \
  || fail "list 中未找到 test-v1-workflow"

cat > .skills/02-workflows/test-invalid-missing-id.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
name: Missing Id
description: Invalid universal skill
type: prompt
prompt: "missing id"
YAML

cat > .skills/02-workflows/test-invalid-type.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-invalid-type
name: Invalid Type
description: Invalid universal skill
type: agent
prompt: "invalid type"
YAML

cat > .skills/02-workflows/test-invalid-capability.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-invalid-capability
name: Invalid Capability
description: Invalid universal skill
type: prompt
capabilities:
  required: [BadCapability]
prompt: "invalid capability"
YAML

set +e
invalid_output=$(node dist/index.js validate \
  .skills/02-workflows/test-invalid-missing-id.yaml \
  .skills/02-workflows/test-invalid-type.yaml \
  .skills/02-workflows/test-invalid-capability.yaml 2>&1)
invalid_status=$?
set -e

if [ "$invalid_status" -eq 0 ]; then
  fail "非法 Universal Skill 未触发校验失败"
fi

printf '%s' "$invalid_output" | grep -q "test-invalid-missing-id.yaml: id:" \
  && printf '%s' "$invalid_output" | grep -q "test-invalid-type.yaml: type:" \
  && printf '%s' "$invalid_output" | grep -q "test-invalid-capability.yaml: capabilities.required\\[0\\]:" \
  && pass "非法 id/type/capability 错误包含文件路径和字段路径" \
  || fail "非法 Universal Skill 错误定位不完整"

rm -f \
  .skills/02-workflows/test-invalid-missing-id.yaml \
  .skills/02-workflows/test-invalid-type.yaml \
  .skills/02-workflows/test-invalid-capability.yaml

# ── 6. 可配置 Layer System / conflict handling ─────────────────────────────
echo ""
echo "→ 6/24 可配置 Layer System / conflict handling..."

cat > .skills/01-global/test-layer-shadow.yaml <<'YAML'
id: test-layer-shadow
name: Test Layer Shadow Global
description: Low priority layer candidate
type: prompt
tags: [ci, layer]
prompt: "global layer"
YAML

cat > .skills/02-workflows/test-layer-shadow.yaml <<'YAML'
id: test-layer-shadow
name: Test Layer Shadow Workflow
description: Higher priority layer candidate
type: prompt
tags: [ci, layer]
prompt: "workflow layer"
YAML

node dist/index.js show test-layer-shadow | grep -q "Layer       : 02-workflows" \
  && pass "同 id 多 layer 按 priority 选择有效 skill" \
  || fail "layer shadow priority 解析失败"

node dist/index.js doctor | grep -q "shadowedBy=02-workflows" \
  && pass "doctor 输出 shadowed 覆盖链" \
  || fail "doctor 未输出 shadowed 覆盖链"

cp skill-central.yaml skill-central.yaml.bak.ci
mkdir -p .skills/ci-conflict-a .skills/ci-conflict-b
cat > skill-central.yaml <<'YAML'
layers:
  - id: ci-conflict-a
    name: CI Conflict A
    path: .skills/ci-conflict-a
    scope: workspace
    priority: 99
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private
  - id: ci-conflict-b
    name: CI Conflict B
    path: .skills/ci-conflict-b
    scope: workspace
    priority: 99
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private
YAML

cat > .skills/ci-conflict-a/test-layer-conflict.yaml <<'YAML'
id: test-layer-conflict
name: Test Layer Conflict A
description: Conflict candidate A
type: prompt
tags: [ci, layer]
prompt: "conflict A"
YAML

cat > .skills/ci-conflict-b/test-layer-conflict.yaml <<'YAML'
id: test-layer-conflict
name: Test Layer Conflict B
description: Conflict candidate B
type: prompt
tags: [ci, layer]
prompt: "conflict B"
YAML

set +e
conflict_list=$(node dist/index.js list 2>&1)
conflict_doctor=$(node dist/index.js doctor 2>&1)
conflict_doctor_status=$?
set -e

if printf '%s' "$conflict_list" | grep -q "test-layer-conflict"; then
  mv skill-central.yaml.bak.ci skill-central.yaml
  fail "conflicted skill 不应进入 effective list"
fi

if [ "$conflict_doctor_status" -eq 0 ]; then
  mv skill-central.yaml.bak.ci skill-central.yaml
  fail "doctor 应该对无法消歧的 layer conflict 返回失败"
fi

printf '%s' "$conflict_doctor" | grep -q "same priority (99) and same scope distance" \
  && pass "priority/scope 无法消歧时 doctor 明确报告 conflict" \
  || {
    mv skill-central.yaml.bak.ci skill-central.yaml
    fail "doctor conflict 原因不完整"
  }

mv skill-central.yaml.bak.ci skill-central.yaml
rm -rf .skills/ci-conflict-a .skills/ci-conflict-b

# ── 7. Registry Query API ───────────────────────────────────────────────────
echo ""
echo "→ 7/24 Registry Query API..."

node dist/index.js list --type workflow | grep -q "test-v1-workflow" \
  && pass "CLI type 查询复用 Registry Query API" \
  || fail "Registry type 查询失败"

node dist/index.js list --tag universal | grep -q "test-v1-prompt" \
  && pass "CLI tag 查询复用 Registry Query API" \
  || fail "Registry tag 查询失败"

node --input-type=module <<'NODE'
import { SkillEngine } from "./dist/core/engine.js";
import { loadConfig } from "./dist/storage/config.js";

const engine = new SkillEngine();
await engine.reload(loadConfig().layers);

const byIntent = engine.querySkills({ intent: "ci-workflow" }).skills.map((skill) => skill.id);
if (!byIntent.includes("test-v1-workflow")) {
  throw new Error(`intent query missing test-v1-workflow; got ${byIntent.join(",")}`);
}

const byCapability = engine
  .querySkills({ capabilities: ["mcp.tools.call"] })
  .skills
  .map((skill) => skill.id);
if (!byCapability.includes("test-v1-tool")) {
  throw new Error(`capability query missing test-v1-tool; got ${byCapability.join(",")}`);
}

const records = engine.querySkills({ id: "test-layer-shadow", status: "any" }).records;
const candidates = records.flatMap((record) => record.candidates);
if (!candidates.some((skill) => skill.status === "effective")) {
  throw new Error("registry resolution query missing effective candidate");
}
if (!candidates.some((skill) => skill.status === "shadowed")) {
  throw new Error("registry resolution query missing shadowed candidate");
}
NODE
pass "Registry intent/capability/provenance 查询通过"

# ── 8. Registry performance fixture ────────────────────────────────────────
echo ""
echo "→ 8/24 Registry performance fixture..."

npm run test:registry-perf \
  && pass "1000 skill Registry 查询低于 200ms" \
  || fail "1000 skill Registry 查询性能未达标"

# ── 9. Lockfile source metadata / migration ────────────────────────────────
echo ""
echo "→ 9/24 Lockfile source metadata / migration..."

SC_TEST_HOME="$TEST_BIN_DIR/home"
mkdir -p "$SC_TEST_HOME/.skill-central"
lock_path="$SC_TEST_HOME/.skill-central/lock.json"

cat > "$lock_path" <<'JSON'
{
  "version": 1,
  "entries": {
    "legacy-lock-skill": {
      "id": "legacy-lock-skill",
      "source": "github:owner/repo/path/to/skill.yaml",
      "version": "main",
      "sha256": "abc123",
      "installedAt": "2026-07-29T00:00:00.000Z",
      "layer": "02-workflows",
      "filePath": "/tmp/legacy-lock-skill.yaml"
    }
  }
}
JSON

HOME="$SC_TEST_HOME" node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";
import { readLock, writeLock, findById } from "./dist/commands/lockfile.js";

const lock = await readLock();
const entry = findById(lock, "legacy-lock-skill");
if (!entry) throw new Error("missing migrated lock entry");
if (lock.version !== 2) throw new Error(`expected lock version 2, got ${lock.version}`);
if (entry.sourceKind !== "github") throw new Error(`expected github sourceKind, got ${entry.sourceKind}`);
if (entry.resolvedHash !== "abc123") throw new Error(`expected resolvedHash abc123, got ${entry.resolvedHash}`);
if (entry.schemaVersion !== "unknown") throw new Error(`expected unknown schemaVersion, got ${entry.schemaVersion}`);

await writeLock(lock);
const raw = JSON.parse(await readFile(`${process.env.HOME}/.skill-central/lock.json`, "utf-8"));
if (raw.version !== 2) throw new Error(`writeLock did not persist v2; got ${raw.version}`);
if (raw.entries["legacy-lock-skill"].sourceKind !== "github") {
  throw new Error("writeLock did not persist sourceKind");
}
NODE
pass "旧 lock v1 可读取并写回 v2 来源元数据"

rm -f "$lock_path"

# ── 10. Target adapters / capabilities ─────────────────────────────────────
echo ""
echo "→ 10/24 Target adapters / capabilities..."

cursor_caps=$(node dist/index.js capabilities --target cursor)
windsurf_caps=$(node dist/index.js capabilities --target windsurf)
generic_caps=$(node dist/index.js capabilities --target generic-mcp)

printf '%s' "$cursor_caps" | grep -q "Target : cursor" \
  && printf '%s' "$cursor_caps" | grep -q "ide.agent.runCommand: requires-user-approval" \
  && printf '%s' "$cursor_caps" | grep -q "Undeclared capabilities resolve as unknown" \
  && pass "cursor capability matrix 可审计" \
  || fail "cursor capability matrix 输出不完整"

printf '%s' "$windsurf_caps" | grep -q "Target : windsurf" \
  && printf '%s' "$windsurf_caps" | grep -q "mcp.tools.call: partial" \
  && pass "windsurf capability matrix 可审计" \
  || fail "windsurf capability matrix 输出不完整"

printf '%s' "$generic_caps" | grep -q "Target : generic-mcp" \
  && printf '%s' "$generic_caps" | grep -q "mcp.resources.read: supported" \
  && pass "generic-mcp capability matrix 可审计" \
  || fail "generic-mcp capability matrix 输出不完整"

node --input-type=module <<'NODE'
import { getTargetAdapter } from "./dist/adapters/registry.js";

const skill = {
  id: "adapter-snapshot",
  name: "Adapter Snapshot",
  description: "Adapter snapshot fixture",
  type: "prompt",
  schemaVersion: "skillcentral.dev/v1",
  sourceFormat: "universal",
  prompt: "Snapshot prompt",
  priority: 20,
  source: ".skills/02-workflows/adapter-snapshot.yaml",
  status: "effective",
  layer: {
    id: "02-workflows",
    name: "02-workflows",
    path: ".skills/02-workflows",
    scope: "repo",
    priority: 20,
    writable: true,
    trust: "local",
    sync: { enabled: false },
    visibility: "private",
  },
};

const cursor = getTargetAdapter("cursor").buildArtifacts([skill], []);
const windsurf = getTargetAdapter("windsurf").buildArtifacts([skill], []);
const generic = getTargetAdapter("generic-mcp").buildArtifacts([skill], []);

if (cursor[0].kind !== "cursor-rule" || cursor[0].path !== ".cursor/rules/adapter-snapshot.mdc") {
  throw new Error("cursor adapter snapshot changed");
}
if (!cursor[0].preview.includes("description: Generated from skill-central skill adapter-snapshot")) {
  throw new Error("cursor adapter missing front matter trace");
}
if (windsurf[0].kind !== "windsurf-rule" || windsurf[0].path !== ".windsurf/rules/adapter-snapshot.md") {
  throw new Error("windsurf adapter snapshot changed");
}
if (generic[0].kind !== "mcp-resource" || generic[0].path !== "skill://prompt/adapter-snapshot") {
  throw new Error("generic-mcp adapter snapshot changed");
}
for (const artifact of [cursor[0], windsurf[0], generic[0]]) {
  if (!artifact.preview.includes("skill: adapter-snapshot")) {
    throw new Error(`${artifact.target} artifact missing skill trace`);
  }
  if (artifact.metadata.sourceLayerId !== "02-workflows") {
    throw new Error(`${artifact.target} artifact missing layer provenance`);
  }
}
NODE
pass "三类 adapter snapshot 输出稳定且包含 provenance"

# ── 11. Compiler dry-run ────────────────────────────────────────────────────
echo ""
echo "→ 11/24 Compiler dry-run..."

rm -f .cursor/rules/test-v1-workflow.mdc .windsurf/rules/test-v1-workflow.md
cursor_compile=$(node dist/index.js compile --target cursor --intent ci-workflow --dry-run)
windsurf_compile=$(node dist/index.js compile --target windsurf --intent ci-workflow --dry-run)
cursor_compile_json=$(node dist/index.js compile --target cursor --intent ci-workflow --dry-run --json)

printf '%s' "$cursor_compile" | grep -q "Target : cursor" \
  && printf '%s' "$cursor_compile" | grep -q "test-v1-workflow" \
  && printf '%s' "$cursor_compile" | grep -q "Artifact preview" \
  && printf '%s' "$cursor_compile" | grep -q "ide.agent.experimentalMissing -> unknown (degrade)" \
  && printf '%s' "$cursor_compile" | grep -q "manual-instructions - Run the experimental step manually" \
  && pass "cursor compile dry-run 输出可审计报告" \
  || fail "cursor compile dry-run 输出不完整"

printf '%s' "$windsurf_compile" | grep -q "Target : windsurf" \
  && printf '%s' "$windsurf_compile" | grep -q "test-v1-workflow" \
  && pass "windsurf compile dry-run 输出可审计报告" \
  || fail "windsurf compile dry-run 输出不完整"

if [ -e .cursor/rules/test-v1-workflow.mdc ] || [ -e .windsurf/rules/test-v1-workflow.md ]; then
  fail "compile --dry-run 不应写入 IDE 文件"
fi
pass "compile --dry-run 无文件写入"

COMPILE_JSON="$cursor_compile_json" node --input-type=module <<'NODE'
const bundle = JSON.parse(process.env.COMPILE_JSON);
if (bundle.target !== "cursor") throw new Error(`unexpected target ${bundle.target}`);
if (bundle.intent !== "ci-workflow") throw new Error(`unexpected intent ${bundle.intent}`);
if (!bundle.hash || typeof bundle.hash !== "string") throw new Error("missing compile hash");
if (!bundle.artifacts.some((artifact) => artifact.path === ".cursor/rules/test-v1-workflow.mdc")) {
  throw new Error("compile JSON missing cursor artifact");
}
if (!bundle.degradations.some((entry) => entry.mode === "manual-instructions")) {
  throw new Error("compile JSON missing degradation report");
}
NODE
pass "compile --json 输出机器可读报告"

# ── 12. Phase 5I MCP resource router ────────────────────────────────────────
echo ""
echo "→ 12/24 Phase 5I MCP resource router..."

node --input-type=module <<'NODE'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "mcp"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "skill-central-resource-ci", version: "0.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);

  const listed = await client.listResources();
  if (!listed.resources.some((resource) => resource.uri === "skill://registry")) {
    throw new Error("resources/list missing skill://registry");
  }
  if (!listed.resources.some((resource) => resource.uri === "skill://skill/test-v1-workflow")) {
    throw new Error("resources/list missing test-v1-workflow skill resource");
  }
  if (!listed.resources.some((resource) => resource.uri === "skill://workflow/test-v1-workflow/plan")) {
    throw new Error("resources/list missing test-v1-workflow plan resource");
  }

  const registry = await client.readResource({ uri: "skill://registry" });
  const registryBody = JSON.parse(registry.contents[0].text);
  if (!registryBody.records.some((record) => record.id === "test-v1-workflow")) {
    throw new Error("registry resource missing resolution record");
  }

  const skill = await client.readResource({ uri: "skill://skill/test-v1-workflow" });
  const skillBody = JSON.parse(skill.contents[0].text);
  if (skillBody.id !== "test-v1-workflow" || skillBody.layer.id !== "02-workflows") {
    throw new Error("skill resource missing provenance");
  }

  const bundle = await client.readResource({ uri: "skill://bundle/cursor/ci-workflow" });
  const bundleBody = JSON.parse(bundle.contents[0].text);
  if (bundleBody.target !== "cursor" || bundleBody.intent !== "ci-workflow" || !bundleBody.hash) {
    throw new Error("bundle resource missing compile evidence");
  }
  if (!bundleBody.artifacts.some((artifact) => artifact.path === ".cursor/rules/test-v1-workflow.mdc")) {
    throw new Error("bundle resource missing cursor artifact");
  }

  const workflowPlan = await client.readResource({ uri: "skill://workflow/test-v1-workflow/plan" });
  const workflowPlanBody = JSON.parse(workflowPlan.contents[0].text);
  if (workflowPlanBody.schemaVersion !== "skillcentral.dev/workflow-plan/v1") {
    throw new Error("workflow plan resource missing schema version");
  }
  if (workflowPlanBody.workflowId !== "test-v1-workflow" || workflowPlanBody.strategy !== "sequential") {
    throw new Error("workflow plan resource missing workflow identity");
  }
  const reviewStep = workflowPlanBody.steps.find((step) => step.id === "review");
  if (!reviewStep || reviewStep.dependsOn[0] !== "collect" || !reviewStep.requiresTopics.includes("ci.collect")) {
    throw new Error("workflow plan resource should expose step dependency topics");
  }
  if (workflowPlanBody.dataPlaneBoundary.executesCommands !== false || workflowPlanBody.dataPlaneBoundary.injectsFullSessionHistory !== false) {
    throw new Error("workflow plan resource should document the data-plane boundary");
  }
  if ("sessionId" in workflowPlanBody) {
    throw new Error("workflow plan resource must not create or expose live session state");
  }

  let rejected = false;
  try {
    await client.readResource({ uri: "skill://unknown/example" });
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error("unknown resource URI should reject");
  }
} finally {
  await client.close().catch(() => undefined);
}
NODE
pass "MCP resources/list 与 resources/read 返回 registry、skill、bundle、workflow plan 证据"

# ── 13. Phase 5J durable session store ─────────────────────────────────────
echo ""
echo "→ 13/24 Phase 5J durable session store..."

session_app_state_dir=".skill-central-session-ci"
session_create=$(node dist/index.js session create --app-state-dir "$session_app_state_dir" --workflow-id pr-review.workflow --reason "CI create" --trigger workflow.start --json)
session_id=$(SESSION_CREATE_JSON="$session_create" node --input-type=module <<'NODE'
const session = JSON.parse(process.env.SESSION_CREATE_JSON);
if (session.workflowId !== "pr-review.workflow") throw new Error("unexpected workflowId");
if (session.status !== "created") throw new Error("new session should start as created");
if (!session.sessionId.startsWith("session-")) throw new Error("session id should be generated");
if (session.audit.length !== 1 || session.audit[0].trigger !== "workflow.start") {
  throw new Error("create audit event missing trigger");
}
process.stdout.write(session.sessionId);
NODE
)

session_running=$(node dist/index.js session status --app-state-dir "$session_app_state_dir" --session-id "$session_id" --status running --reason "First tasks returned" --trigger workflow.next --json)
SESSION_RUNNING_JSON="$session_running" node --input-type=module <<'NODE'
const session = JSON.parse(process.env.SESSION_RUNNING_JSON);
if (session.status !== "running") throw new Error("session status should be running");
if (session.audit.length !== 2) throw new Error("status update should append audit event");
const last = session.audit.at(-1);
if (last.from !== "created" || last.to !== "running" || last.trigger !== "workflow.next") {
  throw new Error("running audit event should record from/to/trigger");
}
NODE

session_blocked=$(node dist/index.js session status --app-state-dir "$session_app_state_dir" --session-id "$session_id" --status blocked --reason "Waiting for diff topic" --trigger workflow.scheduler --json)
SESSION_BLOCKED_JSON="$session_blocked" node --input-type=module <<'NODE'
const session = JSON.parse(process.env.SESSION_BLOCKED_JSON);
if (session.status !== "blocked") throw new Error("session status should be blocked");
const last = session.audit.at(-1);
if (last.from !== "running" || last.to !== "blocked" || last.reason !== "Waiting for diff topic") {
  throw new Error("blocked audit event should preserve reason");
}
NODE

session_show=$(node dist/index.js session show --app-state-dir "$session_app_state_dir" --session-id "$session_id" --json)
SESSION_SHOW_JSON="$session_show" SESSION_ID="$session_id" node --input-type=module <<'NODE'
const session = JSON.parse(process.env.SESSION_SHOW_JSON);
if (session.sessionId !== process.env.SESSION_ID || session.status !== "blocked") {
  throw new Error("session show should reload persisted session from disk");
}
if (session.audit.length !== 3) throw new Error("persisted audit history missing events");
NODE

session_list=$(node dist/index.js session list --app-state-dir "$session_app_state_dir" --json)
SESSION_LIST_JSON="$session_list" SESSION_ID="$session_id" node --input-type=module <<'NODE'
const listed = JSON.parse(process.env.SESSION_LIST_JSON);
if (!listed.sessions.some((session) => session.sessionId === process.env.SESSION_ID && session.status === "blocked")) {
  throw new Error("session list should include persisted blocked session");
}
NODE

SKILL_CENTRAL_APP_STATE_DIR="$session_app_state_dir" SESSION_ID="$session_id" node --input-type=module <<'NODE'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "mcp"],
  cwd: process.cwd(),
  stderr: "pipe",
  env: {
    ...process.env,
    SKILL_CENTRAL_APP_STATE_DIR: process.env.SKILL_CENTRAL_APP_STATE_DIR,
  },
});
const client = new Client({ name: "skill-central-session-ci", version: "0.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  const resource = await client.readResource({ uri: `skill://session/${process.env.SESSION_ID}/context` });
  const session = JSON.parse(resource.contents[0].text);
  if (session.sessionId !== process.env.SESSION_ID || session.status !== "blocked") {
    throw new Error("session context resource should read persisted session");
  }
  if (!session.audit.some((event) => event.to === "blocked" && event.trigger === "workflow.scheduler")) {
    throw new Error("session context resource missing audit events");
  }
} finally {
  await client.close().catch(() => undefined);
}
NODE

[ -d "$session_app_state_dir/sessions" ] \
  && [ -f "$session_app_state_dir/sessions/$session_id.json" ] \
  && pass "Session store 持久化状态、审计事件并可通过 MCP Resource 读取" \
  || fail "Session store 未创建持久化 session 文件"

rm -rf "$session_app_state_dir"

# ── 14. Phase 5K topic blackboard ──────────────────────────────────────────
echo ""
echo "→ 14/24 Phase 5K topic blackboard..."

blackboard_app_state_dir=".skill-central-session-ci"
blackboard_session=$(node dist/index.js session create --app-state-dir "$blackboard_app_state_dir" --workflow-id pr-review.workflow --reason "CI blackboard create" --trigger workflow.start --json)
blackboard_session_id=$(BLACKBOARD_SESSION_JSON="$blackboard_session" node --input-type=module <<'NODE'
const session = JSON.parse(process.env.BLACKBOARD_SESSION_JSON);
process.stdout.write(session.sessionId);
NODE
)

blackboard_entry_1=$(node dist/index.js session publish --app-state-dir "$blackboard_app_state_dir" --session-id "$blackboard_session_id" --topic review.diff --producer context-analyst --kind finding --summary "Diff collected" --content '{"files":["src/index.ts"],"risk":"low"}' --refs "file://src/index.ts" --json)
BLACKBOARD_ENTRY_JSON="$blackboard_entry_1" BLACKBOARD_SESSION_ID="$blackboard_session_id" node --input-type=module <<'NODE'
const entry = JSON.parse(process.env.BLACKBOARD_ENTRY_JSON);
if (entry.sessionId !== process.env.BLACKBOARD_SESSION_ID) throw new Error("entry session mismatch");
if (entry.topic !== "review.diff" || entry.producer !== "context-analyst" || entry.kind !== "finding") {
  throw new Error("entry provenance fields missing");
}
if (entry.content.files[0] !== "src/index.ts") throw new Error("JSON content should be parsed");
if (entry.refs[0].uri !== "file://src/index.ts") throw new Error("refs should be preserved");
NODE

node dist/index.js session publish --app-state-dir "$blackboard_app_state_dir" --session-id "$blackboard_session_id" --topic review.diff --producer security-reviewer --kind note --summary "No security issue" --content "plain text note" --json > /dev/null

blackboard_topic=$(node dist/index.js session topic --app-state-dir "$blackboard_app_state_dir" --session-id "$blackboard_session_id" --topic review.diff --json)
BLACKBOARD_TOPIC_JSON="$blackboard_topic" node --input-type=module <<'NODE'
const topic = JSON.parse(process.env.BLACKBOARD_TOPIC_JSON);
if (topic.schemaVersion !== "skillcentral.dev/blackboard-topic/v1") throw new Error("unexpected topic schema");
if (topic.topic !== "review.diff") throw new Error("unexpected topic name");
if (topic.entries.length !== 2) throw new Error("topic should append entries");
if (!topic.entries.some((entry) => entry.producer === "security-reviewer" && entry.content === "plain text note")) {
  throw new Error("plain text entry missing");
}
NODE

SKILL_CENTRAL_APP_STATE_DIR="$blackboard_app_state_dir" BLACKBOARD_SESSION_ID="$blackboard_session_id" node --input-type=module <<'NODE'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "mcp"],
  cwd: process.cwd(),
  stderr: "pipe",
  env: {
    ...process.env,
    SKILL_CENTRAL_APP_STATE_DIR: process.env.SKILL_CENTRAL_APP_STATE_DIR,
  },
});
const client = new Client({ name: "skill-central-blackboard-ci", version: "0.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  const resource = await client.readResource({ uri: `skill://session/${process.env.BLACKBOARD_SESSION_ID}/topic/review.diff` });
  const topic = JSON.parse(resource.contents[0].text);
  if (topic.entries.length !== 2) throw new Error("topic resource should expose persisted entries");
  if (!topic.entries.every((entry) => entry.sessionId === process.env.BLACKBOARD_SESSION_ID)) {
    throw new Error("topic resource should be scoped to one session");
  }
} finally {
  await client.close().catch(() => undefined);
}
NODE

[ -f "$blackboard_app_state_dir/sessions/$blackboard_session_id/blackboard/review.diff.json" ] \
  && pass "Blackboard topic 持久化 publish entry 并可通过 MCP Resource 读取" \
  || fail "Blackboard topic 未创建持久化文件"

rm -rf "$blackboard_app_state_dir"

# ── 15. Phase 5L workflow scheduler ────────────────────────────────────────
echo ""
echo "→ 15/24 Phase 5L workflow scheduler..."

workflow_app_state_dir=".skill-central-session-ci"
workflow_blocked=$(node dist/index.js workflow start --app-state-dir "$workflow_app_state_dir" --workflow-id test-v1-blocked-workflow --json)
WORKFLOW_BLOCKED_JSON="$workflow_blocked" node --input-type=module <<'NODE'
const result = JSON.parse(process.env.WORKFLOW_BLOCKED_JSON);
if (result.report.status !== "blocked") throw new Error(`expected blocked start, got ${result.report.status}`);
if (!result.report.blockedReasons.some((reason) => reason.includes("external.ready"))) {
  throw new Error("blocked workflow should report missing subscribed topic");
}
if (result.report.readyTasks.length !== 0) throw new Error("blocked workflow should not return tasks");
NODE

rm -rf "$workflow_app_state_dir"
workflow_start=$(node dist/index.js workflow start --app-state-dir "$workflow_app_state_dir" --workflow-id test-v1-workflow --json)
workflow_session_id=$(WORKFLOW_START_JSON="$workflow_start" node --input-type=module <<'NODE'
const result = JSON.parse(process.env.WORKFLOW_START_JSON);
if (!result.sessionId) throw new Error("workflow.start should create a session");
if (result.report.status !== "ready") throw new Error(`expected ready start, got ${result.report.status}`);
if (result.report.readyTasks.length !== 1) throw new Error("workflow.start should return first ready task");
const task = result.report.readyTasks[0];
if (task.stepId !== "collect" || task.publishTo !== "ci.collect") {
  throw new Error("first task should be collect -> ci.collect");
}
if (task.resources.length !== 0) throw new Error("first task should not inject dependency topics");
process.stdout.write(result.sessionId);
NODE
)

workflow_next_blocked=$(node dist/index.js workflow next --app-state-dir "$workflow_app_state_dir" --session-id "$workflow_session_id" --json)
WORKFLOW_NEXT_BLOCKED_JSON="$workflow_next_blocked" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.WORKFLOW_NEXT_BLOCKED_JSON);
if (report.status !== "ready" || report.readyTasks[0].stepId !== "collect") {
  throw new Error("without publish, scheduler should keep returning collect");
}
NODE

node dist/index.js workflow publish --app-state-dir "$workflow_app_state_dir" --session-id "$workflow_session_id" --topic ci.collect --producer context-analyst --kind result --summary "Collected context" --content '{"ok":true}' --json > /dev/null

workflow_next_review=$(node dist/index.js workflow next --app-state-dir "$workflow_app_state_dir" --session-id "$workflow_session_id" --json)
WORKFLOW_NEXT_REVIEW_JSON="$workflow_next_review" WORKFLOW_SESSION_ID="$workflow_session_id" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.WORKFLOW_NEXT_REVIEW_JSON);
if (report.status !== "ready") throw new Error(`expected ready review, got ${report.status}`);
if (!report.completedStepIds.includes("collect")) throw new Error("collect should be completed after ci.collect publish");
if (report.readyTasks.length !== 1 || report.readyTasks[0].stepId !== "review") {
  throw new Error("review should become ready after collect publishes");
}
const task = report.readyTasks[0];
if (!task.resources.includes(`skill://session/${process.env.WORKFLOW_SESSION_ID}/topic/ci.collect`)) {
  throw new Error("review task should inject only subscribed dependency topic resource");
}
NODE

node dist/index.js workflow publish --app-state-dir "$workflow_app_state_dir" --session-id "$workflow_session_id" --topic ci.review --producer reviewer --kind result --summary "Review complete" --content '{"findings":[]}' --json > /dev/null

workflow_done=$(node dist/index.js workflow next --app-state-dir "$workflow_app_state_dir" --session-id "$workflow_session_id" --json)
WORKFLOW_DONE_JSON="$workflow_done" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.WORKFLOW_DONE_JSON);
if (report.status !== "completed") throw new Error(`expected completed, got ${report.status}`);
if (report.readyTasks.length !== 0) throw new Error("completed workflow should not return tasks");
if (!report.completedStepIds.includes("collect") || !report.completedStepIds.includes("review")) {
  throw new Error("completed report should include all completed steps");
}
NODE

workflow_summary=$(node dist/index.js workflow summarize --app-state-dir "$workflow_app_state_dir" --session-id "$workflow_session_id" --json)
WORKFLOW_SUMMARY_JSON="$workflow_summary" node --input-type=module <<'NODE'
const summary = JSON.parse(process.env.WORKFLOW_SUMMARY_JSON);
if (!summary.topics.some((topic) => topic.topic === "ci.review" && topic.latestSummary === "Review complete")) {
  throw new Error("workflow summarize should include topic summaries");
}
NODE

pass "Workflow scheduler 返回 Data Plane Task、按 dependsOn/topic 推进并完成"
rm -rf "$workflow_app_state_dir"

# ── 16. Phase 5M MCP workflow tools ────────────────────────────────────────
echo ""
echo "→ 16/24 Phase 5M MCP workflow tools..."

rm -rf "$workflow_app_state_dir"
node --input-type=module <<'NODE'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const appStateDir = ".skill-central-session-ci";
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "mcp"],
  cwd: process.cwd(),
  stderr: "pipe",
  env: { ...process.env, SKILL_CENTRAL_APP_STATE_DIR: appStateDir },
});
const client = new Client({ name: "skill-central-workflow-tools-ci", version: "0.0.0" }, { capabilities: {} });

const parseToolJson = (result) => {
  const text = result.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("workflow tool should return JSON text content");
  return JSON.parse(text);
};

try {
  await client.connect(transport);

  const listed = await client.listTools();
  for (const name of ["workflow.start", "workflow.next", "workflow.publish", "workflow.summarize"]) {
    if (!listed.tools.some((tool) => tool.name === name)) {
      throw new Error(`tools/list missing built-in ${name}`);
    }
  }

  const started = parseToolJson(await client.callTool({
    name: "workflow.start",
    arguments: { workflowId: "test-v1-workflow", appStateDir },
  }));
  if (!started.sessionId) throw new Error("workflow.start tool should return sessionId");
  const firstTask = started.report?.readyTasks?.[0];
  if (!firstTask || firstTask.stepId !== "collect") {
    throw new Error("workflow.start tool should return collect as first ready task");
  }
  if (!firstTask.promptBundle || !firstTask.promptBundle.text.includes("Workflow: test-v1-workflow")) {
    throw new Error("workflow.start task should include prompt bundle text");
  }
  if (firstTask.promptBundle.resourceUris.length !== 0) {
    throw new Error("collect prompt bundle should not inject unrelated session resources");
  }

  await client.callTool({
    name: "workflow.publish",
    arguments: {
      sessionId: started.sessionId,
      topic: "ci.collect",
      content: { ok: true, source: "mcp" },
      producer: "mcp-ci",
      kind: "result",
      summary: "Collected through MCP",
      appStateDir,
    },
  });

  const next = parseToolJson(await client.callTool({
    name: "workflow.next",
    arguments: { sessionId: started.sessionId, appStateDir },
  }));
  const reviewTask = next.readyTasks?.[0];
  const collectTopicUri = `skill://session/${started.sessionId}/topic/ci.collect`;
  if (!reviewTask || reviewTask.stepId !== "review") {
    throw new Error("workflow.next tool should return review after ci.collect is published");
  }
  if (reviewTask.resources.length !== 1 || reviewTask.resources[0] !== collectTopicUri) {
    throw new Error("review task should expose only the required ci.collect resource URI");
  }
  if (reviewTask.promptBundle.resourceUris.length !== 1 || reviewTask.promptBundle.resourceUris[0] !== collectTopicUri) {
    throw new Error("review prompt bundle should carry the same bounded resource URI list");
  }
  if (!reviewTask.promptBundle.text.includes(collectTopicUri)) {
    throw new Error("review prompt bundle text should point the IDE agent at the required topic resource");
  }

  const summary = parseToolJson(await client.callTool({
    name: "workflow.summarize",
    arguments: { sessionId: started.sessionId, appStateDir },
  }));
  if (!summary.topics?.some((topic) => topic.topic === "ci.collect" && topic.latestSummary === "Collected through MCP")) {
    throw new Error("workflow.summarize tool should include published blackboard topic summaries");
  }
} finally {
  await client.close().catch(() => undefined);
}
NODE
pass "MCP workflow tools 暴露 start/next/publish/summarize，并返回带 promptBundle 的 Data Plane Task"
rm -rf "$workflow_app_state_dir"

# ── 17. Export transaction ─────────────────────────────────────────────────
echo ""
echo "→ 17/24 Export transaction..."

export_dir=".skill-central-export-ci"
rm -rf "$export_dir"

export_plan=$(node dist/index.js export --target cursor --intent ci-workflow --out "$export_dir" --dry-run)
printf '%s' "$export_plan" | grep -q "Export plan" \
  && printf '%s' "$export_plan" | grep -q "create .cursor/rules/test-v1-workflow.mdc" \
  && pass "export --dry-run 列出将写入文件" \
  || fail "export --dry-run 输出不完整"

if [ -e "$export_dir/.cursor/rules/test-v1-workflow.mdc" ]; then
  fail "export --dry-run 不应写入文件"
fi
pass "export --dry-run 无文件写入"

node dist/index.js export --target cursor --intent ci-workflow --out "$export_dir" \
  && [ -f "$export_dir/.cursor/rules/test-v1-workflow.mdc" ] \
  && [ -f "$export_dir/.cursor/rules/test-v1-workflow.degradation.ide.agent.experimentalMissing.md" ] \
  && pass "export 实际写入 adapter 产物和降级说明" \
  || fail "export 实际写入失败"

printf 'user edits\n' > "$export_dir/.cursor/rules/test-v1-workflow.mdc"
set +e
export_conflict=$(node dist/index.js export --target cursor --intent ci-workflow --out "$export_dir" 2>&1)
export_conflict_status=$?
set -e
if [ "$export_conflict_status" -eq 0 ]; then
  fail "export 默认不应覆盖不同内容"
fi
printf '%s' "$export_conflict" | grep -q "Export has conflicts" \
  && grep -q "user edits" "$export_dir/.cursor/rules/test-v1-workflow.mdc" \
  && pass "export 默认拒绝静默覆盖" \
  || fail "export conflict 保护不完整"

node dist/index.js export --target cursor --intent ci-workflow --out "$export_dir" --force \
  && ls "$export_dir/.cursor/rules"/test-v1-workflow.mdc.bak.* >/dev/null 2>&1 \
  && grep -q "skill: test-v1-workflow" "$export_dir/.cursor/rules/test-v1-workflow.mdc" \
  && pass "export --force 创建备份后覆盖" \
  || fail "export --force 备份覆盖失败"

stdout_export=$(node dist/index.js export --target windsurf --intent ci-workflow --out "$export_dir/stdout-only" --stdout)
printf '%s' "$stdout_export" | grep -q -- "--- .windsurf/rules/test-v1-workflow.md" \
  && [ ! -e "$export_dir/stdout-only/.windsurf/rules/test-v1-workflow.md" ] \
  && pass "export --stdout 只输出产物不写文件" \
  || fail "export --stdout 行为不正确"

rm -rf "$export_dir"

# ── 18. IDE connection health ──────────────────────────────────────────────
echo ""
echo "→ 18/24 IDE connection health..."

ide_health_dir=".skill-central-ide-health-ci"
mkdir -p "$ide_health_dir"
ide_config="$ide_health_dir/cursor-mcp.json"
printf '{}\n' > "$ide_config"

ide_health=$(node dist/index.js doctor --ide cursor --config-path "$ide_config" --json)
IDE_HEALTH_JSON="$ide_health" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.IDE_HEALTH_JSON);
const health = report.ideHealth;
if (!health) throw new Error("missing ideHealth report");
if (health.target !== "cursor") throw new Error(`unexpected target ${health.target}`);
if (health.status !== "not-registered") throw new Error(`expected not-registered, got ${health.status}`);
if (health.registryLoadedSkillCount !== health.registryPromptCount + health.registryToolCount) {
  throw new Error("registry loadedSkillCount baseline is inconsistent");
}
if (!health.nextActions.some((action) => action.includes("skill-central register cursor"))) {
  throw new Error("missing actionable registration guidance");
}
NODE
pass "doctor --ide 输出结构化未注册健康报告"

ide_health_human=$(node dist/index.js doctor --ide cursor --config-path "$ide_config")
printf '%s' "$ide_health_human" | grep -q "IDE connection health" \
  && printf '%s' "$ide_health_human" | grep -q "Status      : not-registered" \
  && pass "doctor --ide 人类输出包含状态和修复建议" \
  || fail "doctor --ide 人类输出不完整"

cat > "$ide_config" <<JSON
{
  "mcpServers": {
    "skill-central": {
      "command": "node",
      "args": ["dist/index.js", "mcp"]
    }
  }
}
JSON

ide_registered=$(node dist/index.js doctor --ide cursor --config-path "$ide_config" --json)
IDE_REGISTERED_JSON="$ide_registered" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.IDE_REGISTERED_JSON);
const health = report.ideHealth;
if (health.status !== "registered") throw new Error(`expected registered, got ${health.status}`);
if (health.serverCommand !== "node") throw new Error(`unexpected command ${health.serverCommand}`);
if (!health.nextActions.some((action) => action.includes("--verify"))) {
  throw new Error("registered health report should point to --verify");
}
NODE
pass "doctor --ide 已注册配置默认不启动 MCP probe"

ide_verified=$(node dist/index.js doctor --ide cursor --config-path "$ide_config" --verify --json)
IDE_VERIFIED_JSON="$ide_verified" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.IDE_VERIFIED_JSON);
const health = report.ideHealth;
if (health.status !== "connected") throw new Error(`expected connected, got ${health.status}: ${health.errorSummary}`);
if (health.promptCount !== health.registryPromptCount) {
  throw new Error(`prompt count drift: ${health.promptCount} vs ${health.registryPromptCount}`);
}
if (health.toolCount !== health.registryToolCount) {
  throw new Error(`tool count drift: ${health.toolCount} vs ${health.registryToolCount}`);
}
if (health.loadedSkillCount !== health.promptCount + health.toolCount) {
  throw new Error("loadedSkillCount must equal promptCount + toolCount");
}
if (!health.serverVersion || !health.serverVersion.startsWith("skill-central@")) {
  throw new Error(`missing server version: ${health.serverVersion}`);
}
NODE
pass "doctor --ide --verify 完成 MCP initialize/prompts/list/tools/list probe"

rm -rf "$ide_health_dir"

# ── 19. One-click connect plan ─────────────────────────────────────────────
echo ""
echo "→ 19/24 One-click connect plan..."

connect_dir=".skill-central-connect-ci"
mkdir -p "$connect_dir"
connect_config="$connect_dir/cursor-mcp.json"
cat > "$connect_config" <<'JSON'
{
  "mcpServers": {
    "existing-server": {
      "command": "existing",
      "args": ["serve"]
    }
  }
}
JSON

connect_dry_run=$(node dist/index.js connect --target cursor --config-path "$connect_config" --dry-run --json)
CONNECT_DRY_RUN_JSON="$connect_dry_run" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.CONNECT_DRY_RUN_JSON);
if (plan.target !== "cursor") throw new Error(`unexpected target ${plan.target}`);
if (!plan.diffPreview.includes("skill-central")) throw new Error("connect plan missing skill-central diff");
if (!plan.steps.some((step) => step.kind === "backup" && step.status === "pending")) {
  throw new Error("connect plan should require backup for existing config");
}
NODE
grep -q "existing-server" "$connect_config" \
  && ! grep -q "skill-central" "$connect_config" \
  && pass "connect --dry-run 只预览不写配置" \
  || fail "connect --dry-run 写入了配置"

connect_apply=$(node dist/index.js connect --target cursor --config-path "$connect_config" --verify --json)
CONNECT_APPLY_JSON="$connect_apply" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.CONNECT_APPLY_JSON);
if (!plan.backupPath) throw new Error("connect apply missing backup path");
if (!plan.steps.some((step) => step.kind === "write" && step.status === "applied")) {
  throw new Error("connect apply did not mark write applied");
}
if (!plan.health || plan.health.status !== "connected") {
  throw new Error(`connect verify failed: ${plan.health?.status} ${plan.health?.errorSummary}`);
}
NODE
connect_backup_path=$(CONNECT_APPLY_JSON="$connect_apply" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.CONNECT_APPLY_JSON);
process.stdout.write(plan.backupPath);
NODE
)

grep -q "existing-server" "$connect_config" \
  && grep -q "skill-central" "$connect_config" \
  && [ -f "$connect_backup_path" ] \
  && pass "connect 写入配置、保留已有 server 并创建备份" \
  || fail "connect apply 行为不完整"

node dist/index.js connect --target cursor --config-path "$connect_config" --rollback --backup-path "$connect_backup_path" --json > /dev/null
grep -q "existing-server" "$connect_config" \
  && ! grep -q "skill-central" "$connect_config" \
  && pass "connect --rollback 从备份恢复配置" \
  || fail "connect rollback 未恢复配置"

new_connect_config="$connect_dir/new-cursor-mcp.json"
node dist/index.js connect --target cursor --config-path "$new_connect_config" --json > /dev/null
[ -f "$new_connect_config" ] \
  && pass "connect 可创建新的 IDE 配置文件" \
  || fail "connect 未创建新的 IDE 配置文件"
node dist/index.js connect --target cursor --config-path "$new_connect_config" --rollback --json > /dev/null
[ ! -e "$new_connect_config" ] \
  && pass "connect 新建配置 rollback 会删除文件" \
  || fail "connect 新建配置 rollback 不应留下空 JSON 文件"

malformed_config="$connect_dir/malformed-cursor-mcp.json"
printf '{ invalid json\n' > "$malformed_config"
set +e
malformed_output=$(node dist/index.js connect --target cursor --config-path "$malformed_config" --dry-run --json 2>&1)
malformed_status=$?
set -e
if [ "$malformed_status" -eq 0 ]; then
  fail "connect 对异常 JSON 配置不应生成写入计划"
fi
printf '%s' "$malformed_output" | grep -q "not readable JSON" \
  && grep -q "{ invalid json" "$malformed_config" \
  && pass "connect 对异常 IDE config 明确阻断且不写文件" \
  || fail "connect 异常 IDE config 保护不完整"

codex_config="$connect_dir/codex-config.toml"
cat > "$codex_config" <<'TOML'
# user comment must survive
model = "test-model"

[mcp_servers.existing]
command = "existing"
args = ["serve"]
TOML

codex_dry_run=$(node dist/index.js connect --target codex --config-path "$codex_config" --dry-run --json)
CODEX_DRY_RUN_JSON="$codex_dry_run" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.CODEX_DRY_RUN_JSON);
if (plan.target !== "codex" || plan.configFormat !== "toml") {
  throw new Error(`unexpected Codex plan: ${plan.target}/${plan.configFormat}`);
}
if (!plan.diffPreview.includes("mcp_servers.skill-central")) {
  throw new Error("Codex plan missing TOML MCP table");
}
NODE
grep -q "user comment must survive" "$codex_config" \
  && ! grep -q "mcp_servers.skill-central" "$codex_config" \
  && pass "Codex connect dry-run 生成 TOML 计划且不写配置" \
  || fail "Codex connect dry-run 修改了 TOML"

codex_apply=$(node dist/index.js connect --target codex --config-path "$codex_config" --json)
codex_backup_path=$(CODEX_APPLY_JSON="$codex_apply" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.CODEX_APPLY_JSON);
if (plan.configFormat !== "toml" || !plan.backupPath) throw new Error("Codex apply missing TOML/backup evidence");
process.stdout.write(plan.backupPath);
NODE
)
grep -q "user comment must survive" "$codex_config" \
  && grep -q "mcp_servers.existing" "$codex_config" \
  && grep -q "mcp_servers.skill-central" "$codex_config" \
  && [ -f "$codex_backup_path" ] \
  && pass "Codex connect 保留注释和其他 MCP table 并创建备份" \
  || fail "Codex TOML merge 或备份不完整"

node dist/index.js connect --target codex --config-path "$codex_config" --rollback --backup-path "$codex_backup_path" --json > /dev/null
grep -q "user comment must survive" "$codex_config" \
  && grep -q "mcp_servers.existing" "$codex_config" \
  && ! grep -q "mcp_servers.skill-central" "$codex_config" \
  && pass "Codex connect rollback 恢复原始 TOML" \
  || fail "Codex connect rollback 未恢复 TOML"

for target in trae claude; do
  target_plan=$(node dist/index.js connect --target "$target" --config-path "$connect_dir/$target-mcp.json" --dry-run --json)
  TARGET_PLAN_JSON="$target_plan" TARGET_NAME="$target" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.TARGET_PLAN_JSON);
if (plan.target !== process.env.TARGET_NAME || plan.configFormat !== "json") {
  throw new Error(`unexpected target plan ${plan.target}/${plan.configFormat}`);
}
if (!plan.diffPreview.includes("skill-central")) throw new Error("target plan missing MCP server");
NODE
done
pass "Trae 与 Claude 可生成 JSON MCP 连接计划"

rm -rf "$connect_dir"

# ── 20. Web local console APIs ─────────────────────────────────────────────
echo ""
echo "→ 20/24 Web local console APIs..."

web_dir=".skill-central-web-ci"
mkdir -p "$web_dir"
web_config="$web_dir/cursor-mcp.json"
web_registry_dir="$web_dir/registry"
web_apply_registry_dir="$web_dir/apply-registry"
web_app_state_dir="$web_dir/app-state"
printf '{}\n' > "$web_config"
mkdir -p "$web_registry_dir/layers/global" "$web_apply_registry_dir/layers/global" "$web_app_state_dir/audit" .skills/web-sync-ci
cat > "$web_registry_dir/manifest.yaml" <<'YAML'
schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: octocat
defaults:
  visibility: private
  syncMode: bidirectional
layers:
  - id: 01-global
    path: layers/global
    scope: user
    sync:
      enabled: true
      direction: bidirectional
    visibility: private
YAML

cat > "$web_registry_dir/layers/global/web-remote-only.yaml" <<'YAML'
schemaVersion: skillcentral.dev/v1
id: web-remote-only
name: Web Remote Only
description: Web sync plan fixture
type: prompt
prompt: "remote only"
YAML

cat > "$web_apply_registry_dir/manifest.yaml" <<'YAML'
schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: octocat
defaults:
  visibility: private
  syncMode: bidirectional
layers:
  - id: web-sync-ci
    path: layers/global
    scope: user
    sync:
      enabled: true
      direction: bidirectional
    visibility: private
YAML

cat > "$web_apply_registry_dir/layers/global/web-apply-create-local.yaml" <<'YAML'
schemaVersion: skillcentral.dev/v1
id: web-apply-create-local
name: Web Apply Create Local
description: Web sync apply fixture
type: prompt
prompt: "apply remote only"
YAML

cat > "$web_app_state_dir/audit/sync-apply.2026-07-29T00-00-00-000Z.json" <<'JSON'
{
  "schemaVersion": "skillcentral.dev/sync-apply/v1",
  "appliedAt": "2026-07-29T00:00:00.000Z",
  "planHash": "audit-fixture",
  "direction": "pull",
  "remoteRoot": ".skill-central-web-ci/registry",
  "force": false,
  "preflightBlocked": true,
  "auditPath": ".skill-central-web-ci/app-state/audit/sync-apply.2026-07-29T00-00-00-000Z.json",
  "operations": [
    {
      "plannedStatus": "conflict",
      "applyStatus": "blocked",
      "layerId": "01-global",
      "relativePath": "web-conflict.yaml",
      "reason": "planned conflict requires an explicit resolution before apply"
    }
  ],
  "counts": {
    "applied": 0,
    "skipped": 0,
    "blocked": 1
  }
}
JSON

cat > "$web_app_state_dir/audit/sync-apply.2026-07-29T00-00-02-000Z.json" <<'JSON'
{
  "schemaVersion": "skillcentral.dev/sync-apply/v1",
  "appliedAt": "2026-07-29T00:00:02.000Z",
  "planHash": "audit-fixture-applied",
  "direction": "push",
  "remoteRoot": ".skill-central-web-ci/registry",
  "force": true,
  "preflightBlocked": false,
  "auditPath": ".skill-central-web-ci/app-state/audit/sync-apply.2026-07-29T00-00-02-000Z.json",
  "operations": [
    {
      "plannedStatus": "create-remote",
      "applyStatus": "applied",
      "layerId": "01-global",
      "relativePath": "web-created-remote.yaml",
      "reason": "created remote file from local"
    }
  ],
  "counts": {
    "applied": 1,
    "skipped": 0,
    "blocked": 0
  }
}
JSON

node --input-type=module <<'NODE'
import { createBoardApp } from "./dist/web/server.js";
import { SkillEngine } from "./dist/core/engine.js";
import { loadConfig } from "./dist/storage/config.js";
import { compileIntentDryRun } from "./dist/compiler/compiler.js";
import { LocalRuntimeManager } from "./dist/runtime/manager.js";

const config = loadConfig();
const engine = new SkillEngine();
await engine.reload(config.layers);
const runtime = {
  snapshot: {
    status: "stopped",
    transport: "stdio",
    command: "node",
    args: ["dist/index.js", "mcp"],
    stdoutLines: [],
    stderrLines: [],
  },
  getSnapshot() {
    return this.snapshot;
  },
  start() {
    this.snapshot = { ...this.snapshot, status: "running", pid: 1234, startedAt: "2026-07-29T00:00:00.000Z" };
    return this.snapshot;
  },
  async stop() {
    this.snapshot = { ...this.snapshot, status: "stopped", stoppedAt: "2026-07-29T00:00:01.000Z" };
    return this.snapshot;
  },
};
let storedToken;
const tokenStore = {
  async checkAvailability() {},
  async get() { return storedToken; },
  async set(token) {
    const now = "2026-07-30T00:00:00.000Z";
    storedToken = { ...token, createdAt: now, updatedAt: now };
    return storedToken;
  },
  async delete() { storedToken = undefined; },
  describe() { return { kind: "development-file", productionReady: false }; },
};
let githubFactoryClientId;
const githubClientFactory = (clientId) => {
  githubFactoryClientId = clientId;
  return ({
  async requestDeviceCode() {
    return {
      deviceCode: "private-device-code",
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 1,
    };
  },
  async pollForToken() {
    return { accessToken: "private-access-token", tokenType: "bearer", scope: "repo" };
  },
  async fetchUser() { return { id: 1, login: "octocat", name: "Octo Cat" }; },
  });
};
let updateChecks = 0;
let updateInstalls = 0;
let updateSnapshot = {
  supported: true,
  provider: "homebrew",
  currentVersion: "1.0.0-alpha.0",
  status: "idle",
};
const updater = {
  getSnapshot() { return { ...updateSnapshot }; },
  async check() {
    updateChecks += 1;
    updateSnapshot = { ...updateSnapshot, status: "available", availableVersion: "1.0.0-alpha.1" };
    return { ...updateSnapshot };
  },
  async install() {
    updateInstalls += 1;
    updateSnapshot = { ...updateSnapshot, status: "ready", progressPercent: 100 };
    return { ...updateSnapshot };
  },
};
const app = createBoardApp({
  config,
  engine,
  rootDir: process.cwd(),
  version: "test",
  runtime,
  tokenStore,
  githubOAuthClientId: "project-client-fixture",
  githubClientFactory,
  updater,
});

const updateStatus = await (await app.request("/api/update/status")).json();
if (!updateStatus.supported || updateStatus.status !== "idle") {
  throw new Error("web update status did not expose updater snapshot");
}
const updateCheck = await (await app.request("/api/update/check", { method: "POST" })).json();
if (updateCheck.availableVersion !== "1.0.0-alpha.1" || updateChecks !== 1) {
  throw new Error("web update check did not call updater");
}
const updateInstall = await (await app.request("/api/update/install", { method: "POST" })).json();
if (updateInstall.status !== "ready" || updateInstalls !== 1) {
  throw new Error("web update install did not call updater");
}
const crossOriginCheck = await app.request("/api/update/check", {
  method: "POST",
  headers: { origin: "https://attacker.example" },
});
if (crossOriginCheck.status !== 403 || updateChecks !== 1) {
  throw new Error("web update check did not reject a cross-origin request");
}
const crossOriginInstall = await app.request("/api/update/install", {
  method: "POST",
  headers: { origin: "null" },
});
if (crossOriginInstall.status !== 403 || updateInstalls !== 1) {
  throw new Error("web update install did not reject an opaque origin");
}
const sameOriginCheck = await app.request("http://localhost/api/update/check", {
  method: "POST",
  headers: { origin: "http://localhost" },
});
if (sameOriginCheck.status !== 200 || updateChecks !== 2) {
  throw new Error("web update check rejected its own origin");
}

const ideTargetsRes = await app.request("/api/ide-targets");
const ideTargets = await ideTargetsRes.json();
for (const [target, format] of [["codex", "toml"], ["trae", "json"], ["claude", "json"]]) {
  const entry = ideTargets.find((candidate) => candidate.target === target);
  if (!entry || entry.configFormat !== format || !entry.configPath) {
    throw new Error(`web IDE metadata missing ${target}/${format}`);
  }
}

const githubStatusBefore = await (await app.request("/api/auth/github/status")).json();
if (githubStatusBefore.loggedIn || JSON.stringify(githubStatusBefore).includes("private-access-token")) {
  throw new Error("GitHub status leaked token or started logged in");
}
const crossOriginGithubDevice = await app.request("http://localhost/api/auth/github/device", {
  method: "POST",
  headers: { origin: "https://attacker.example" },
});
if (crossOriginGithubDevice.status !== 403) {
  throw new Error("GitHub device flow did not reject a cross-origin request");
}
const githubDeviceRes = await app.request("/api/auth/github/device", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ clientId: "attacker-client-fixture" }),
});
const githubDevice = await githubDeviceRes.json();
if (!githubDevice.flowId || githubDevice.userCode !== "ABCD-1234") {
  throw new Error("GitHub device flow did not return public authorization data");
}
if (githubFactoryClientId !== "project-client-fixture") {
  throw new Error(`GitHub device flow accepted an untrusted client id: ${githubFactoryClientId}`);
}
if (JSON.stringify(githubDevice).includes("private-device-code")) {
  throw new Error("GitHub device endpoint leaked device code");
}
const githubPollRes = await app.request("/api/auth/github/poll", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ flowId: githubDevice.flowId }),
});
const githubPoll = await githubPollRes.json();
if (!githubPoll.loggedIn || githubPoll.user?.login !== "octocat") {
  throw new Error("GitHub device polling did not complete login");
}
if (JSON.stringify(githubPoll).includes("private-access-token")) {
  throw new Error("GitHub poll endpoint leaked access token");
}
const githubStatusAfter = await (await app.request("/api/auth/github/status")).json();
if (!githubStatusAfter.loggedIn || JSON.stringify(githubStatusAfter).includes("private-access-token")) {
  throw new Error("GitHub status did not report safe logged-in metadata");
}
await app.request("/api/auth/github/logout", { method: "POST" });
if (storedToken) throw new Error("GitHub logout did not clear TokenStore");
const crossOriginGithubLogout = await app.request("http://localhost/api/auth/github/logout", {
  method: "POST",
  headers: { origin: "null" },
});
if (crossOriginGithubLogout.status !== 403) {
  throw new Error("GitHub logout did not reject an opaque origin");
}

const unconfiguredApp = createBoardApp({
  config,
  engine,
  rootDir: process.cwd(),
  version: "test",
  runtime,
  tokenStore,
  githubClientFactory,
});
const unconfiguredStatus = await (await unconfiguredApp.request("/api/auth/github/status")).json();
if (unconfiguredStatus.loginAvailable !== false || !unconfiguredStatus.configurationError?.includes("SKILL_CENTRAL_GITHUB_CLIENT_ID")) {
  throw new Error(`GitHub status did not explain missing packaged configuration: ${JSON.stringify(unconfiguredStatus)}`);
}
const unconfiguredDevice = await unconfiguredApp.request("/api/auth/github/device", { method: "POST" });
const unconfiguredError = await unconfiguredDevice.json();
if (unconfiguredDevice.status !== 503 || unconfiguredError.code !== "GITHUB_OAUTH_NOT_CONFIGURED") {
  throw new Error(`GitHub device endpoint did not expose a stable configuration error: ${JSON.stringify(unconfiguredError)}`);
}

const authDiagnostics = [];
const leakingTokenStore = {
  async checkAvailability() { throw new Error("private-device-code private-access-token"); },
  async get() { throw new Error("private-device-code private-access-token"); },
  async set() { throw new Error("private-device-code private-access-token"); },
  async delete() { throw new Error("private-device-code private-access-token"); },
  describe() { return { kind: "os-keychain", productionReady: true }; },
};
const redactedAuthApp = createBoardApp({
  config,
  engine,
  rootDir: process.cwd(),
  version: "test",
  runtime,
  tokenStore: leakingTokenStore,
  githubOAuthClientId: "project-client-fixture",
  githubClientFactory,
  authLogger: (event) => authDiagnostics.push(event),
});
for (const [url, method] of [
  ["/api/auth/github/status", "GET"],
  ["/api/auth/github/device", "POST"],
  ["/api/auth/github/logout", "POST"],
]) {
  const response = await redactedAuthApp.request(url, { method });
  const body = await response.text();
  if (body.includes("private-device-code") || body.includes("private-access-token")) {
    throw new Error(`GitHub ${url} response leaked a credential-bearing error`);
  }
}
const diagnosticText = JSON.stringify(authDiagnostics);
if (diagnosticText.includes("private-device-code") || diagnosticText.includes("private-access-token")) {
  throw new Error("GitHub auth diagnostic logger received a credential-bearing error");
}
const brokenLoggerApp = createBoardApp({
  config,
  engine,
  rootDir: process.cwd(),
  version: "test",
  runtime,
  tokenStore: leakingTokenStore,
  githubOAuthClientId: "project-client-fixture",
  githubClientFactory,
  authLogger: () => { throw new Error("diagnostic sink failed"); },
});
const brokenLoggerStatus = await brokenLoggerApp.request("/api/auth/github/status");
if (brokenLoggerStatus.status !== 503) {
  throw new Error("broken auth diagnostic logger changed the API failure contract");
}

const skillsRes = await app.request("/api/skills");
const skills = await skillsRes.json();
if (!skills.some((skill) => skill.id === "test-v1-workflow" && skill.status === "effective")) {
  throw new Error("web skills API missing resolution status");
}

const resolutionRes = await app.request("/api/skills/test-layer-shadow/resolution");
const resolution = await resolutionRes.json();
if (resolution.status !== "effective") {
  throw new Error(`expected effective resolution, got ${resolution.status}`);
}
if (!resolution.candidates.some((candidate) => candidate.status === "shadowed")) {
  throw new Error("web resolution API missing shadowed candidate");
}

const compileRes = await app.request("/api/compile/preview", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ target: "cursor", intent: "ci-workflow" }),
});
const bundle = await compileRes.json();
const direct = compileIntentDryRun(engine.listResolutionRecords(), { target: "cursor", intent: "ci-workflow" });
if (bundle.hash !== direct.hash) {
  throw new Error(`web compile hash drift: ${bundle.hash} !== ${direct.hash}`);
}

const healthRes = await app.request(`/api/ide-health?target=cursor&configPath=${encodeURIComponent(".skill-central-web-ci/cursor-mcp.json")}`);
const health = await healthRes.json();
if (health.status !== "not-registered") {
  throw new Error(`expected not-registered health, got ${health.status}`);
}

const planRes = await app.request("/api/connect/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ target: "cursor", configPath: ".skill-central-web-ci/cursor-mcp.json" }),
});
const plan = await planRes.json();
if (!plan.diffPreview.includes("skill-central")) {
  throw new Error("web connect plan missing skill-central diff");
}
if (plan.steps.some((step) => step.kind === "write" && step.status === "applied")) {
  throw new Error("web connect plan should not apply writes");
}

const applyRes = await app.request("/api/connect/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ target: "cursor", configPath: ".skill-central-web-ci/cursor-mcp.json", verify: true }),
});
const applied = await applyRes.json();
if (!applied.steps.some((step) => step.kind === "write" && step.status === "applied")) {
  throw new Error("web connect apply did not write config");
}
if (!applied.health || applied.health.status !== "connected") {
  throw new Error(`web connect apply verify failed: ${applied.health?.status}`);
}

const rollbackRes = await app.request("/api/connect/rollback", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    target: "cursor",
    configPath: ".skill-central-web-ci/cursor-mcp.json",
    backupPath: applied.backupPath,
  }),
});
const rolledBack = await rollbackRes.json();
if (!rolledBack.steps.some((step) => step.kind === "rollback" && step.status === "applied")) {
  throw new Error("web connect rollback did not mark rollback applied");
}

const runtimeStatusRes = await app.request("/api/runtime/status");
const runtimeStatus = await runtimeStatusRes.json();
if (runtimeStatus.status !== "stopped") {
  throw new Error(`expected stopped runtime, got ${runtimeStatus.status}`);
}
const runtimeStartRes = await app.request("/api/runtime/start", { method: "POST" });
const runtimeStarted = await runtimeStartRes.json();
if (runtimeStarted.status !== "running" || runtimeStarted.pid !== 1234) {
  throw new Error("web runtime start did not expose running snapshot");
}
const runtimeStopRes = await app.request("/api/runtime/stop", { method: "POST" });
const runtimeStopped = await runtimeStopRes.json();
if (runtimeStopped.status !== "stopped") {
  throw new Error("web runtime stop did not expose stopped snapshot");
}

const manager = new LocalRuntimeManager({
  command: process.execPath,
  args: ["-e", "console.error('runtime smoke'); setTimeout(() => {}, 10000);"],
  maxLogLines: 5,
});
const started = manager.start();
if (started.status !== "running" || !started.pid) {
  throw new Error("LocalRuntimeManager did not start child process");
}
await new Promise((resolve) => setTimeout(resolve, 150));
const stopped = await manager.stop();
if (stopped.status !== "stopped") {
  throw new Error(`LocalRuntimeManager did not stop cleanly: ${stopped.status}`);
}
if (!stopped.stderrLines.some((line) => line.includes("runtime smoke"))) {
  throw new Error("LocalRuntimeManager did not capture diagnostic stderr");
}

const syncStatusRes = await app.request("/api/sync/status?appStateDir=.skill-central-web-ci/app-state");
const syncStatus = await syncStatusRes.json();
if (!syncStatus.localFirst || !syncStatus.appState.paths.audit.endsWith(".skill-central-web-ci/app-state/audit")) {
  throw new Error("web sync status did not expose app state boundary");
}
if (!syncStatus.layers.some((layer) => layer.id === "01-global" && layer.syncEnabled)) {
  throw new Error("web sync status missing layer sync policy");
}

const syncPlanRes = await app.request("/api/sync/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ registryDir: ".skill-central-web-ci/registry", direction: "both" }),
});
const syncPlan = await syncPlanRes.json();
if (syncPlan.direction !== "both" || syncPlan.dryRun !== true) {
  throw new Error("web sync plan should be a dry-run both plan");
}
if (!syncPlan.operations.some((op) => op.status === "create-local" && op.relativePath === "web-remote-only.yaml")) {
  throw new Error("web sync plan missing create-local fixture");
}

const badSyncPlanRes = await app.request("/api/sync/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ direction: "both" }),
});
if (badSyncPlanRes.status !== 400) {
  throw new Error("web sync plan should require registryDir");
}

const syncAuditsRes = await app.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=5");
const syncAudits = await syncAuditsRes.json();
if (!syncAudits.some((audit) => audit.planHash === "audit-fixture" && audit.preflightBlocked)) {
  throw new Error("web sync audits missing preflightBlocked audit fixture");
}

const syncAuditsPage1Res = await app.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=1&page=true");
const syncAuditsPage1 = await syncAuditsPage1Res.json();
if (syncAuditsPage1Res.status !== 200 || syncAuditsPage1.items.length !== 1 || !syncAuditsPage1.nextCursor) {
  throw new Error("web sync audits should return paged response with nextCursor");
}
if (syncAuditsPage1.items[0].planHash !== "audit-fixture-applied") {
  throw new Error("web sync audits first page should be newest audit");
}
const syncAuditsPage2Res = await app.request(`/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=1&page=true&cursor=${encodeURIComponent(syncAuditsPage1.nextCursor)}`);
const syncAuditsPage2 = await syncAuditsPage2Res.json();
if (syncAuditsPage2.items.length !== 1 || syncAuditsPage2.items[0].planHash !== "audit-fixture") {
  throw new Error("web sync audits cursor should continue after previous page");
}

const syncAuditsBlockedRes = await app.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=5&outcome=blocked&direction=pull&layer=01-global&since=2026-07-28T00%3A00%3A00.000Z&until=2026-07-30T00%3A00%3A00.000Z");
const syncAuditsBlocked = await syncAuditsBlockedRes.json();
if (syncAuditsBlockedRes.status !== 200 || syncAuditsBlocked.length !== 1 || syncAuditsBlocked[0].planHash !== "audit-fixture") {
  throw new Error("web sync audits should support combined blocked/direction/layer/time filters");
}
const syncAuditsFilteredOutRes = await app.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=5&outcome=blocked&direction=push");
const syncAuditsFilteredOut = await syncAuditsFilteredOutRes.json();
if (syncAuditsFilteredOut.length !== 0) {
  throw new Error("web sync audits direction filter should exclude non-matching reports");
}
const syncAuditsWindowOutRes = await app.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=5&since=2026-07-29T00%3A00%3A03.000Z");
const syncAuditsWindowOut = await syncAuditsWindowOutRes.json();
if (syncAuditsWindowOut.length !== 0) {
  throw new Error("web sync audits should prefilter reports outside filename time window");
}
const syncAuditsBadRangeRes = await app.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&since=2026-07-30T00%3A00%3A00.000Z&until=2026-07-28T00%3A00%3A00.000Z");
if (syncAuditsBadRangeRes.status !== 400) {
  throw new Error("web sync audits should reject invalid time ranges");
}

const syncConfig = {
  layers: [
    {
      id: "web-sync-ci",
      name: "Web Sync CI",
      path: ".skills/web-sync-ci",
      scope: "user",
      priority: 10,
      writable: true,
      trust: "local",
      sync: { enabled: true },
      visibility: "private",
    },
  ],
};
const syncEngine = new SkillEngine();
await syncEngine.reload(syncConfig.layers);
// Web sync apply has write access, so keep it in an isolated app/config pair.
// This prevents the fixture from touching real user layers such as
// .skills/01-global during integration tests.
const syncApp = createBoardApp({ config: syncConfig, engine: syncEngine, rootDir: process.cwd(), version: "test", runtime });

const syncApplyMissingConfirmRes = await syncApp.request("/api/sync/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ registryDir: ".skill-central-web-ci/apply-registry", direction: "pull" }),
});
if (syncApplyMissingConfirmRes.status !== 400) {
  throw new Error("web sync apply should require confirmation phrase");
}

const syncApplyRes = await syncApp.request("/api/sync/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    registryDir: ".skill-central-web-ci/apply-registry",
    direction: "pull",
    confirm: "APPLY SYNC",
    appStateDir: ".skill-central-web-ci/app-state",
  }),
});
const syncApply = await syncApplyRes.json();
if (syncApplyRes.status !== 200 || syncApply.preflightBlocked !== false) {
  throw new Error(`web sync apply should succeed for create-local fixture; got ${syncApplyRes.status}`);
}
if (!syncApply.operations.some((op) => op.applyStatus === "applied" && op.plannedStatus === "create-local")) {
  throw new Error("web sync apply missing applied create-local operation");
}
const appliedLocal = await import("node:fs/promises").then((fs) =>
  fs.readFile(".skills/web-sync-ci/web-apply-create-local.yaml", "utf-8"),
);
if (!appliedLocal.includes('prompt: "apply remote only"')) {
  throw new Error("web sync apply wrote unexpected local content");
}

await import("node:fs/promises").then(async (fs) => {
  await fs.writeFile(".skill-central-web-ci/apply-registry/layers/global/web-apply-conflict.yaml", `schemaVersion: skillcentral.dev/v1
id: web-apply-conflict
name: Web Apply Conflict
description: Web sync conflict remote fixture
type: prompt
prompt: "remote conflict"
`, "utf-8");
  await fs.writeFile(".skills/web-sync-ci/web-apply-conflict.yaml", `schemaVersion: skillcentral.dev/v1
id: web-apply-conflict
name: Web Apply Conflict
description: Web sync conflict local fixture
type: prompt
prompt: "local conflict"
`, "utf-8");
});

const syncConflictPlanRes = await syncApp.request("/api/sync/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ registryDir: ".skill-central-web-ci/apply-registry", direction: "both" }),
});
const syncConflictPlan = await syncConflictPlanRes.json();
const syncConflict = syncConflictPlan.operations.find((op) =>
  op.status === "conflict" && op.relativePath === "web-apply-conflict.yaml"
);
if (!syncConflict) {
  throw new Error("web sync plan missing isolated conflict fixture");
}
if (!syncConflict.diffPreview || !syncConflict.diffPreview.includes("-prompt: \"local conflict\"") || !syncConflict.diffPreview.includes("+prompt: \"remote conflict\"")) {
  throw new Error("web sync conflict plan missing local/remote diff preview");
}

const syncConflictSkipRes = await syncApp.request("/api/sync/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    registryDir: ".skill-central-web-ci/apply-registry",
    direction: "both",
    confirm: "APPLY SYNC",
    appStateDir: ".skill-central-web-ci/app-state",
    resolutions: [{
      layerId: syncConflict.layerId,
      relativePath: syncConflict.relativePath,
      choice: "skip",
      expectedLocalHash: syncConflict.localHash,
      expectedRemoteHash: syncConflict.remoteHash,
    }],
  }),
});
const syncConflictSkip = await syncConflictSkipRes.json();
if (syncConflictSkipRes.status !== 200 || syncConflictSkip.preflightBlocked !== false) {
  throw new Error(`web sync conflict skip should clear preflight; got ${syncConflictSkipRes.status}`);
}
if (!syncConflictSkip.operations.some((op) => op.plannedStatus === "noop" && op.applyStatus === "skipped")) {
  throw new Error("web sync conflict skip did not convert conflict to noop");
}
const skippedLocal = await import("node:fs/promises").then((fs) =>
  fs.readFile(".skills/web-sync-ci/web-apply-conflict.yaml", "utf-8"),
);
if (!skippedLocal.includes('prompt: "local conflict"')) {
  throw new Error("web sync conflict skip should not overwrite local content");
}

const staleResolutionRes = await syncApp.request("/api/sync/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    registryDir: ".skill-central-web-ci/apply-registry",
    direction: "both",
    confirm: "APPLY SYNC",
    appStateDir: ".skill-central-web-ci/app-state",
    resolutions: [{
      layerId: syncConflict.layerId,
      relativePath: syncConflict.relativePath,
      choice: "use-remote",
      expectedLocalHash: "stale-local-hash",
      expectedRemoteHash: syncConflict.remoteHash,
    }],
  }),
});
if (staleResolutionRes.status !== 400) {
  throw new Error("web sync conflict resolution should reject stale local hash");
}

const syncConflictRemoteRes = await syncApp.request("/api/sync/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    registryDir: ".skill-central-web-ci/apply-registry",
    direction: "both",
    force: true,
    confirm: "APPLY SYNC",
    appStateDir: ".skill-central-web-ci/app-state",
    resolutions: [{
      layerId: syncConflict.layerId,
      relativePath: syncConflict.relativePath,
      choice: "use-remote",
      expectedLocalHash: syncConflict.localHash,
      expectedRemoteHash: syncConflict.remoteHash,
    }],
  }),
});
const syncConflictRemote = await syncConflictRemoteRes.json();
if (syncConflictRemoteRes.status !== 200 || syncConflictRemote.preflightBlocked !== false) {
  throw new Error(`web sync conflict use-remote should apply with force; got ${syncConflictRemoteRes.status}`);
}
const remoteApplyOperation = syncConflictRemote.operations.find((op) =>
  op.plannedStatus === "update-local" && op.applyStatus === "applied" && op.backupPath
);
if (!remoteApplyOperation) {
  throw new Error("web sync conflict use-remote should update local with backup");
}
const resolvedLocal = await import("node:fs/promises").then((fs) =>
  fs.readFile(".skills/web-sync-ci/web-apply-conflict.yaml", "utf-8"),
);
if (!resolvedLocal.includes('prompt: "remote conflict"')) {
  throw new Error("web sync conflict use-remote did not overwrite local content");
}

const auditFileRes = await syncApp.request(`/api/sync/audit-file?appStateDir=${encodeURIComponent(".skill-central-web-ci/app-state")}&path=${encodeURIComponent(syncConflictRemote.auditPath)}`);
const auditFile = await auditFileRes.json();
if (auditFileRes.status !== 200 || !auditFile.content.includes('"schemaVersion": "skillcentral.dev/sync-apply/v1"')) {
  throw new Error("web sync audit file endpoint should read recent app-state audit content");
}

const appliedAuditRes = await syncApp.request("/api/sync/audits?appStateDir=.skill-central-web-ci/app-state&limit=20&outcome=applied&direction=both&layer=web-sync-ci");
const appliedAudits = await appliedAuditRes.json();
if (!appliedAudits.some((audit) => audit.auditPath === syncConflictRemote.auditPath)) {
  throw new Error("web sync audits should filter applied reports by direction and layer");
}

const backupFileRes = await syncApp.request(`/api/sync/backup-file?appStateDir=${encodeURIComponent(".skill-central-web-ci/app-state")}&path=${encodeURIComponent(remoteApplyOperation.backupPath)}`);
const backupFile = await backupFileRes.json();
if (backupFileRes.status !== 200 || !backupFile.content.includes('prompt: "local conflict"')) {
  throw new Error("web sync backup file endpoint should read audit-referenced backup content");
}

const rejectedBackupRes = await syncApp.request(`/api/sync/backup-file?appStateDir=${encodeURIComponent(".skill-central-web-ci/app-state")}&path=${encodeURIComponent(".skills/web-sync-ci/web-apply-conflict.yaml")}`);
if (rejectedBackupRes.status !== 400) {
  throw new Error("web sync backup file endpoint should reject paths not referenced by recent audit reports");
}
NODE
pass "Web API 复用 compiler/health/connect/runtime/sync 底层能力并暴露 resolution 链"

if grep -q "skill-central" "$web_config"; then
  fail "Web connect rollback 后不应保留 skill-central 配置"
fi
pass "Web connect plan/apply/rollback 写入边界可验证"

rm -rf "$web_dir"
rm -rf .skills/web-sync-ci

# ── 21. 医生诊断 ─────────────────────────────────────────────────────────────
echo ""
echo "→ 21/24 医生诊断..."

node dist/index.js doctor \
  && pass "doctor 诊断通过" \
  || fail "doctor 诊断失败"

# ── 22. Phase 4A local app state / token boundary ─────────────────────────
echo ""
echo "→ 22/24 Phase 4A/B/C local app state / GitHub auth / registry scanner..."

app_state_dir=".skill-central-app-state-ci"
sync_status=$(node dist/index.js sync status --app-state-dir "$app_state_dir" --json)
SYNC_STATUS_JSON="$sync_status" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.SYNC_STATUS_JSON);
if (!report.localFirst) throw new Error("sync status must be local-first");
if (report.loggedIn !== false) throw new Error("fresh app state should not be logged in");
if (!report.appState.paths.root.endsWith(".skill-central-app-state-ci")) {
  throw new Error(`unexpected app state root ${report.appState.paths.root}`);
}
for (const key of ["state", "audit", "cache", "sync", "tokens", "sessions"]) {
  if (!report.appState.paths[key].includes(".skill-central-app-state-ci")) {
    throw new Error(`${key} path is outside override root`);
  }
}
if (report.tokenStore.kind !== "development-file") {
  throw new Error(`unexpected token store ${report.tokenStore.kind}`);
}
if (report.tokenStore.productionReady !== false) {
  throw new Error("development token store must not be production-ready");
}
NODE

[ -d "$app_state_dir/state" ] \
  && [ -d "$app_state_dir/audit" ] \
  && [ -d "$app_state_dir/cache" ] \
  && [ -d "$app_state_dir/sync" ] \
  && [ -d "$app_state_dir/tokens" ] \
  && [ -d "$app_state_dir/sessions" ] \
  && [ -f "$app_state_dir/state/app-state.json" ] \
  && pass "sync status 创建隔离 app state 目录" \
  || fail "sync status 未创建完整 app state 目录"

[ ! -e "$app_state_dir/.skills" ] \
  && [ ! -e skill-central.token.json ] \
  && pass "app state 与 skill source/project config 分离" \
  || fail "app state 不应包含 skill source 或项目 token 文件"

node --input-type=module <<'NODE'
import { DevelopmentFileTokenStore } from "./dist/auth/token-store.js";
const store = new DevelopmentFileTokenStore({ appStateDir: ".skill-central-app-state-ci" });
await store.set({
  provider: "github",
  accessToken: "ci-token",
  tokenType: "bearer",
  scope: "repo",
});
const token = await store.get("github");
if (!token || token.accessToken !== "ci-token") throw new Error("token store roundtrip failed");
await store.delete("github");
if (await store.get("github")) throw new Error("token delete failed");

process.env.NODE_ENV = "production";
try {
  new DevelopmentFileTokenStore({ appStateDir: ".skill-central-app-state-ci" });
  throw new Error("production fallback should refuse construction");
} catch (err) {
  if (!String(err.message).includes("refuses production use")) throw err;
}
NODE
pass "DevelopmentFileTokenStore 可测试且拒绝生产默认使用"

node scripts/test-secure-token-store.mjs \
  && pass "SafeStorageTokenStore 加密、原子写入、清理和错误脱敏通过" \
  || fail "SafeStorageTokenStore 安全边界失败"

node --input-type=module <<'NODE'
import { BrewCaskUpdater } from "./dist/update/brew-cask.js";

const calls = [];
let restarted = false;
let installedVersion = "1.0.0-alpha.0";
const updater = new BrewCaskUpdater({
  currentVersion: "1.0.0-alpha.0",
  restart: () => { restarted = true; },
  brewCandidates: ["/mock/bin/brew"],
  canExecute: async (candidate) => candidate === "/mock/bin/brew",
  runCommand: async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "tap-info") {
      return {
        stdout: JSON.stringify([{
          name: "bobcgn/skill-central",
          installed: true,
          trusted: true,
        }]),
        stderr: "",
      };
    }
    if (args[0] === "outdated") {
      return {
        stdout: JSON.stringify({ casks: [{ name: "skill-central", current_version: "1.0.0-alpha.1" }] }),
        stderr: "",
      };
    }
    if (args[0] === "upgrade") installedVersion = "1.0.0-alpha.1";
    if (args[0] === "list") {
      return { stdout: `skill-central ${installedVersion}\n`, stderr: "" };
    }
    return { stdout: "", stderr: "" };
  },
});

const available = await updater.check();
if (available.status !== "available" || available.availableVersion !== "1.0.0-alpha.1") {
  throw new Error("Homebrew updater did not detect available cask version");
}
const installed = await updater.install();
if (installed.status !== "ready" || installed.progressPercent !== 100) {
  throw new Error("Homebrew updater did not finish install contract");
}
await new Promise((resolve) => setTimeout(resolve, 300));
if (!restarted) throw new Error("Homebrew updater did not request app restart");

const upgrade = calls.find((call) => call[1] === "upgrade");
if (JSON.stringify(upgrade) !== JSON.stringify([
  "/mock/bin/brew",
  "upgrade",
  "--cask",
  "bobcgn/skill-central/skill-central",
  "--no-ask",
  "--no-quit",
  "--require-sha",
])) {
  throw new Error(`unexpected Homebrew upgrade command: ${JSON.stringify(upgrade)}`);
}

const untrustedUpdater = new BrewCaskUpdater({
  currentVersion: "1.0.0-alpha.0",
  restart: () => {},
  brewCandidates: ["/mock/bin/brew"],
  canExecute: async () => true,
  runCommand: async (_command, args) => {
    if (args[0] === "tap-info") {
      return {
        stdout: JSON.stringify([{
          name: "bobcgn/skill-central",
          installed: true,
          trusted: false,
        }]),
        stderr: "",
      };
    }
    throw new Error(`unexpected command after untrusted tap: ${args.join(" ")}`);
  },
});
const untrusted = await untrustedUpdater.check();
if (untrusted.status !== "unsupported" || untrusted.supported !== true) {
  throw new Error("untrusted Homebrew tap should remain retryable");
}
if (!untrusted.message?.includes("brew trust bobcgn/skill-central")) {
  throw new Error(`untrusted Homebrew tap guidance is incomplete: ${untrusted.message}`);
}

const tapFailureUpdater = new BrewCaskUpdater({
  currentVersion: "1.0.0-alpha.0",
  restart: () => {},
  brewCandidates: ["/mock/bin/brew"],
  canExecute: async () => true,
  runCommand: async () => { throw new Error("tap-info failed"); },
});
const tapFailure = await tapFailureUpdater.check();
if (tapFailure.status !== "error" || !tapFailure.message?.includes("tap-info failed")) {
  throw new Error(`tap-info failure should remain an error: ${JSON.stringify(tapFailure)}`);
}

const staleInstallUpdater = new BrewCaskUpdater({
  currentVersion: "1.0.0-alpha.0",
  restart: () => {},
  brewCandidates: ["/mock/bin/brew"],
  canExecute: async () => true,
  runCommand: async (_command, args) => {
    if (args[0] === "tap-info") {
      return { stdout: JSON.stringify([{ name: "bobcgn/skill-central", installed: true, trusted: true }]), stderr: "" };
    }
    if (args[0] === "outdated") {
      return { stdout: JSON.stringify({ casks: [{ name: "skill-central", current_version: "1.0.0-alpha.1" }] }), stderr: "" };
    }
    if (args[0] === "list") return { stdout: "skill-central 1.0.0-alpha.0\n", stderr: "" };
    return { stdout: "", stderr: "" };
  },
});
await staleInstallUpdater.check();
const staleInstall = await staleInstallUpdater.install();
if (staleInstall.status !== "error" || !staleInstall.message?.includes("without installing 1.0.0-alpha.1")) {
  throw new Error(`stale Homebrew install should fail verification: ${JSON.stringify(staleInstall)}`);
}

const fakeBrew = `${process.env.PATH.split(":")[0]}/brew-outdated-fixture`;
const outdatedFixture = new BrewCaskUpdater({
  currentVersion: "1.0.0-alpha.0",
  restart: () => {},
  brewCandidates: [fakeBrew],
});
const exitOneOutdated = await outdatedFixture.check();
if (exitOneOutdated.status !== "available" || exitOneOutdated.availableVersion !== "1.0.0-alpha.1") {
  throw new Error(`brew outdated exit 1 should mean update available: ${JSON.stringify(exitOneOutdated)}`);
}
NODE
pass "Homebrew Cask 更新器校验 Tap 信任、固定 SHA 与安装版本"

candidate_fixture="$TEST_BIN_DIR/homebrew-candidate-artifacts"
candidate_tap="$TEST_BIN_DIR/homebrew-candidate-tap"
mkdir -p "$candidate_fixture"
printf 'arm candidate fixture\n' > "$candidate_fixture/Skill-Central-9.8.7-test.1-mac-arm64.dmg"
printf 'intel candidate fixture\n' > "$candidate_fixture/Skill-Central-9.8.7-test.1-mac-x64.dmg"

node scripts/prepare-homebrew-candidate.mjs \
  --version 9.8.7-test.1 \
  --arm64 "$candidate_fixture/Skill-Central-9.8.7-test.1-mac-arm64.dmg" \
  --x64 "$candidate_fixture/Skill-Central-9.8.7-test.1-mac-x64.dmg" \
  --tap-dir "$candidate_tap" > /dev/null

CANDIDATE_CASK="$candidate_tap/Casks/skill-central.rb" node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";
const cask = await readFile(process.env.CANDIDATE_CASK, "utf8");
if (!cask.includes('version "9.8.7-test.1"')) throw new Error("candidate Cask version missing");
if (!cask.includes("file://") || !cask.includes("#{version}") || !cask.includes("#{arch}")) {
  throw new Error("candidate file URL is not versioned by Homebrew architecture");
}
if (
  cask.includes("%23%7Bversion%7D")
  || cask.includes("%23%7Barch%7D")
  || cask.includes("sha256 :no_check")
) {
  throw new Error("candidate Cask did not preserve version/arch interpolation and fixed checksums");
}
if (!cask.includes('uninstall quit: "dev.skillcentral.app"')) {
  throw new Error("candidate Cask cannot quit the background application");
}
NODE

[ "$(git -C "$candidate_tap" rev-list --count HEAD)" = "1" ] \
  && ruby -c "$candidate_tap/Casks/skill-central.rb" > /dev/null \
  && pass "Homebrew 候选工具生成带固定 SHA 的本地 Git Tap" \
  || fail "Homebrew 候选 Tap 结构或提交无效"

node --input-type=module <<'NODE'
import { GitHubDeviceFlowClient, tokenResponseToStoredToken } from "./dist/auth/github.js";
import { buildGitHubRegistryRepoPlan } from "./dist/sync/github-registry.js";

const calls = [];
const client = new GitHubDeviceFlowClient({
  clientId: "client-fixture",
  scope: "repo",
  fetchImpl: async (url, init) => {
    calls.push({ url, body: String(init?.body ?? "") });
    if (String(url).endsWith("/login/device/code")) {
      return Response.json({
        device_code: "device-code",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 1,
      });
    }
    if (String(url).endsWith("/login/oauth/access_token")) {
      return Response.json({
        access_token: "token-fixture",
        token_type: "bearer",
        scope: "repo",
      });
    }
    if (String(url).endsWith("/user")) {
      return Response.json({ id: 1, login: "octocat", name: "Octo Cat" });
    }
    throw new Error(`unexpected URL ${url}`);
  },
});

const device = await client.requestDeviceCode();
if (device.userCode !== "ABCD-1234") throw new Error("device code response not parsed");
if (!calls[0].body.includes("client_id=client-fixture")) throw new Error("device flow missing client id");
const token = await client.pollForToken(device.deviceCode);
if ("pending" in token || token.accessToken !== "token-fixture") throw new Error("token response not parsed");
const stored = tokenResponseToStoredToken(token);
if (stored.provider !== "github" || stored.accessToken !== "token-fixture") {
  throw new Error("token response did not map to StoredToken");
}
const user = await client.fetchUser(token.accessToken);
if (user.login !== "octocat") throw new Error("GitHub user response not parsed");

const plan = buildGitHubRegistryRepoPlan({ owner: "octocat" });
if (plan.action !== "create-private") throw new Error(`unexpected repo action ${plan.action}`);
if (plan.visibility !== "private") throw new Error("repo plan must default private");
if (!plan.manifestPreview.includes("visibility: private")) throw new Error("manifest preview missing private visibility");
NODE
pass "GitHub Device Flow client 和 repo dry-run plan 可离线测试"

set +e
package_missing=$(env -u SKILL_CENTRAL_GITHUB_CLIENT_ID node scripts/package-desktop.mjs mac 2>&1)
package_missing_status=$?
set -e
if [ "$package_missing_status" -eq 0 ] || ! printf '%s' "$package_missing" | grep -q "SKILL_CENTRAL_GITHUB_CLIENT_ID is required"; then
  fail "桌面打包缺少官方 GitHub OAuth client id 时必须阻断"
fi

package_args=$(SKILL_CENTRAL_GITHUB_CLIENT_ID="project-client-fixture" \
  node scripts/package-desktop.mjs mac --print-args)
if ! printf '%s' "$package_args" | grep -q -- "-c.extraMetadata.skillCentral.githubOAuthClientId=project-client-fixture"; then
  fail "桌面打包未将 GitHub OAuth client id 写入 package metadata"
fi
if grep -q "project-client-fixture" package.json; then
  fail "桌面打包不应将 GitHub OAuth client id 写入源码 package.json"
fi
pass "桌面打包强制注入项目 GitHub OAuth 配置且不修改源码 Metadata"

repo_plan=$(node dist/index.js sync repo --app-state-dir "$app_state_dir" --owner octocat --dry-run --json)
SYNC_REPO_PLAN_JSON="$repo_plan" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.SYNC_REPO_PLAN_JSON);
if (report.loggedIn !== false) throw new Error("repo dry-run should work while logged out");
if (report.plan.action !== "create-private") throw new Error(`unexpected repo action ${report.plan.action}`);
if (report.plan.repo !== "skill-central-registry") throw new Error(`unexpected default repo ${report.plan.repo}`);
if (report.plan.dryRun !== true) throw new Error("repo plan must be dry-run");
NODE
pass "sync repo --dry-run 未登录也可生成默认私有 registry plan"

set +e
login_missing=$(node dist/index.js sync login --app-state-dir "$app_state_dir" --json 2>&1)
login_missing_status=$?
set -e
if [ "$login_missing_status" -eq 0 ]; then
  fail "sync login 缺少 GitHub client id 时不应继续"
fi
printf '%s' "$login_missing" | grep -q "SKILL_CENTRAL_GITHUB_CLIENT_ID" \
  && pass "sync login 缺少 client id 时明确失败且不写 token" \
  || fail "sync login 缺少 client id 的错误不明确"

node dist/index.js sync logout --app-state-dir "$app_state_dir" --json > /dev/null \
  && pass "sync logout 可清理 GitHub token 边界" \
  || fail "sync logout 失败"

registry_dir=".skill-central-registry-ci"
mkdir -p "$registry_dir/layers/personal" "$registry_dir/workspaces" "$registry_dir/misc"
cat > "$registry_dir/manifest.yaml" <<'YAML'
schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: octocat
defaults:
  visibility: private
  syncMode: bidirectional
layers:
  - id: personal
    path: layers/personal
    scope: user
    sync:
      enabled: true
      direction: bidirectional
    visibility: private
YAML

cat > "$registry_dir/layers/personal/remote-skill.yaml" <<'YAML'
schemaVersion: skillcentral.dev/v1
id: remote-skill
name: Remote Skill
description: Importable remote fixture
type: prompt
prompt: "Remote prompt"
YAML

cat > "$registry_dir/workspaces/workspace_01.profile.yaml" <<'YAML'
schemaVersion: skillcentral.dev/workspace-profile/v1
id: workspace_01
name: CI Workspace
privacy:
  persistRepoIdentity: disabled
layers:
  enabled: [personal]
sync:
  includeProjectRules: false
  includeSessionState: false
YAML

printf 'unknown\n' > "$registry_dir/misc/notes.txt"

scan_report=$(node dist/index.js sync scan --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --dry-run --json)
SYNC_SCAN_JSON="$scan_report" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.SYNC_SCAN_JSON);
if (!report.manifestOk) throw new Error("manifest should validate");
if (!report.importableFiles.includes("layers/personal/remote-skill.yaml")) {
  throw new Error("scanner missing importable skill file");
}
if (!report.workspaceProfiles.some((profile) => profile.path === "workspaces/workspace_01.profile.yaml" && profile.ok)) {
  throw new Error("scanner missing valid workspace profile");
}
if (!report.unknownFiles.includes("misc/notes.txt")) {
  throw new Error("scanner should report unknown files");
}
if (report.issues.length !== 0) {
  throw new Error(`expected no issues, got ${JSON.stringify(report.issues)}`);
}
NODE
pass "sync scan --dry-run 可报告 manifest、importable files、workspace profiles 和 unknown files"

cat > "$registry_dir/workspaces/bad.profile.yaml" <<'YAML'
schemaVersion: skillcentral.dev/workspace-profile/v1
id: bad
name: Bad Workspace
privacy:
  persistRepoIdentity: disabled
layers:
  enabled: [personal]
sync:
  includeProjectRules: false
  includeSessionState: true
YAML

bad_scan=$(node dist/index.js sync scan --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --dry-run --json)
BAD_SYNC_SCAN_JSON="$bad_scan" node --input-type=module <<'NODE'
const report = JSON.parse(process.env.BAD_SYNC_SCAN_JSON);
if (!report.issues.some((issue) => issue.fieldPath === "sync.includeSessionState")) {
  throw new Error(`expected sync.includeSessionState issue, got ${JSON.stringify(report.issues)}`);
}
NODE
pass "workspace profile 校验错误包含字段路径"

rm -f "$registry_dir/workspaces/bad.profile.yaml"

# ── 23. Phase 4D/E sync engine dry-run plan / apply transaction ───────────
echo ""
echo "→ 23/24 Phase 4D/E sync engine dry-run plan / apply transaction..."

cp skill-central.yaml skill-central.yaml.bak.ci
mkdir -p .skills/sync-ci-global .skills/sync-ci-workflows
cat > skill-central.yaml <<'YAML'
layers:
  - id: sync-ci-global
    name: Sync CI Global
    path: .skills/sync-ci-global
    scope: user
    priority: 10
    writable: true
    trust: local
    sync:
      enabled: true
    visibility: private
  - id: sync-ci-workflows
    name: Sync CI Workflows
    path: .skills/sync-ci-workflows
    scope: workspace
    priority: 20
    writable: true
    trust: local
    sync:
      enabled: false
    visibility: private
YAML

mkdir -p "$registry_dir/layers/global" "$registry_dir/layers/workflows"
cat > "$registry_dir/manifest.yaml" <<'YAML'
schemaVersion: skillcentral.dev/registry/v1
owner:
  provider: github
  login: octocat
defaults:
  visibility: private
  syncMode: bidirectional
layers:
  - id: sync-ci-global
    path: layers/global
    scope: user
    sync:
      enabled: true
      direction: bidirectional
    visibility: private
  - id: sync-ci-workflows
    path: layers/workflows
    scope: workspace
    sync:
      enabled: false
      direction: bidirectional
    visibility: private
YAML

cat > .skills/sync-ci-global/test-sync-noop.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-noop
name: Test Sync Noop
description: Same local/remote content
type: prompt
prompt: "same"
YAML

cat > "$registry_dir/layers/global/test-sync-noop.yaml" <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-noop
name: Test Sync Noop
description: Same local/remote content
type: prompt
prompt: "same"
YAML

cat > .skills/sync-ci-global/test-sync-create-remote.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-create-remote
name: Test Sync Create Remote
description: Local-only fixture
type: prompt
prompt: "local only"
YAML

cat > "$registry_dir/layers/global/test-sync-create-local.yaml" <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-create-local
name: Test Sync Create Local
description: Remote-only fixture
type: prompt
prompt: "remote only"
YAML

cat > .skills/sync-ci-global/test-sync-conflict.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-conflict
name: Test Sync Conflict
description: Local conflict fixture
type: prompt
prompt: "local version"
YAML

cat > "$registry_dir/layers/global/test-sync-conflict.yaml" <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-conflict
name: Test Sync Conflict
description: Remote conflict fixture
type: prompt
prompt: "remote version"
YAML

cat > .skills/sync-ci-workflows/test-sync-excluded.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-excluded
name: Test Sync Excluded
description: Local policy excluded fixture
type: prompt
prompt: "sync disabled"
YAML

sync_plan_both=$(node dist/index.js sync plan --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --direction both --dry-run --json)
SYNC_PLAN_BOTH_JSON="$sync_plan_both" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.SYNC_PLAN_BOTH_JSON);
const statusOf = (layerId, relativePath) => {
  const op = plan.operations.find((candidate) => candidate.layerId === layerId && candidate.relativePath === relativePath);
  if (!op) throw new Error(`missing operation ${layerId}/${relativePath}`);
  return op.status;
};
if (plan.direction !== "both") throw new Error(`unexpected direction ${plan.direction}`);
if (plan.dryRun !== true) throw new Error("sync plan must be dry-run");
if (!plan.scanner.manifestOk) throw new Error("sync plan should include a valid scanner report");
if (statusOf("sync-ci-global", "test-sync-noop.yaml") !== "noop") throw new Error("expected noop");
if (statusOf("sync-ci-global", "test-sync-create-remote.yaml") !== "create-remote") throw new Error("expected create-remote");
if (statusOf("sync-ci-global", "test-sync-create-local.yaml") !== "create-local") throw new Error("expected create-local");
if (statusOf("sync-ci-global", "test-sync-conflict.yaml") !== "conflict") throw new Error("expected conflict");
if (statusOf("sync-ci-workflows", "test-sync-excluded.yaml") !== "excluded-policy") throw new Error("expected excluded-policy");
for (const status of ["noop", "create-remote", "create-local", "conflict", "excluded-policy"]) {
  if (!Number.isInteger(plan.counts[status]) || plan.counts[status] < 1) {
    throw new Error(`missing count for ${status}`);
  }
}
NODE
pass "sync plan --direction both 可分类 noop/create/conflict/excluded-policy"

sync_plan_push=$(node dist/index.js sync plan --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --direction push --dry-run --json)
SYNC_PLAN_PUSH_JSON="$sync_plan_push" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.SYNC_PLAN_PUSH_JSON);
const statusOf = (layerId, relativePath) => {
  const op = plan.operations.find((candidate) => candidate.layerId === layerId && candidate.relativePath === relativePath);
  if (!op) throw new Error(`missing operation ${layerId}/${relativePath}`);
  return op.status;
};
if (statusOf("sync-ci-global", "test-sync-conflict.yaml") !== "update-remote") throw new Error("expected update-remote");
if (statusOf("sync-ci-global", "test-sync-create-local.yaml") !== "delete-remote") throw new Error("expected delete-remote");
NODE
pass "sync plan --direction push 可分类 update-remote/delete-remote"

sync_plan_pull=$(node dist/index.js sync plan --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --direction pull --dry-run --json)
SYNC_PLAN_PULL_JSON="$sync_plan_pull" node --input-type=module <<'NODE'
const plan = JSON.parse(process.env.SYNC_PLAN_PULL_JSON);
const statusOf = (layerId, relativePath) => {
  const op = plan.operations.find((candidate) => candidate.layerId === layerId && candidate.relativePath === relativePath);
  if (!op) throw new Error(`missing operation ${layerId}/${relativePath}`);
  return op.status;
};
if (statusOf("sync-ci-global", "test-sync-conflict.yaml") !== "update-local") throw new Error("expected update-local");
if (statusOf("sync-ci-global", "test-sync-create-remote.yaml") !== "delete-local") throw new Error("expected delete-local");
NODE
pass "sync plan --direction pull 可分类 update-local/delete-local"

set +e
missing_plan_dry_run=$(node dist/index.js sync plan --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --json 2>&1)
missing_plan_dry_run_status=$?
set -e
if [ "$missing_plan_dry_run_status" -eq 0 ]; then
  fail "sync plan 缺少 --dry-run 时不应继续"
fi
printf '%s' "$missing_plan_dry_run" | grep -q "requires --dry-run" \
  && pass "sync plan 缺少 --dry-run 时明确失败" \
  || fail "sync plan 缺少 --dry-run 的错误不明确"

set +e
sync_apply_create=$(node dist/index.js sync apply --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --direction both --json 2>&1)
sync_apply_create_status=$?
set -e
if [ "$sync_apply_create_status" -eq 0 ]; then
  fail "sync apply both 遇到 conflict 时应返回失败状态"
fi
SYNC_APPLY_CREATE_JSON="$sync_apply_create" node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";
const lines = process.env.SYNC_APPLY_CREATE_JSON.split("\n");
const start = lines.findIndex((line) => line.trim() === "{");
if (start === -1) throw new Error("apply did not print JSON report");
let end = lines.length;
for (let i = start; i < lines.length; i += 1) {
  if (lines[i].startsWith("[skill-central] Sync error:")) {
    end = i;
    break;
  }
}
const report = JSON.parse(lines.slice(start, end).join("\n"));
if (report.schemaVersion !== "skillcentral.dev/sync-apply/v1") throw new Error("unexpected audit schema");
if (report.force !== false) throw new Error("create-only apply should not require force");
if (report.preflightBlocked !== true) throw new Error("conflict should block apply during preflight");
if (!report.planHash || typeof report.planHash !== "string") throw new Error("apply report missing plan hash");
const createLocal = report.operations.find((op) => op.plannedStatus === "create-local" && op.relativePath === "test-sync-create-local.yaml");
const createRemote = report.operations.find((op) => op.plannedStatus === "create-remote" && op.relativePath === "test-sync-create-remote.yaml");
const conflict = report.operations.find((op) => op.plannedStatus === "conflict" && op.relativePath === "test-sync-conflict.yaml");
if (!createLocal || createLocal.applyStatus !== "skipped") throw new Error("create-local should be skipped during blocked preflight");
if (!createRemote || createRemote.applyStatus !== "skipped") throw new Error("create-remote should be skipped during blocked preflight");
if (!conflict || conflict.applyStatus !== "blocked") throw new Error("conflict should be blocked");
try {
  await readFile(".skills/sync-ci-global/test-sync-create-local.yaml", "utf-8");
  throw new Error("blocked preflight should not create local file");
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
try {
  await readFile(".skill-central-registry-ci/layers/global/test-sync-create-remote.yaml", "utf-8");
  throw new Error("blocked preflight should not create remote file");
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const audit = JSON.parse(await readFile(report.auditPath, "utf-8"));
if (audit.planHash !== report.planHash) throw new Error("audit file does not match apply report");
NODE
pass "sync apply 预检发现 conflict 时全量阻断且写入 audit"

cat > .skills/sync-ci-global/test-sync-delete-local.yaml <<'YAML'
schemaVersion: skillcentral.dev/v1
id: test-sync-delete-local
name: Test Sync Delete Local
description: Local delete fixture
type: prompt
prompt: "delete local"
YAML

set +e
sync_apply_pull_blocked=$(node dist/index.js sync apply --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --direction pull --json 2>&1)
sync_apply_pull_blocked_status=$?
set -e
if [ "$sync_apply_pull_blocked_status" -eq 0 ]; then
  fail "sync apply pull 默认不应执行 update/delete"
fi
SYNC_APPLY_PULL_BLOCKED="$sync_apply_pull_blocked" node --input-type=module <<'NODE'
const lines = process.env.SYNC_APPLY_PULL_BLOCKED.split("\n");
const start = lines.findIndex((line) => line.trim() === "{");
if (start === -1) throw new Error("blocked apply did not print JSON report");
let end = lines.length;
for (let i = start; i < lines.length; i += 1) {
  if (lines[i].startsWith("[skill-central] Sync error:")) {
    end = i;
    break;
  }
}
const report = JSON.parse(lines.slice(start, end).join("\n"));
if (report.preflightBlocked !== true) throw new Error("destructive operations should block during preflight");
const updateLocal = report.operations.find((op) => op.plannedStatus === "update-local" && op.relativePath === "test-sync-conflict.yaml");
const deleteLocal = report.operations.find((op) => op.plannedStatus === "delete-local" && op.relativePath === "test-sync-delete-local.yaml");
if (!updateLocal || updateLocal.applyStatus !== "blocked") throw new Error("update-local should be blocked without --force");
if (!deleteLocal || deleteLocal.applyStatus !== "blocked") throw new Error("delete-local should be blocked without --force");
NODE
pass "sync apply 默认阻断 update/delete destructive 操作"

sync_apply_pull_force=$(node dist/index.js sync apply --app-state-dir "$app_state_dir" --registry-dir "$registry_dir" --direction pull --force --json)
SYNC_APPLY_PULL_FORCE_JSON="$sync_apply_pull_force" node --input-type=module <<'NODE'
import { access, readFile } from "node:fs/promises";
const report = JSON.parse(process.env.SYNC_APPLY_PULL_FORCE_JSON);
if (report.preflightBlocked !== false) throw new Error("--force pull should pass preflight");
const updateLocal = report.operations.find((op) => op.plannedStatus === "update-local" && op.relativePath === "test-sync-conflict.yaml");
const deleteLocal = report.operations.find((op) => op.plannedStatus === "delete-local" && op.relativePath === "test-sync-delete-local.yaml");
if (!updateLocal || updateLocal.applyStatus !== "applied" || !updateLocal.backupPath) {
  throw new Error("update-local --force should apply with backup");
}
if (!deleteLocal || deleteLocal.applyStatus !== "applied" || !deleteLocal.backupPath) {
  throw new Error("delete-local --force should apply with backup");
}
const updated = await readFile(".skills/sync-ci-global/test-sync-conflict.yaml", "utf-8");
if (!updated.includes('prompt: "remote version"')) throw new Error("update-local did not copy remote content");
await access(updateLocal.backupPath);
await access(deleteLocal.backupPath);
try {
  await access(".skills/sync-ci-global/test-sync-delete-local.yaml");
  throw new Error("delete-local did not remove local file");
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const audit = JSON.parse(await readFile(report.auditPath, "utf-8"));
if (!audit.operations.some((op) => op.backupPath === updateLocal.backupPath)) {
  throw new Error("audit missing update backup path");
}
NODE
pass "sync apply --force 会备份后执行 update/delete 并记录 audit"

# ── 24. Rules 规则库、Asset Scope 与 Web Board 作用域管理 ──────────────────
echo ""
echo "→ 24/24 Rules 规则库与作用域管理..."

# Isolated rules dir so these checks never touch the user's real .rules/.
RULES_CI_DIR=".rules-ci"
rm -rf "$RULES_CI_DIR"
mkdir -p "$RULES_CI_DIR"

# A legal rule.
cat > "$RULES_CI_DIR/rule-legal.yaml" <<'EOF'
schemaVersion: skillcentral.dev/rule/v1
id: ci-legal-rule
name: CI Legal Rule
description: A well-formed rule used by CI to check the happy path.
severity: error
tags:
  - ci
  - security
body: |
  This rule is well-formed and must load, validate, and list cleanly.
EOF

# A second legal rule at a different severity, for filter checks.
cat > "$RULES_CI_DIR/rule-info.yaml" <<'EOF'
schemaVersion: skillcentral.dev/rule/v1
id: ci-info-rule
name: CI Info Rule
description: A second well-formed rule at info severity.
tags:
  - ci
body: |
  Severity omitted on purpose; it must default to info.
EOF

# Malformed rules — each violates exactly one contract requirement.
cat > "$RULES_CI_DIR/rule-missing-id.yaml" <<'EOF'
schemaVersion: skillcentral.dev/rule/v1
name: Missing Id Rule
description: This rule has no id and must fail validation.
body: Body present but id absent.
EOF

cat > "$RULES_CI_DIR/rule-missing-body.yaml" <<'EOF'
schemaVersion: skillcentral.dev/rule/v1
id: ci-missing-body
name: Missing Body Rule
description: This rule has no body and must fail validation.
EOF

cat > "$RULES_CI_DIR/rule-bad-severity.yaml" <<'EOF'
schemaVersion: skillcentral.dev/rule/v1
id: ci-bad-severity
name: Bad Severity Rule
description: This rule uses an illegal severity and must fail validation.
severity: catastrophic
body: Severity out of the allowed enum.
EOF

# 24.1 legal rule validates and exits 0
node dist/index.js validate-rule "$RULES_CI_DIR/rule-legal.yaml" > /dev/null \
  && pass "validate-rule 合法规则退 0" \
  || fail "validate-rule 合法规则未通过"

# 24.2 each malformed rule fails validation (exit 1) with a field-level warning.
# Capture output and exit code separately — a naive `node ... | grep` pipeline
# would let `set -o pipefail` surface node's exit-1 as the pipeline status.
assert_rule_rejected() {
  local file="$1" field="$2" label="$3"
  local out status
  # `|| status=$?` keeps `set -e` from aborting on the expected non-zero exit.
  status=0
  out="$(node dist/index.js validate-rule "$file" 2>&1)" || status=$?
  if [ "$status" -eq 0 ]; then
    fail "$label 不应通过 validate-rule"
  elif echo "$out" | grep -q "$field"; then
    pass "$label 被拒并给出字段级 warn"
  else
    fail "$label 未打印 $field 字段错误"
  fi
}

assert_rule_rejected "$RULES_CI_DIR/rule-missing-id.yaml" "id" "缺 id 规则"
assert_rule_rejected "$RULES_CI_DIR/rule-missing-body.yaml" "body" "缺 body 规则"
assert_rule_rejected "$RULES_CI_DIR/rule-bad-severity.yaml" "severity" "非法 severity 规则"

# 24.3 rules command lists the legal rules
node dist/index.js rules --dir "$RULES_CI_DIR" 2>/dev/null | grep -q "ci-legal-rule" \
  && pass "rules 列出合法规则" \
  || fail "rules 未列出合法规则"

# 24.4 default severity applied (omitted → info); severity filter works
node dist/index.js rules --dir "$RULES_CI_DIR" --severity info 2>/dev/null | grep -q "ci-info-rule" \
  && pass "省略 severity 默认为 info 且过滤有效" \
  || fail "severity 默认或过滤失败"

node dist/index.js rules --dir "$RULES_CI_DIR" --severity error 2>/dev/null | grep -q "ci-legal-rule" \
  && pass "rules --severity error 过滤命中" \
  || fail "rules --severity error 过滤失败"

if node dist/index.js rules --dir "$RULES_CI_DIR" --severity error 2>/dev/null | grep -q "ci-info-rule"; then
  fail "rules --severity error 不应包含 info 规则"
else
  pass "rules --severity 过滤集合正确（不含无关严重级）"
fi

# 24.5 tag filter works
node dist/index.js rules --dir "$RULES_CI_DIR" --tag security 2>/dev/null | grep -q "ci-legal-rule" \
  && pass "rules --tag 过滤命中" \
  || fail "rules --tag 过滤失败"

# 24.6 rules ↔ list are non-crossing: rule ids never appear in `list`,
#      skill ids never appear in `rules`.
if node dist/index.js list 2>/dev/null | grep -q "ci-legal-rule"; then
  fail "list 不应包含规则 id"
else
  pass "list 输出不含规则 id（不交叉）"
fi

if node dist/index.js rules --dir "$RULES_CI_DIR" 2>/dev/null | grep -q "test-skill"; then
  fail "rules 不应包含技能 id"
else
  pass "rules 输出不含技能 id（不交叉）"
fi

# 24.7 isolation: a broken rule is skipped, good rules + skills still load.
cat > "$RULES_CI_DIR/rule-broken.yaml" <<'EOF'
schemaVersion: skillcentral.dev/rule/v1
id:
name:
description: intentionally broken to prove failure isolation
EOF

node dist/index.js rules --dir "$RULES_CI_DIR" 2>/dev/null | grep -q "ci-legal-rule" \
  && pass "坏规则被跳过后其余规则仍列出（隔离失败边界）" \
  || fail "坏规则污染了其余规则加载"

node dist/index.js list > /dev/null 2>&1 \
  && pass "坏规则不影响 skill 侧 list 退 0" \
  || fail "坏规则影响了 skill 侧加载"

# 24.8 empty dir gives a friendly message and exits 0 (not an error).
EMPTY_RULES_CI_DIR=".rules-empty-ci"
rm -rf "$EMPTY_RULES_CI_DIR"
mkdir -p "$EMPTY_RULES_CI_DIR"
node dist/index.js rules --dir "$EMPTY_RULES_CI_DIR" > /dev/null 2>&1 \
  && pass "空规则目录给出友好提示并退 0" \
  || fail "空规则目录不应报错"

rm -rf "$RULES_CI_DIR" "$EMPTY_RULES_CI_DIR"

# 24.9 isolated shared-scope and Board API/UI contract matrix.
npm run test:asset-scope \
  && pass "Rules/Skills 作用域、Board 恢复路径与并发写入矩阵通过" \
  || fail "作用域管理矩阵失败"

# ── 清理测试数据 ──────────────────────────────────────────────────────────────
echo ""
echo "→ 清理测试数据..."
rm -f \
  .skills/02-workflows/test-skill.yaml \
  .skills/02-workflows/test-v1-prompt.yaml \
  .skills/02-workflows/test-v1-tool.yaml \
  .skills/02-workflows/test-v1-workflow.yaml \
  .skills/02-workflows/test-v1-blocked-workflow.yaml \
  .skills/02-workflows/test-v1-policy.yaml \
  .skills/02-workflows/test-v1-context-router.yaml \
  .skills/01-global/test-layer-shadow.yaml \
  .skills/02-workflows/test-layer-shadow.yaml \
  .skills/01-global/test-sync-noop.yaml \
  .skills/01-global/test-sync-create-remote.yaml \
  .skills/01-global/test-sync-conflict.yaml \
  .skills/01-global/test-sync-delete-local.yaml \
  .skills/02-workflows/test-sync-excluded.yaml
rm -f .skills/01-global/test-sync-create-local.yaml
rm -f .skills/01-global/test-sync-conflict.yaml.bak.* .skills/01-global/test-sync-delete-local.yaml.bak.*
rm -rf .skills/sync-ci-global .skills/sync-ci-workflows
mv skill-central.yaml.bak.ci skill-central.yaml
pass "测试技能已清理"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ 全部测试通过                                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
