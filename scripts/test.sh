#!/usr/bin/env bash
# ============================================================================
# skill-central 集成测试脚本
# ============================================================================
# 用法: npm test (自动通过 pretest 先构建) 或 bash scripts/test.sh
#
# 测试范围:
#   1. CLI 基本可用性 (--version, --help)
#   2. 添加技能 (add)
#   3. 列表验证 (list)
#   4. 医生诊断 (doctor)
#
# 此脚本假设 dist/ 已构建完毕。如果通过 npm test 调用，
# pretest 钩子会自动执行 npm run build && npm run build:web。
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           skill-central  集成测试                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. CLI 基本可用性 ────────────────────────────────────────────────────────
echo "→ 1/5 CLI 基本检查..."

node dist/index.js --version > /dev/null \
  && pass "--version 正常" \
  || fail "--version 失败"

node dist/index.js --help > /dev/null \
  && pass "--help 正常" \
  || fail "--help 失败"

# ── 2. 准备测试环境 ──────────────────────────────────────────────────────────
echo ""
echo "→ 2/5 准备测试环境..."

# 模拟真实的四层 skill 目录结构（参考 CI 流程）
mkdir -p .skills/01-global .skills/02-workflows .skills/03-domains .skills/04-tech-stack
pass ".skills/ 目录已就绪"

# ── 3. 添加测试技能 ──────────────────────────────────────────────────────────
echo ""
echo "→ 3/5 添加测试技能..."

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
echo "→ 4/5 验证技能列表..."

node dist/index.js list | grep -q "test-skill" \
  && pass "list 包含 test-skill" \
  || fail "list 中未找到 test-skill"

# ── 5. 医生诊断 ──────────────────────────────────────────────────────────────
echo ""
echo "→ 5/5 医生诊断..."

node dist/index.js doctor \
  && pass "doctor 诊断通过" \
  || fail "doctor 诊断失败"

# ── 清理测试数据 ──────────────────────────────────────────────────────────────
echo ""
echo "→ 清理测试数据..."
rm -f .skills/02-workflows/test-skill.yaml
pass "测试技能已清理"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ 全部测试通过                                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
