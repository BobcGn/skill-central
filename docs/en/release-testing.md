# v0.2.0 版本发布测试清单

在发布前，使用此清单在您自己的设备上验证 skill-central v0.2.0。这些步骤是具体且有序的——请逐一勾选。如果任何步骤失败，请将确切的命令+输出记录在一个临时文件中并重新审视。

> **约定：** 每个代码块都以 `cd` 到仓库根目录开始。如果您已经在了，请跳过该行。

## 0. 先决条件

- [ ] Node.js **v22+** (`node --version`)
- [ ] npm **v10+** (`npm --version`)
- [ ] macOS / Linux / WSL (tar-stream 的原生绑定是纯 JS 的，所以任何平台都适用)
- [ ] 工作目录是仓库根目录
- [ ] `git status` 是干净的 (或者您已经储藏了您的工作)

```bash
node --version      # 必须打印 v22.x 或更高版本
npm --version       # 必须打印 10.x 或更高版本
git status          # 无未提交的更改
```

---

## 1. 构建与健康检查

- [ ] `npm install` 成功
- [ ] `npm run build` 退出码为 0
- [ ] `npm run build:web` 退出码为 0
- [ ] `dist/web/index.html` 存在
- [ ] `node dist/index.js --version` 打印 `0.2.0`
- [ ] `node dist/index.js --help` 显示所有 12 个命令

```bash
npm install
npm run build
npm run build:web
ls dist/web/index.html
node dist/index.js --version
node dist/index.js --help | grep -E '^\s+(mcp|board|init|add|list|show|remove|validate|doctor|install|update|uninstall)\b'
```

预期：grep 找到所有 12 个命令。

---

## 2. CLI CRUD (`add` / `list` / `show` / `remove` / `validate` / `doctor`)

### 2.1 `add` — 带有标签推断的正常路径

- [ ] `add` 从 `review,workflow,git` 标签推断出 `02-workflows`
- [ ] 生成的文件位于 `.skills/02-workflows/review-pr.yaml`
- [ ] `list` 显示新技能

```bash
node dist/index.js add review-pr \
  --name "PR Review" \
  --description "审查拉取请求" \
  --tags "review,workflow,git" \
  --prompt "你是一名代码审查员。要具体，不要模糊。"

ls .skills/02-workflows/review-pr.yaml
node dist/index.js list | grep review-pr
```

### 2.2 `add` — 显式 `--layer` 覆盖

- [ ] 标签不相关；`--layer 04-tech-stack/frameworks` 被遵守

```bash
node dist/index.js add react-conventions \
  --name "React Conventions" \
  --description "React 风格" \
  --tags "general" \
  --layer 04-tech-stack/frameworks \
  --prompt "使用函数式组件。"

ls .skills/04-tech-stack/frameworks/react-conventions.yaml
```

### 2.3 `add` — `--from-file` 复制

- [ ] 现有技能被重新序列化并写入
- [ ] 在覆盖前创建了一个 `.bak.<ts>` 同级文件

```bash
node dist/index.js add --from-file .skills/01-global/architectural-mindset.yaml --force
ls .skills/01-global/architectural-mindset.yaml.bak.*  # ≥ 1 个文件
```

### 2.4 `add` — `--user` 写入用户范围

- [ ] 技能保存在 `~/.skill-central/skills/...` 下
- [ ] 默认的 4 层子目录被自动创建

```bash
node dist/index.js add my-baseline \
  --user \
  --name "Baseline" \
  --description "个人基线" \
  --tags "global,system" \
  --prompt "始终保持简洁。"

ls ~/.skill-central/skills/01-global/my-baseline.yaml
```

### 2.5 `add` — 错误路径

- [ ] 不带 `--force` 重新添加会报错，并有清晰的 "File already exists" 消息
- [ ] 缺少必需字段 (无 `--name`) 会以退出码 1 退出，并在错误中包含字段名

