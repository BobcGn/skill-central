# 数据与安全

[English](../en/data-and-security.md) | [文档首页](./README.md)

## 安全定位

Skill Central 采用本地优先设计，但它不是安全沙箱。它会读写 Layer 与 IDE 配置选定的文件，可以启动本地 MCP 进程，也可以与用户选定的 GitHub Registry 同步。执行高权限操作前，用户应检查 Plan 与 Backup。

请按 [SECURITY.md](../../SECURITY.md) 中的私密流程报告漏洞。禁止在公开 Issue 中包含 Token、私有仓库内容或漏洞利用细节。

## 数据边界

| 数据 | 默认位置 | 用途 | 删除后的影响 |
| --- | --- | --- | --- |
| 用户 Layer 配置 | `~/.skill-central/config.yaml` | 用户级 Layer 定义 | 改变加载的 Layer |
| 项目配置 | `<project>/skill-central.yaml` | 项目 Layer 定义 | 改变加载的项目 Layer |
| Skill 源文件 | 已配置的 Layer Path，通常为 `.skills/` 和 `~/.skill-central/skills/` | 持久化 Skill 定义 | 直接影响 Skill 库 |
| macOS App State | `~/Library/Application Support/skill-central/` | State、Audit、Cache、Sync、Token、Session | 影响派生/本地应用状态 |
| Windows App State | `%APPDATA%/skill-central/` | 同上 | 影响派生/本地应用状态 |
| Linux App State | `~/.local/share/skill-central/` | 同上 | 影响派生/本地应用状态 |
| IDE Backup | IDE 配置同级的 `.bak.<timestamp>` | 连接回退 | 影响该配置的恢复证据 |
| Skill Edit Backup | Skill 源文件同级的 `.bak.<timestamp>` | Board 编辑与恢复 | 影响该 Skill 的恢复证据 |

测试或受控部署可以通过 `SKILL_CENTRAL_APP_STATE_DIR` 覆盖 App State Root。App State 有意不包含受治理的 Skill Source Layer。

## 浏览器本地偏好

Board 使用浏览器 `localStorage` 保存主题、语言和当前偏好。GitHub OAuth App Client ID 不再由用户输入或保存在浏览器中；正式桌面包将项目拥有的公共 Client ID 写入 Package Metadata，本地 Server 只向 Renderer 暴露“是否已配置”的状态。

GitHub Access Token 和 Device Code 不会出现在正常浏览器状态响应中，也不会写入浏览器存储。

## GitHub 认证

认证使用 GitHub OAuth Device Flow：

1. 正式桌面包从 Package Metadata 读取项目 OAuth App Client ID；源码 CLI 可从 `SKILL_CENTRAL_GITHUB_CLIENT_ID` 或显式参数读取。
2. Skill Central 请求 Device Code，只返回面向用户的 Code、Verification URL、时间参数和不透明的本地 Flow ID。
3. 用户授权后，本地 Server 向 GitHub Poll。
4. 返回的 Access Token 通过 `TokenStore` 接口写入。

当前请求的 Scope 是 `repo`，可能获得账户所授权私有仓库的访问能力。Alpha 阶段应使用专用、可撤销的 OAuth Grant，避免使用高价值凭据。

Client ID 是公开应用标识，不是 Client Secret。项目 OAuth App 必须启用 Device Flow；Release Workflow 从 Repository Variable `SKILL_CENTRAL_GITHUB_CLIENT_ID` 注入该 ID，变量缺失或格式无效时拒绝打包。不得在桌面包、源码、日志或 Actions 配置中加入 Client Secret。

正式桌面程序使用 Electron `safeStorage` 加密完整的 Token 记录：macOS 依赖 Keychain，Windows 依赖当前系统用户的 DPAPI。密文使用受限权限和同目录原子替换；系统加密不可用时阻断登录，绝不回退明文。桌面程序发现旧版 `github.token.json` 明文凭据时会直接删除而不迁移，并要求重新登录；密文损坏或无法解密时也会删除记录并恢复为未登录状态。

