# Startup Recognition for Coding Agents

[简体中文](../ch/startup-agent-recognition.md) | [Docs home](./README.md)

## Goal

When Skill Central starts, it should make itself discoverable and usable by local MCP-capable Coding Agents as far as the product can control. "Usable" is not one health light; it requires four separate layers:

1. The desktop app or CLI process can run.
2. `skill-central mcp` can complete MCP initialize, `prompts/list`, and `tools/list` over stdio.
3. The target IDE or Agent MCP config contains the correct `skill-central` server entry.
4. The current Agent session has loaded or discovered that MCP tool surface.

Skill Central controls and verifies the first three layers. The fourth layer depends on each Agent client. If a running session has already frozen its tool inventory, Skill Central can only guide the user to refresh, start a new task, or trigger the client's supported discovery path.

## Boundary

Skill Central can guarantee:

- Formally detect and reconcile Codex, Claude Code, and Cursor. Trae, Windsurf, and Cline remain explicit experimental targets.
- Write or refresh the `skill-central` MCP config for supported targets.
- Preserve existing user config through connect transactions, backups, and rollback.
- Verify the configured command with MCP handshake, prompt/tool listing, and Registry baseline comparison.
- Provide actionable repair guidance for missing configs, failed commands, handshake failures, drift, or sessions that need refresh/discovery.

Skill Central cannot guarantee:

- Agents without MCP support automatically gain Skill Central capabilities.
- Cloud-isolated Agents or Agents without local filesystem/process access can reach a local stdio server.
- Already-running sessions receive new tools without refresh, a new task, or discovery.
- Third-party clients keep the same config paths or hot-loading behavior forever.

## Startup Flow

The desktop app should run a `StartupConnectionReconciler` after launch:

1. Read the current workspace, global config, Skill Registry, and Rules.
2. Start the local MCP runtime and verify stdio handshake.
3. Scan config candidates for `RELEASE_SUPPORTED_IDES` (Codex, Claude Code, and Cursor).
4. Build a connect plan for each target:
   - Not registered: create a write plan.
   - Registered and identical: mark ready-to-verify.
   - Registered with drift: create a refresh plan.
   - Unreadable config: mark blocked and do not write.
5. Apply plans only when the change is safe, idempotent, and rollbackable; otherwise show the plan and backup path for user confirmation.
6. Run health probes for all registered or refreshed targets.
7. Return Board states: `available`, `registered-needs-refresh`, `drift-refreshable`, `blocked`, or `unsupported`.

The CLI should continue to reuse the same connect transaction. `register` handles idempotent registration and drift refresh; `connect --dry-run`, `--verify`, and `--rollback` remain the explicit transaction controls.

The Board API exposes the same backend core:

```http
POST /api/startup-recognition
GET  /api/startup-recognition/latest
```

By default it only returns a recognition report and does not write config files. Callers must explicitly pass `applyDrift: true` to refresh a registered-but-drifted `skill-central` entry, and `registerMissing: true` to add the entry to an existing readable Agent config. The API returns structured per-target results; one target's config error does not hide the rest of the report.

After the Board server starts listening, the desktop app calls this API asynchronously and writes an app-state audit. This startup hook does not block the visible window. It can refresh drift and register Skill Central into an existing readable supported-Agent config through the backup-backed transaction, but it does not create a config for an Agent that is not installed or has no config evidence. The Board IDE page reads the latest audit and displays the last recognition time, status counts, and audit path.

## Work Plan

### Phase 1: Registration Consistency and Drift Repair

- Make `register <ide>` apply a connect plan when the existing server entry differs from the desired config.
- Expose drift status in connect plans for CLI and Board rendering.
- Test not registered, already identical, registered with drift, and unreadable config paths.

Acceptance evidence:

- CLI tests prove drift is refreshed and identical configs are not rewritten.
- `doctor --ide <target> --verify` distinguishes `connected` from `connected-with-drift`.

### Phase 2: Desktop Startup Reconciler

- Add a startup coordinator that reuses `buildConnectPlan`, `applyConnectPlan`, `verifyConnectPlan`, and `checkIdeConnectionHealth`.
- Automatically repair only safe, idempotent, rollbackable drift; require confirmation for new configs or higher-risk writes.
- Add a Board summary showing target status, config path, command, verification result, and next action.

Acceptance evidence:

- After desktop startup, Board shows registration and verification status for all targets.
- Every write has a backup or a verifiable new-config rollback condition.
- Blocked targets are never silently rewritten.

Current status: the reusable backend core `reconcileStartupConnections()`, Board API `/api/startup-recognition`, app-state audit, asynchronous desktop startup invocation, and Board latest summary are implemented. Real packaged desktop cross-platform smoke checks remain release gates and must not be replaced by unit/integration test results alone.

### Phase 3: Agent Session Discovery Guidance

- Provide discovery guidance for lazy-loading clients such as Codex.
- Distinguish "IDE config connected" from "current session discovered tools" in Board.
- Evaluate a lightweight Codex skill/plugin prompt layer without treating it as the MCP server itself.

Acceptance evidence:

- Docs and UI do not report registered configs as current-session callable tools.
- Codex lazy discovery has a clear diagnosis and repair path.

### Phase 4: Observability and Release Matrix

- Write startup recognition audits to app state with target, config path, plan summary, verification result, and failure summary.
- Add cross-platform config path samples for the supported macOS and Windows releases.
- Add "first launch recognition matrix" to the release checklist.

Acceptance evidence:

- Audits can reconstruct launch, register/refresh, verify, and user guidance.
- Stable releases complete real local recognition checks for Codex, Claude Code, and Cursor.

## Rollback

- Config refreshes must go through connect transactions; existing files receive `.bak.<timestamp>` backups before writes.
- New configs can be rolled back only when the current file still contains only the Skill Central-created entry.
- The Startup Reconciler does not write config files directly; it only calls connect transactions.
- Rollback targets only the config path and backup path recorded by the current plan.

## Current Slice

The `1.0.0` slice implements drift refresh, safe registration into existing supported-Agent configs, asynchronous startup audit, and Board status with explicit experimental/unverified labels. Skills are available through MCP prompts/tools/resources; Rules are directly consumable through `rule://` resources, `rules:all` and `rule:<id>` prompts, plus `rules.list` and `rules.get` tools. Current-session discovery still depends on each Agent and may require a reload or a new task.