```bash
node dist/index.js add review-pr --name "X" --description "Y" --tags "review" --prompt "z"
# 预期: "File already exists … Use --force to overwrite"

node dist/index.js add no-id --description "no name" --tags "review" --prompt "x"
# 预期: "Missing required field: --name"
```

### 2.6 `list` 过滤器

- [ ] `--tag docker` 只返回 `container-infra`
- [ ] `--type tool` 只返回 `commit-conventions`
- [ ] 无过滤器返回完整集合

```bash
node dist/index.js list --tag docker
node dist/index.js list --type tool
node dist/index.js list | tail -3
```

### 2.7 `show <id>`

- [ ] 打印名称、类型、描述、标签、层、源路径
- [ ] 打印完整的 prompt 正文
- [ ] 缺失 id 以退出码 1 退出，并有清晰的消息

```bash
node dist/index.js show architectural-mindset | head -15
node dist/index.js show no-such-skill   # 预期: "Skill \"no-such-skill\" not found"
```

### 2.8 `remove <id>`

- [ ] 文件被删除
- [ ] `--force` 跳过确认

```bash
node dist/index.js remove react-conventions --force
ls .skills/04-tech-stack/frameworks/react-conventions.yaml  # No such file
```

### 2.9 `validate`

- [ ] 有效文件退出码为 0
- [ ] 损坏的 YAML 退出码为 1

```bash
node dist/index.js validate .skills/02-workflows/commit-conventions.yaml
echo "not: [valid: yaml:" > /tmp/bad.yaml
node dist/index.js validate /tmp/bad.yaml   # 预期退出码 1
rm /tmp/bad.yaml
```

### 2.10 `doctor`

- [ ] 健康状态: `✓ All skill files parse cleanly`, `✓ No id collisions`
- [ ] 注入一个重复的 id 会显示一个冲突报告
- [ ] `node dist/index.js doctor` 在健康时退出码为 0，有问题时为 1

```bash
node dist/index.js doctor | tail -10
# 注入一个冲突
cp .skills/01-global/architectural-mindset.yaml /tmp/dup.yaml
node -e "
const fs=require('fs');
const c=fs.readFileSync('/tmp/dup.yaml','utf-8').replace('id: architectural-mindset','id: commit-conventions');
fs.writeFileSync('/tmp/dup.yaml',c);
"
cp /tmp/dup.yaml .skills/02-workflows/dup-id.yaml
node dist/index.js doctor | grep -A2 "⚠ Id collisions"   # 预期非空
rm .skills/02-workflows/dup-id.yaml /tmp/dup.yaml
```

### 2.11 清理第 2 节

```bash
rm -f .skills/01-global/architectural-mindset.yaml.bak.*
rm -f .skills/02-workflows/review-pr.yaml
rm -f ~/.skill-central/skills/01-global/my-baseline.yaml
```

---

## 3. Web 看板 (`board`)

### 3.1 默认 — web on 127.0.0.1:5417

- [ ] 服务器打印 URL 并保持运行
- [ ] `GET /api/health` 返回 `{ ok: true, version: "0.2.0" }`
- [ ] `GET /api/layers` 返回 4 个层
- [ ] `GET /api/skills` 返回完整集合

```bash
node dist/index.js board --port 5601 > /tmp/board.log 2>&1 &
BOARD_PID=$!
sleep 1

curl -s http://127.0.0.1:5601/api/health
curl -s http://127.0.0.1:5601/api/layers | head -c 200
curl -s http://127.0.0.1:5601/api/skills | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>console.log('count:',JSON.parse(d).length));
"

kill $BOARD_PID 2>/dev/null
wait $BOARD_PID 2>/dev/null
```

### 3.2 浏览器冒烟测试 (手动)

- [ ] 在浏览器中打开 `http://127.0.0.1:5601/`
- [ ] 侧边栏按层分组显示技能
- [ ] 点击一个技能 — 详情窗格呈现 prompt
- [ ] 点击 **Edit**，更改描述，**Save** — 磁盘上的文件被更新
- [ ] 文件旁边出现一个 `.bak.<ts>` 同级文件
- [ ] 点击 **Backups** — 列出新的备份
- [ ] 在另一个编辑器中打开文件并修改它；在浏览器中，使用一个过期的 `expectedSha256` 进行 **Save** → 409 冲突 UI