Renderer、Board API 与认证诊断日志不得接收 Access Token、Device Code、Authorization Header、密文或原始原生异常。日志只记录预定义的操作阶段、错误码和非敏感清理事件。CLI 当前仍使用仅供源码开发的 `DevelopmentFileTokenStore`，不属于 Alpha.2 正式桌面安全承诺。Linux 桌面认证不在 Alpha.2 支持范围内；Windows DPAPI 在真实候选包验证前仍标记为未验证。

Logout 会删除本地 Token 记录，但不会撤销 GitHub 侧的授权；怀疑泄露时还应在 GitHub 设置中单独撤销。密文与系统用户凭据绑定，不能保证跨设备或跨系统账户恢复。

## Web Board 边界

Board 默认绑定 `127.0.0.1`，且没有用户认证。绑定非 loopback 地址需要 `--i-understand-nonlocal`，但该参数仅表示知情确认，不会增加认证或加密。

不要将 Board 暴露到局域网、共享主机、反向代理或公网接口。其 API 可以编辑 Skill、写入 IDE 配置、执行同步计划并控制本地 Runtime。包括更新器在内的部分敏感 Endpoint 会校验浏览器 Same Origin，但 Board 整体仍必须视为无认证的本地管理 API。

Electron Renderer 启用 Context Isolation 与 Chromium Sandbox，禁用 Node Integration。窗口会拒绝直接打开外部链接，并交由操作系统处理。

## 文件修改控制

### Skill 编辑

Board 编辑会执行：

- 校验路由中的 kebab-case ID；
- 使用预期 SHA-256 进行乐观并发控制；
- 解析 YAML 并校验 Skill；
- 拒绝原地修改 ID；
- 写入前备份；
- 成功写入后重新加载 Engine。

### IDE 配置

IDE 写入会结构化解析 JSON 或 TOML，保留无关 Entry，在文件已存在时创建备份，并支持显式回退。已有配置格式错误时会阻止写入，不会覆盖原文件。

### Sync

Sync Planning 只比较 SHA-256，不执行写入。关闭同步的 Layer 保持 excluded。Apply 要求显式冲突选择，并生成 Audit Report 与 Backup Reference。Audit/Backup API 只允许读取 App State Audit 边界内的文件，或近期 Audit Record 引用的路径。

## 网络活动

Skill Central 可能访问：

- 用于 Device Flow、用户信息和 Registry 操作的 GitHub OAuth/API Endpoint；
- Windows Updater 使用的 GitHub Releases；
- macOS 应用由 Homebrew 管理时执行的 Homebrew 命令；
- Install/Update 命令中由用户选择的 GitHub 或 npm Source。

Board 本身在本地提供服务。当前代码库没有记录或实现 Telemetry Pipeline。

## 打包限制

- macOS 产物未签名、未公证。文档中的 `xattr` 方案会移除 Quarantine，只应对确认来自官方 Release 的产物使用。
- Windows NSIS 的更新元数据与 Binary 来自 GitHub Releases，目前没有文档化代码签名保证。
- 当前 Homebrew Cask 使用 `sha256 :no_check`，不能提供固定 Artifact Checksum。
- macOS Homebrew Updater 已有实现，但尚未通过当前端到端用户测试。

这些是 Release 风险，不是安装便利性问题。任何宣称改善这些问题的变更都需要真实打包平台验证。

## 贡献者安全检查

- 禁止记录或返回 Access Token、Device Code、Authorization Header。
- 保持高权限浏览器操作的 loopback 边界，并为 Origin/Path 检查补充负向测试。
- 授权判断前先解析 Path，并按路径边界校验包含关系。
- 文件写入必须保留 Backup 与 Conflict Evidence。
- 未经设计批准和迁移说明，不得扩大 OAuth Scope。
- 不得为了简化 Renderer 开发而削弱 Electron Isolation 设置。
- 明确说明实际测试过的操作系统与 Package Format。
