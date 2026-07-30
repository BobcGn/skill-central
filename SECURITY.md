# Security Policy / 安全政策

## Supported Versions / 支持版本

Skill Central is currently alpha software. Security fixes target the latest prerelease and the current `main` branch. Older alpha builds may not receive backports.

Skill Central 当前处于 Alpha 阶段。安全修复面向最新预发布版本和当前 `main` 分支，旧 Alpha 版本不保证回移修复。

| Version / 版本 | Supported / 支持状态 |
| --- | --- |
| Latest prerelease / 最新预发布版本 | Supported / 支持 |
| Current `main` | Supported for validation / 支持验证 |
| Older prereleases / 更早预发布版本 | Not guaranteed / 不保证 |

## Reporting a Vulnerability / 报告漏洞

Do not open a public issue. Use GitHub's private vulnerability reporting:

请勿创建公开 Issue。请使用 GitHub 私密漏洞报告：

<https://github.com/BobcGn/skill-central/security/advisories/new>

Include the following when possible / 请尽量包含：

- Affected version or commit / 受影响版本或 commit
- Platform, architecture, and installation method / 平台、架构和安装方式
- Impact and realistic attack scenario / 影响与实际攻击场景
- Minimal reproduction steps or proof of concept / 最小复现步骤或 PoC
- Relevant sanitized logs / 相关脱敏日志
- Suggested mitigation, if known / 已知时提供缓解建议

Never include real access tokens, OAuth secrets, private repository content, or unredacted IDE configuration. Use synthetic fixtures and state clearly what was removed.

禁止包含真实 access token、OAuth secret、私有仓库内容或未脱敏 IDE 配置。请使用合成数据，并明确说明已移除的内容。

## Security-Relevant Areas / 安全相关范围

Reports are especially useful for authentication/token handling, command or path injection, archive extraction, updater/release integrity, loopback API boundaries, cross-origin requests, IDE configuration writes, backup/rollback behavior, and remote registry synchronization.

重点范围包括认证/token 处理、命令或路径注入、压缩包解压、更新/Release 完整性、loopback API 边界、跨域请求、IDE 配置写入、备份/回退和远端 Registry 同步。

Setup questions, unsupported platforms, and bugs without a security impact should use the public issue forms.

安装问题、不支持的平台和不具有安全影响的普通错误，请使用公开 Issue 表单。

## Disclosure Process / 披露流程

The maintainer will triage reports on a best-effort basis, confirm the affected boundary, and coordinate remediation and disclosure through the private advisory. Because the project is alpha and maintained independently, no fixed response-time SLA is promised. Please allow a reasonable remediation window before public disclosure.

维护者会尽力分诊报告、确认受影响边界，并通过私密 Advisory 协调修复与披露。项目目前为独立维护的 Alpha 软件，不承诺固定响应 SLA；公开披露前请预留合理修复时间。