### 3.3 静态资源路径遍历探测

- [ ] `/../etc/passwd` 返回 404 (而不是 200)

```bash
node dist/index.js board --port 5601 > /tmp/board.log 2>&1 &
BOARD_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5601/../etc/passwd
kill $BOARD_PID 2>/dev/null
wait $BOARD_PID 2>/dev/null
```

### 3.4 非环回主机保护

- [ ] 不带 `--i-understand-nonlocal` 的 `--host 0.0.0.0` 以退出码 1 退出，并有清晰的拒绝信息
- [ ] 添加 `--i-understand-nonlocal` 让它绑定 (并打印警告)

```bash
node dist/index.js board --host 0.0.0.0 --port 5602
# 预期退出码 1 并有 "Refusing to bind to non-loopback address \"0.0.0.0\""

node dist/index.js board --host 0.0.0.0 --port 5602 --i-understand-nonlocal > /tmp/board.log 2>&1 &
BOARD_PID=$!
sleep 1
curl -s http://127.0.0.1:5602/api/health
kill $BOARD_PID 2>/dev/null
wait $BOARD_PID 2>/dev/null
grep -i WARNING /tmp/board.log
```

### 3.5 `--cli` 终端后备

- [ ] `board --cli` 打印 v0.1.0 风格的表格

```bash
node dist/index.js board --cli | head -15
node dist/index.js board --no-web | head -15
```

### 3.6 端口冲突重试

- [ ] 在同一端口上连续启动两个看板；第二个打印 "Port X busy; using X+1."

```bash
node dist/index.js board --port 5603 > /tmp/board-a.log 2>&1 &
A=$!
sleep 1
node dist/index.js board --port 5603 > /tmp/board-b.log 2>&1 &
B=$!
sleep 1
grep -i "busy" /tmp/board-b.log
kill $A $B 2>/dev/null
wait $A $B 2>/dev/null
```

### 3.7 Web 看板 "assets not found" 保护

- [ ] 在删除 `dist/web/` 后从 `dist/` 运行 `board` 会返回一个清晰的错误并以退出码 1 退出

```bash
mv dist/web /tmp/web-backup
node dist/index.js board --port 5604 2>&1 | head -3
# 预期: "Web assets not found at …/dist/web"
mv /tmp/web-backup dist/web
```

### 3.8 清理第 3 节

```bash
pkill -f "node dist/index.js board" 2>/dev/null
rm -f .skills/**/*.bak.* 2>/dev/null   # 手动编辑留下的
```

---

## 4. 远程安装 (`install` / `update` / `uninstall`)

### 4.1 GitHub raw URL — 已知存在的文件

- [ ] 安装到项目范围 (带 `--project`) 或用户范围 (默认)
- [ ] 写入锁条目，带有正确的 sha256

```bash
node dist/index.js install \
  github:BobcGn/skill-central/.skills/04-tech-stack/_template.yaml@main \
  --project --yes

cat ~/.skill-central/lock.json   # 预期 1 个条目
ls .skills/02-workflows/your-skill-id.yaml
```

### 4.2 `update` — 保留范围

- [ ] 不带 `--project`，update 会重新安装到 install 使用的**相同范围**

```bash
node dist/index.js update your-skill-id
cat ~/.skill-central/lock.json | grep filePath   # 仍在 .skills/ (项目) 下
```

### 4.3 `uninstall` — 删除文件 + 锁条目

- [ ] 文件被删除，锁条目消失

```bash
node dist/index.js uninstall your-skill-id --yes
cat ~/.skill-central/lock.json
```

### 4.4 GitHub URL — 错误的 ref / 路径 → 404

- [ ] 清晰的错误消息，没有写入锁条目

```bash
node dist/index.js install github:BobcGn/skill-central/does-not-exist.yaml@main --project --yes 2>&1 | head -3
cat ~/.skill-central/lock.json   # 预期为空
```

### 4.5 npm — 不带 `skill-central.paths` 的包

- [ ] 清晰的错误消息，指明缺失的清单字段

```bash
node dist/index.js install npm:lodash@4.17.21 --yes --project 2>&1 | head -3
```

### 4.6 npm — 不存在的包 → 404

```bash
node dist/index.js install npm:@bobcgn/this-pkg-does-not-exist --yes --project 2>&1 | head -3
```

### 4.7 HTTPS-only 防御

- [ ] 从 `http://` URL 安装被拒绝 (解析器只接受 `github:` / `npm:`，所以通过直接 API 手动验证 fetcher 拒绝非 https)

```bash
node --input-type=module -e "
import { httpsFetchText } from './dist/commands/sources.js';
try { await httpsFetchText('http://example.com/foo', ['text/plain']); }
catch (e) { console.log('OK rejected:', e.message); }
"
```

### 4.8 Tar-slip 防御 (npm)

- [ ] 直接检查：一个带有 `..` 的合成 tar 条目被提取器丢弃

```bash
node --input-type=module -e "
import { extractTarGz } from './dist/commands/sources.js';
// 流式传输一个带 ../escape 条目的 tar；这是一个单元风格的探测。
console.log('extractTarGz is exported and accepts a ReadableStream<Uint8Array>');
" 2>&1
# 功能性 tar-slip 测试需要构建一个有毒的 tarball；
# v0.2.0 依赖于对 src/commands/sources.ts:extractTarGz() 的静态审查。
```

### 4.9 清理第 4 节

```bash
node dist/index.js uninstall --help   # 应该提到 --purge-backups
rm -f ~/.skill-central/lock.json
rm -rf ~/.skill-central/skills   # 如果您运行了 --user 测试
```

---

## 5. 跨功能集成

- [ ] `add` 一个技能 → `list --tag <that-tag>` 显示它
- [ ] `add` 一个技能 → `doctor` 报告干净状态
- [ ] `add` 一个技能 → `board` Web UI 显示它 (刷新浏览器标签页)
- [ ] `install` 一个技能 → `list` 显示它 (来自 `lock.json` 的技能被引擎加载)
- [ ] `install` 一个技能 → `update` 检测到无变化 (上游未变) 并报告 `0 of 1 updated`
- [ ] `add --user` 一个技能 → `~/.skill-central/skills/...` 被创建，带有 4 个子目录

```bash
node dist/index.js add typescript-conventions \
  --name "TS Conventions" \
  --description "TS 代码风格" \
  --tags "typescript" \
  --prompt "使用严格模式。"

node dist/index.js list --tag typescript
node dist/index.js doctor | tail -3
rm .skills/04-tech-stack/languages/typescript-conventions.yaml
```

---

## 6. 文档审查

- [ ] README.md 快速入门按所写工作 (运行快速入门块中的每个命令)
- [ ] README.zh-CN.md 快速入门工作 (命令是双语兼容的；只需验证中文部分读起来自然)
- [ ] README.md 中的每个 `[link](docs/...)` 都打开一个存在的文件
- [ ] CHANGELOG.md 中的每个 `[link](./docs/...)` 都打开一个存在的文件
- [ ] `node dist/index.js <cmd> --help` 输出与 `docs/cli-reference.md` 所说的一致
- [ ] `node dist/index.js board --help` 提到 `--cli`, `--port`, `--host`, `--i-understand-nonlocal`
- [ ] `node dist/index.js install --help` 提到 `--layer`, `--project`, `--yes`

```bash
# 链接健康检查
for f in docs/*.md; do
  grep -oE '\]\(\./docs/[^)]+\)' README.md README.zh-CN.md CHANGELOG.md 2>/dev/null | \
    grep -oE '\./docs/[^)]+' | sort -u | while read link; do
      [ -f "$link" ] || echo "BROKEN: $link"
    done
done
echo "done"
```

---

## 7. Stdio 规范 (MCP 服务器)

- [ ] `mcp` 不向 stdout 写入任何内容
- [ ] stderr 是唯一的诊断通道
- [ ] 一个最小的 JSON-RPC `initialize` 往返正确

```bash
# 1. 健康检查: 无 stdout 泄漏
node dist/index.js mcp 2>/tmp/mcp.err >/tmp/mcp.out &
MCP_PID=$!
sleep 0.5
kill $MCP_PID 2>/dev/null
wait $MCP_PID 2>/dev/null
[ -s /tmp/mcp.out ] && echo "FAIL: stdout is not empty" || echo "OK: stdout empty"
head -5 /tmp/mcp.err

# 2. JSON-RPC 往返
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}'
  sleep 0.3
} | node dist/index.js mcp 2>/dev/null | head -2
# 预期一个包含 "result" 和 "serverInfo" 的 JSON 行
```

---

## 8. 打包与发布预演

- [ ] `npm pack --dry-run` 在 tarball 中显示所有预期的文件
- [ ] `files:` 字段排除了 `src/`, `docs/`, `node_modules/`, 和开发配置

```bash
npm pack --dry-run 2>&1 | head -60
# 预期: dist/index.js, dist/commands/*.js, dist/web/*, README.md, README.zh-CN.md, LICENSE
# 预期无: src/, docs/, tsconfig.json, .github/, 等。
```

- [ ] `package.json` `version` 是 `0.2.0`
- [ ] `package.json` `files` 包括 `dist/web/`
- [ ] `package.json` `prepublishOnly` 是 `npm run build && npm run build:web`

```bash
node -e "
const p = require('./package.json');
const checks = {
  version: p.version === '0.2.0',
  hasHono: !!p.dependencies.hono,
  hasTarStream: !!p.dependencies['tar-stream'],
  filesIncludeWeb: p.files.includes('dist/web/'),
  prepublish: p.scripts.prepublishOnly.includes('build:web'),
};
console.log(checks);
"
```

---

## 9. 可选 — 在干净目录中进行 npm-test-pack

如果您有时间，请在一个干净的目录中安装本地 tarball 并运行快速入门：

```bash
npm pack                      # 生成 skill-central-0.2.0.tgz
mkdir /tmp/sc-smoke && cd /tmp/sc-smoke
npm init -y >/dev/null
npm install /path/to/skill-central-0.2.0.tgz
npx skill-central init
npx skill-central board --cli
npx skill-central add test-skill \
  --name "Test" --description "test" --tags "review" --prompt "x"
npx skill-central list | grep test-skill
rm -rf /tmp/sc-smoke
```

---

## 10. 签署

勾选以上所有框。如果任何地方失败，请捕获：

- 确切的命令
- 确切的输出 (或截图)
- Node 版本和平台
- 对原因的猜测

如果一切正常，您就可以 `npm publish` 了。建议的标签：

```bash
git tag -a v0.2.0 -m "v0.2.0: CLI CRUD + web board + remote install + docs"
git push origin v0.2.0
npm publish --access public
```

---

## 快速参考 — 此清单中的所有命令

```bash
# 健康检查
node --version && npm --version
npm install && npm run build && npm run build:web
node dist/index.js --version
node dist/index.js --help

# CLI
node dist/index.js add <id> --name … --description … --tags … --prompt …
node dist/index.js list [--tag | --layer | --type]
node dist/index.js show <id>
node dist/index.js remove <id> [--layer] [--force]
node dist/index.js validate <files…>
node dist/index.js doctor

# Web
node dist/index.js board [--cli] [--port N] [--host ADDR] [--i-understand-nonlocal]

# 安装
node dist/index.js install github:<user>/<repo>/<path>[@<ref>] [--project] [--yes]
node dist/index.js install npm:<pkg>[@<version>] [--project] [--yes]
node dist/index.js update [id] [--project] [--yes]
node dist/index.js uninstall <id> [--purge-backups] [--yes]

# MCP
node dist/index.js mcp

# 打包
npm pack --dry-run
```
