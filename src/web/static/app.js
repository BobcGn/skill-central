// ============================================================================
// skill-central · web board frontend
// ----------------------------------------------------------------------------
// Vanilla JS — no build step. Presents Skills and Rules as independent asset
// libraries while sharing project-scope editing, localization, and conflict
// handling across both surfaces.
// ============================================================================

const state = {
  skills: [],
  rules: [],
  scopeAssets: [],
  activeId: null,
  activeSkillKey: null,
  activeRuleId: null,
  skillFilter: "",
  ruleFilter: "",
  detail: null,        // last fetched /api/skills/:id
  ruleDetail: null,
  projectIdentity: null,
  scopeAsset: null,
  scopeMode: "global",
  ideTargets: [],
  activeIde: readPreference("skill-central.ide", "codex"),
  activeView: readPreference("skill-central.view", "skills"),
  theme: readPreference("skill-central.theme", "system"),
  locale: readPreference("skill-central.locale", navigator.language.startsWith("zh") ? "zh-CN" : "en"),
  githubPollTimer: null,
  githubStatus: null,
  updatePollTimer: null,
  updateStatus: null,
  connectPlan: null,   // last preview/apply result for rollback evidence
  syncPlan: null,      // last dry-run plan; conflict choices must match it
  syncAudits: [],
  syncAuditNextCursor: null,
  syncAuditFilters: {
    outcome: "all",
    direction: "all",
    layer: "all",
    since: "",
    until: "",
  },
  editing: false,
  workspace: null,
  createAssetType: "skill",
};

const messages = {
  en: {
    "nav.skills": "Skills",
    "nav.rules": "Rules",
    "nav.ide": "IDE Connections",
    "nav.sync": "Sync",
    "nav.runtime": "Runtime",
    "workspace.label": "Workspace",
    "workspace.change": "Change workspace",
    "workspace.prompt": "Workspace folder path",
    "workspace.changed": "Workspace changed",
    "workspace.emptySuffix": "searched",
    "settings.account": "Personal settings",
    "settings.title": "Personal settings",
    "settings.theme": "Theme",
    "settings.language": "Language",
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "skills.search": "Filter skills",
    "skills.compile": "Compile preview",
    "skills.emptyTitle": "Select a skill",
    "skills.emptyBody": "Choose an entry from the index.",
    "skills.noResults": "No matching skills",
    "skills.noSkills": "No skills loaded",
    "rules.search": "Filter rules",
    "rules.library": "Rule library",
    "rules.emptyTitle": "Select a rule",
    "rules.emptyBody": "Choose an entry from the rule index.",
    "rules.noResults": "No matching rules",
    "rules.noRules": "No rules loaded",
    "scope.kicker": "ASSET / PROJECTS",
    "scope.title": "Asset scope",
    "scope.global": "Global",
    "scope.projects": "Selected projects",
    "scope.currentProject": "Current project",
    "scope.useCurrent": "Use current",
    "scope.projectIds": "Project IDs",
    "scope.projectPlaceholder": "git:github.com/owner/repository",
    "scope.edit": "Scope",
    "scope.saved": "Scope saved",
    "scope.scopedOut": "Scope saved; the asset is hidden in this project",
    "scope.current": "current",
    "scope.other": "other scope",
    "scope.inactive": "Not active in the current project.",
    "scope.required": "At least one project ID is required.",
    "action.preview": "Preview",
    "action.edit": "Edit",
    "action.resolution": "Resolution",
    "action.backups": "Backups",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "create.skill": "Add skill",
    "create.rule": "Add rule",
    "create.layer": "Layer",
    "create.import": "Import YAML",
    "create.saved": "Asset created",
    "ide.title": "IDE Connections",
    "ide.selected": "Selected target",
    "ide.health": "Check health",
    "ide.plan": "Build plan",
    "ide.connect": "Connect",
    "ide.rollback": "Rollback",
    "ide.ready": "connection console ready",
    "ide.guideIntro": "Select an IDE to review its configuration and connect safely.",
    "ide.guideDetails": "Start with Health Check, preview changes with Build Plan, then Connect or Rollback as needed.",
    "ide.registered": "registered",
    "ide.notRegistered": "not registered",
    "ide.invalidConfig": "invalid config",
    "ide.checking": "Checking {target}...",
    "ide.building": "Building {target} connect plan...",
    "ide.applying": "Applying {target} connect plan...",
    "ide.rollingBack": "Rolling back {target} connect plan...",
    "ide.noPlan": "Build or apply a connect plan before rollback.",
    "sync.title": "Registry Sync",
    "sync.path": "Registry checkout",
    "sync.direction": "Direction",
    "sync.force": "Force with backup",
    "sync.confirm": "Apply confirmation",
    "sync.status": "Status",
    "sync.plan": "Build plan",
    "sync.apply": "Apply sync",
    "sync.audit": "Audit log",
    "sync.ready": "sync console ready",
    "sync.selectAudit": "Select an audit or backup path.",
    "runtime.title": "Local Runtime",
    "runtime.mcp": "MCP stdio process",
    "runtime.status": "Inspect",
    "runtime.start": "Start",
    "runtime.stop": "Stop",
    "runtime.ready": "runtime console ready",
    "github.notConnected": "GitHub not connected",
    "github.connected": "GitHub connected",
    "github.connect": "Connect GitHub",
    "github.disconnect": "Disconnect",
    "github.unavailable": "GitHub authentication unavailable",
    "github.notConfigured": "GitHub login is not configured in this build",
    "github.configurationHelp": "This source build requires SKILL_CENTRAL_GITHUB_CLIENT_ID. Official desktop packages include the project configuration.",
    "github.requesting": "Requesting GitHub device code...",
    "github.open": "Open GitHub",
    "github.waiting": "Waiting for authorization...",
    "github.success": "GitHub authentication complete",
    "update.title": "Software updates",
    "update.check": "Check for updates",
    "update.install": "Install and restart",
    "update.unsupported": "Desktop updater unavailable",
    "update.setup-required": "Update setup required",
    "update.idle": "Ready to check",
    "update.checking": "Checking for updates...",
    "update.up-to-date": "Skill Central is up to date",
    "update.available": "Version {version} is available",
    "update.downloading": "Downloading {percent}%",
    "update.ready": "Version {version} is ready",
    "update.installing": "Installing and restarting...",
    "update.error": "Update failed",
    "update.error.release-not-published": "The latest release is not published yet. Try checking again later.",
    "update.error.network": "Cannot reach the update server. Check your network connection and try again.",
    "update.error.server-rejected": "The update server rejected this request. If this keeps happening, reinstall the latest release.",
    "update.error.generic": "Update check failed. Please try again later.",
  },
  "zh-CN": {
    "nav.skills": "Skills",
    "nav.rules": "Rules",
    "nav.ide": "IDE 连接",
    "nav.sync": "同步",
    "nav.runtime": "运行时",
    "workspace.label": "工作区",
    "workspace.change": "切换工作区",
    "workspace.prompt": "工作区目录路径",
    "workspace.changed": "工作区已切换",
    "workspace.emptySuffix": "搜索目录",
    "settings.account": "个人设置",
    "settings.title": "个人设置",
    "settings.theme": "主题",
    "settings.language": "语言",
    "theme.system": "跟随系统",
    "theme.light": "亮色",
    "theme.dark": "暗色",
    "skills.search": "筛选 Skills",
    "skills.compile": "编译预览",
    "skills.emptyTitle": "选择一个 Skill",
    "skills.emptyBody": "从左侧索引中选择条目。",
    "skills.noResults": "没有匹配的 Skill",
    "skills.noSkills": "尚未加载 Skill",
    "rules.search": "筛选 Rules",
    "rules.library": "规则库",
    "rules.emptyTitle": "选择一个 Rule",
    "rules.emptyBody": "从规则索引中选择条目。",
    "rules.noResults": "没有匹配的 Rule",
    "rules.noRules": "尚未加载 Rule",
    "scope.kicker": "资产 / 项目",
    "scope.title": "资产作用域",
    "scope.global": "全局",
    "scope.projects": "指定项目",
    "scope.currentProject": "当前项目",
    "scope.useCurrent": "使用当前项目",
    "scope.projectIds": "项目 ID",
    "scope.projectPlaceholder": "git:github.com/owner/repository",
    "scope.edit": "作用域",
    "scope.saved": "作用域已保存",
    "scope.scopedOut": "作用域已保存；该资产在当前项目中已隐藏",
    "scope.current": "当前项目",
    "scope.other": "其他作用域",
    "scope.inactive": "该资产在当前项目中未生效。",
    "scope.required": "至少需要一个项目 ID。",
    "action.preview": "预览",
    "action.edit": "编辑",
    "action.resolution": "解析链",
    "action.backups": "备份",
    "action.save": "保存",
    "action.cancel": "取消",
    "create.skill": "添加 Skill",
    "create.rule": "添加 Rule",
    "create.layer": "层级",
    "create.import": "导入 YAML",
    "create.saved": "资产已创建",
    "ide.title": "IDE 连接",
    "ide.selected": "当前目标",
    "ide.health": "健康检查",
    "ide.plan": "生成计划",
    "ide.connect": "连接",
    "ide.rollback": "回退",
    "ide.ready": "连接控制台已就绪",
    "ide.guideIntro": "选择一个 IDE，查看配置状态并安全连接。",
    "ide.guideDetails": "建议先进行健康检查，再生成计划预览修改，确认后连接；需要时可回退配置。",
    "ide.registered": "已注册",
    "ide.notRegistered": "未注册",
    "ide.invalidConfig": "配置异常",
    "ide.checking": "正在检查 {target}...",
    "ide.building": "正在生成 {target} 连接计划...",
    "ide.applying": "正在应用 {target} 连接计划...",
    "ide.rollingBack": "正在回退 {target} 连接计划...",
    "ide.noPlan": "请先生成或应用连接计划。",
    "sync.title": "Registry 同步",
    "sync.path": "Registry 本地目录",
    "sync.direction": "同步方向",
    "sync.force": "强制执行并备份",
    "sync.confirm": "执行确认",
    "sync.status": "状态",
    "sync.plan": "生成计划",
    "sync.apply": "执行同步",
    "sync.audit": "审计日志",
    "sync.ready": "同步控制台已就绪",
    "sync.selectAudit": "选择一条审计或备份记录。",
    "runtime.title": "本地运行时",
    "runtime.mcp": "MCP stdio 进程",
    "runtime.status": "检查",
    "runtime.start": "启动",
    "runtime.stop": "停止",
    "runtime.ready": "运行时控制台已就绪",
    "github.notConnected": "GitHub 未连接",
    "github.connected": "GitHub 已连接",
    "github.connect": "连接 GitHub",
    "github.disconnect": "断开连接",
    "github.unavailable": "GitHub 认证不可用",
    "github.notConfigured": "此构建尚未配置 GitHub 登录",
    "github.configurationHelp": "源码构建需要设置 SKILL_CENTRAL_GITHUB_CLIENT_ID；正式桌面安装包会包含项目配置。",
    "github.requesting": "正在请求 GitHub 设备代码...",
    "github.open": "打开 GitHub",
    "github.waiting": "等待授权...",
    "github.success": "GitHub 认证完成",
    "update.title": "软件更新",
    "update.check": "检查更新",
    "update.install": "安装并重启",
    "update.unsupported": "桌面更新器不可用",
    "update.setup-required": "需要配置更新路线",
    "update.idle": "可以检查更新",
    "update.checking": "正在检查更新...",
    "update.up-to-date": "Skill Central 已是最新版本",
    "update.available": "发现版本 {version}",
    "update.downloading": "正在下载 {percent}%",
    "update.ready": "版本 {version} 已准备好",
    "update.installing": "正在安装并重启...",
    "update.error": "更新失败",
    "update.error.release-not-published": "最新版本的安装包尚未发布，请稍后再试。",
    "update.error.network": "无法连接更新服务器，请检查网络后重试。",
    "update.error.server-rejected": "更新服务器拒绝了本次请求。若持续出现，请重新安装最新版本。",
    "update.error.generic": "检查更新失败，请稍后重试。",
  },
};

function readPreference(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function writePreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function removePreference(key) {
  try { localStorage.removeItem(key); } catch {}
}

function t(key, replacements = {}) {
  const dictionary = messages[state.locale] || messages.en;
  let value = dictionary[key] || messages.en[key] || key;
  for (const [name, replacement] of Object.entries(replacements)) {
    value = value.replace(`{${name}}`, replacement);
  }
  return value;
}

function applyPreferences() {
  if (state.theme === "light" || state.theme === "dark") {
    document.documentElement.dataset.theme = state.theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
  document.documentElement.lang = state.locale;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const button of document.querySelectorAll("[data-theme-value]")) {
    button.classList.toggle("active", button.dataset.themeValue === state.theme);
  }
  for (const button of document.querySelectorAll("[data-locale-value]")) {
    button.classList.toggle("active", button.dataset.localeValue === state.locale);
  }
  navigate(state.activeView, false);
  renderList();
  renderRuleList();
  renderIdeTargets();
  if (state.detail && !state.editing) renderDetail(state.detail);
  if (state.ruleDetail) renderRuleDetail(state.ruleDetail);
  if (state.githubStatus) renderGithubStatus(state.githubStatus);
  if (state.updateStatus) renderUpdateStatus(state.updateStatus);
  renderWorkspace();
}

function navigate(view, persist = true) {
  const known = ["skills", "rules", "ide", "sync", "runtime"];
  state.activeView = known.includes(view) ? view : "skills";
  if (persist) writePreference("skill-central.view", state.activeView);
  for (const button of document.querySelectorAll("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  }
  for (const panel of document.querySelectorAll("[data-view-panel]")) {
    const active = panel.dataset.viewPanel === state.activeView;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  }
  const title = document.getElementById("view-title");
  if (title) title.textContent = t(`nav.${state.activeView}`);
}

// ── API helpers ────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    let detail = null;
    try { detail = await r.json(); } catch {}
    const err = new Error(`${path} → ${r.status}${detail?.error ? `: ${detail.error}` : ""}`);
    err.status = r.status;
    err.detail = detail;
    throw err;
  }
  return r.json();
}

// ── Renderers ──────────────────────────────────────────────────────────────

function renderHealth(health) {
  const el = document.getElementById("health");
  const skillCount = state.scopeAssets.filter((asset) => asset.assetType === "skill").length;
  const ruleCount = state.scopeAssets.filter((asset) => asset.assetType === "rule").length;
  if (health.ok) {
    el.innerHTML = `<span class="status-dot"></span><span>v${escapeHtml(health.version)} · ${skillCount} skills · ${ruleCount} rules</span>`;
    el.classList.remove("error");
  } else {
    el.innerHTML = `<span class="status-dot"></span><span>offline</span>`;
    el.classList.add("error");
  }
  document.getElementById("skill-count").textContent = skillCount;
  document.getElementById("rule-count").textContent = ruleCount;
  const brandVersion = document.getElementById("brand-version");
  if (brandVersion) brandVersion.textContent = health.version;
  if (health.rootDir) {
    state.workspace = { ...(state.workspace || {}), rootDir: health.rootDir };
    renderWorkspace();
  }
}

function renderWorkspace() {
  const button = document.getElementById("btn-workspace");
  if (!button) return;
  const rootDir = state.workspace?.rootDir || "";
  button.textContent = rootDir || t("workspace.change");
  button.title = rootDir ? `${t("workspace.change")}: ${rootDir}` : t("workspace.change");
  button.setAttribute("aria-label", t("workspace.change"));
}

function renderList() {
  const ul = document.getElementById("skill-list");
  if (!ul) return;
  ul.innerHTML = "";
  const skillAssets = state.scopeAssets.filter((asset) => asset.assetType === "skill");
  const filter = state.skillFilter.trim().toLowerCase();
  const visibleSkills = filter
    ? skillAssets.filter((skill) =>
        [skill.id, skill.name, skill.description, ...(skill.tags || [])]
          .some((value) => String(value || "").toLowerCase().includes(filter)),
      )
    : skillAssets;
  if (visibleSkills.length === 0) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = skillAssets.length === 0
      ? `${t("skills.noSkills")} · ${t("workspace.emptySuffix")}: ${state.workspace?.rootDir || ""}`
      : t("skills.noResults");
    ul.appendChild(li);
    return;
  }
  const byLayer = new Map();
  for (const s of visibleSkills) {
    const k = s.layer || "(unknown)";
    if (!byLayer.has(k)) byLayer.set(k, []);
    byLayer.get(k).push(s);
  }
  for (const [layer, skills] of byLayer) {
    const title = document.createElement("li");
    title.className = "skill-layer";
    title.textContent = `${layer} (${skills.length})`;
    ul.appendChild(title);
    for (const s of skills) {
      const li = document.createElement("li");
      const loaded = state.skills.find((candidate) => candidate.source === s.source);
      li.className = `skill-item ${s.appliesHere ? "" : "inactive"}`;
      if (scopeAssetKey(s) === state.activeSkillKey) li.classList.add("active");
      li.dataset.id = s.id;
      li.innerHTML = `
        <span class="skill-name">${escapeHtml(s.name)}</span>
        <span class="skill-id">${escapeHtml(s.id)} · ${escapeHtml(s.type)} · ${escapeHtml(loaded?.status || (s.appliesHere ? "shadowed" : "other scope"))}</span>
      `;
      li.addEventListener("click", () => selectSkillAsset(scopeAssetKey(s)));
      ul.appendChild(li);
    }
  }
}

function renderRuleList() {
  const ul = document.getElementById("rule-list");
  if (!ul) return;
  ul.innerHTML = "";
  const filter = state.ruleFilter.trim().toLowerCase();
  const visibleRules = filter
    ? state.scopeAssets.filter((asset) => asset.assetType === "rule").filter((rule) =>
        [rule.id, rule.name, rule.description, rule.severity, ...(rule.tags || [])]
          .some((value) => String(value || "").toLowerCase().includes(filter)),
      )
    : state.scopeAssets.filter((asset) => asset.assetType === "rule");
  if (visibleRules.length === 0) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = state.scopeAssets.every((asset) => asset.assetType !== "rule")
      ? `${t("rules.noRules")} · ${t("workspace.emptySuffix")}: ${state.workspace?.rootDir || ""}`
      : t("rules.noResults");
    ul.appendChild(li);
    return;
  }
  for (const rule of visibleRules) {
    const li = document.createElement("li");
    li.className = `skill-item ${rule.appliesHere ? "" : "inactive"}`;
    if (scopeAssetKey(rule) === state.activeRuleId) li.classList.add("active");
    li.dataset.id = rule.id;
    li.innerHTML = `
      <span class="skill-name">${escapeHtml(rule.name)}</span>
      <span class="skill-id">${escapeHtml(rule.id)} · ${escapeHtml(rule.severity)} · ${escapeHtml(t(rule.appliesHere ? "scope.current" : "scope.other"))}</span>
    `;
    li.addEventListener("click", () => selectRule(scopeAssetKey(rule)));
    ul.appendChild(li);
  }
}

function renderDetail(skill) {
  const el = document.getElementById("skill-detail");
  if (!skill) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="empty-glyph" aria-hidden="true">{ }</span>
        <strong>${escapeHtml(t("skills.emptyTitle"))}</strong>
        <span>${escapeHtml(t("skills.emptyBody"))}</span>
      </div>`;
    return;
  }
  const tags = (skill.tags || []).join(", ");
  const scopeOnly = skill.scopeOnly === true;
  // Bilingual prompt: render English if present, plus a Chinese sub-section
  // when prompt_zh is also present. If neither, fall back to the original
  // "(no prompt)" placeholder.
  const hasEn = !!(skill.prompt && skill.prompt.trim());
  const hasZh = !!(skill.prompt_zh && skill.prompt_zh.trim());
  let promptHtml;
  if (hasEn && hasZh) {
    promptHtml = `
      <h3>Prompt <span class="muted">[English]</span></h3>
      <pre id="prompt-body">${escapeHtml(skill.prompt)}</pre>
      <h3>Prompt <span class="muted">[中文]</span></h3>
      <pre id="prompt-body-zh">${escapeHtml(skill.prompt_zh)}</pre>
    `;
  } else if (hasEn) {
    promptHtml = `
      <h3>Prompt</h3>
      <pre id="prompt-body">${escapeHtml(skill.prompt)}</pre>
    `;
  } else if (hasZh) {
    promptHtml = `
      <h3>Prompt <span class="muted">[中文]</span></h3>
      <pre id="prompt-body-zh">${escapeHtml(skill.prompt_zh)}</pre>
    `;
  } else {
    promptHtml = `
      <h3>Prompt</h3>
      <pre id="prompt-body"><span class="muted">${escapeHtml(scopeOnly ? "Not active in the current resolved set." : "(no prompt)")}</span></pre>
    `;
  }
  const fullActions = scopeOnly ? "" : `
    <button id="btn-edit" class="button secondary">${escapeHtml(t("action.edit"))}</button>
    <button id="btn-resolution" class="button secondary">${escapeHtml(t("action.resolution"))}</button>
    <button id="btn-backups" class="button secondary">${escapeHtml(t("action.backups"))}</button>
  `;
  el.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(skill.name)}</h2>
        <div class="meta">
          <span>id: ${escapeHtml(skill.id)}</span>
          <span>type: ${escapeHtml(skill.type)}</span>
          <span>layer: ${escapeHtml(skill.layer || "?")}</span>
          <span>status: ${escapeHtml(skill.status || "?")}</span>
          <span>priority: ${skill.priority ?? "?"}</span>
          <span>scope: ${escapeHtml(formatScope(skill.appliesTo))}</span>
          <span>sha: ${(skill.sha256 || "").slice(0, 12)}…</span>
        </div>
      </div>
      <div class="actions">
        ${fullActions}
        <button id="btn-skill-scope" class="button secondary">${escapeHtml(t("scope.edit"))}</button>
      </div>
    </div>
    <p>${escapeHtml(skill.description || "")}</p>
    <p class="muted">tags: ${escapeHtml(tags || "(none)")}</p>
    ${promptHtml}
    <div id="backups-pane"></div>
  `;
  if (!scopeOnly) {
    document.getElementById("btn-edit").addEventListener("click", () => enterEditMode(skill));
    document.getElementById("btn-resolution").addEventListener("click", () => showResolution(skill));
    document.getElementById("btn-backups").addEventListener("click", () => showBackups(skill));
  }
  document.getElementById("btn-skill-scope").addEventListener("click", () => openScopeDialog("skill", skill));
}

function renderRuleDetail(rule) {
  const el = document.getElementById("rule-detail");
  if (!el) return;
  if (!rule) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="empty-glyph" aria-hidden="true">{ }</span>
        <strong>${escapeHtml(t("rules.emptyTitle"))}</strong>
        <span>${escapeHtml(t("rules.emptyBody"))}</span>
      </div>`;
    return;
  }
  const loadedRule = state.rules.find((candidate) => candidate.source === rule.source);
  el.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(rule.name)}</h2>
        <div class="meta">
          <span>id: ${escapeHtml(rule.id)}</span>
          <span>severity: ${escapeHtml(rule.severity)}</span>
          <span>scope: ${escapeHtml(formatScope(rule.appliesTo))}</span>
          <span>sha: ${(rule.sha256 || "").slice(0, 12)}…</span>
        </div>
      </div>
      <div class="actions">
        <button id="btn-rule-scope" class="button secondary">${escapeHtml(t("scope.edit"))}</button>
      </div>
    </div>
    <p>${escapeHtml(rule.description || "")}</p>
    <p class="muted">tags: ${escapeHtml((rule.tags || []).join(", ") || "(none)")}</p>
    <h3>Rule</h3>
    <pre>${escapeHtml(loadedRule?.body || (rule.appliesHere ? "" : t("scope.inactive")))}</pre>
    <p class="muted"><code>${escapeHtml(rule.source)}</code></p>
  `;
  document.getElementById("btn-rule-scope").addEventListener("click", () => openScopeDialog("rule", rule));
}

function formatScope(scope) {
  return scope === "global" || !scope ? "global" : (scope.projects || []).join(", ");
}

function renderEditForm(skill, draftYaml, conflictMsg) {
  const el = document.getElementById("skill-detail");
  el.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(skill.name)} <span class="muted">(editing)</span></h2>
        <div class="meta">
          <span>id: ${escapeHtml(skill.id)}</span>
          <span>sha: ${(skill.sha256 || "").slice(0, 12)}…</span>
        </div>
      </div>
      <div class="actions">
        <button id="btn-save" class="button primary">${escapeHtml(t("action.save"))}</button>
        <button id="btn-cancel" class="button secondary">${escapeHtml(t("action.cancel"))}</button>
      </div>
    </div>
    ${conflictMsg ? `<div class="error">${escapeHtml(conflictMsg)}</div>` : ""}
    <textarea id="editor" spellcheck="false">${escapeHtml(draftYaml)}</textarea>
  `;
  document.getElementById("btn-save").addEventListener("click", () => saveEdit(skill));
  document.getElementById("btn-cancel").addEventListener("click", () => {
    state.editing = false;
    renderDetail(skill);
  });
}

// ── Edit flow ──────────────────────────────────────────────────────────────

function enterEditMode(skill) {
  state.editing = true;
  renderEditForm(skill, skill.rawYaml || "", null);
}

async function saveEdit(originalSkill) {
  const editor = document.getElementById("editor");
  const rawYaml = editor.value;
  try {
    const res = await api(`/api/skills/${encodeURIComponent(originalSkill.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        rawYaml,
        expectedSha256: originalSkill.sha256,
      }),
    });
    // Success — server has already reloaded its engine, so the data is
    // fresh. We must re-pull BOTH the list (in case name/description
    // changed) and the detail (to get the new sha256). Doing only one of
    // the two leaves the other view stale.
    state.editing = false;
    await loadAll();
    await selectSkill(originalSkill.id);
    flash(`✓ Saved · new sha: ${res.sha256.slice(0, 12)}…`);
  } catch (err) {
    if (err.status === 409 && err.detail?.currentRawYaml) {
      // Conflict: server sent the up-to-date version. Re-render with both.
      renderEditForm(
        { ...originalSkill, sha256: err.detail.currentSha256 },
        rawYaml,
        "File changed on disk since you loaded it. " +
          "Compare below — keep yours, take theirs, or merge manually.",
      );
      // Append a comparison block.
      const comparison = document.createElement("div");
      comparison.innerHTML = `
        <h4>Current on disk</h4>
        <pre>${escapeHtml(err.detail.currentRawYaml)}</pre>
      `;
      document.getElementById("skill-detail").appendChild(comparison);
    } else {
      flash(`✗ ${err.message}`, true);
    }
  }
}

async function showBackups(skill) {
  const pane = document.getElementById("backups-pane");
  if (!pane) return;
  try {
    const backups = await api(`/api/skills/${encodeURIComponent(skill.id)}/backups`);
    if (backups.length === 0) {
      pane.innerHTML = `<p class="muted">No backups.</p>`;
      return;
    }
    pane.innerHTML = `
      <h3>Backups (${backups.length})</h3>
      <ul class="backup-list">
        ${backups
          .map(
            (b) => `
          <li>
            <code>${escapeHtml(b.file.split("/").pop())}</code>
            <span class="muted">${b.size} bytes · ${b.createdAt}</span>
            <button data-file="${escapeHtml(b.file)}" class="restore-btn">Restore</button>
          </li>`,
          )
          .join("")}
      </ul>
    `;
    for (const btn of pane.querySelectorAll(".restore-btn")) {
      btn.addEventListener("click", async (e) => {
        const backupFile = e.currentTarget.getAttribute("data-file");
        if (!confirm(`Restore from ${backupFile}? The current file will be backed up first.`)) return;
        try {
          await api(`/api/skills/${encodeURIComponent(skill.id)}/restore`, {
            method: "POST",
            body: JSON.stringify({ backupFile }),
          });
          await selectSkill(skill.id);
          flash("✓ Restored from backup");
        } catch (err) {
          flash(`✗ ${err.message}`, true);
        }
      });
    }
  } catch (err) {
    pane.innerHTML = `<p class="error">Failed to load backups: ${escapeHtml(err.message)}</p>`;
  }
}

async function showResolution(skill) {
  const pane = document.getElementById("backups-pane");
  if (!pane) return;
  pane.innerHTML = `<p class="muted">Loading resolution...</p>`;
  try {
    const resolution = await api(`/api/skills/${encodeURIComponent(skill.id)}/resolution`);
    pane.innerHTML = `
      <h3>Resolution · ${escapeHtml(resolution.status)}</h3>
      <p class="muted">${escapeHtml(resolution.reason)}</p>
      <ul class="resolution-list">
        ${(resolution.candidates || [])
          .map((candidate) => `
            <li>
              <div>
                <strong>${escapeHtml(candidate.status)}</strong>
                <span class="muted">${escapeHtml(candidate.layer)} · priority ${candidate.priority}</span>
              </div>
              <code>${escapeHtml(candidate.source)}</code>
              ${candidate.shadowedBy ? `<span class="muted">shadowed by ${escapeHtml(candidate.shadowedBy)}</span>` : ""}
              ${candidate.conflictWith?.length ? `<span class="muted">conflicts with ${escapeHtml(candidate.conflictWith.join(", "))}</span>` : ""}
            </li>
          `)
          .join("")}
      </ul>
    `;
  } catch (err) {
    pane.innerHTML = `<p class="error">Failed to load resolution: ${escapeHtml(err.message)}</p>`;
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

async function selectSkill(id) {
  state.activeId = id;
  try {
    const detail = await api(`/api/skills/${encodeURIComponent(id)}`);
    state.activeSkillKey = scopeAssetKey({ assetType: "skill", source: detail.source });
    state.detail = detail;
    renderList();
    if (!state.editing) renderDetail(detail);
  } catch (err) {
    document.getElementById("skill-detail").innerHTML =
      `<div class="error">Failed to load: ${escapeHtml(String(err))}</div>`;
  }
}

async function selectSkillAsset(key) {
  const asset = state.scopeAssets.find((candidate) =>
    candidate.assetType === "skill" && scopeAssetKey(candidate) === key
  );
  if (!asset) return;
  state.activeSkillKey = key;
  const loaded = state.skills.find((candidate) => candidate.source === asset.source);
  if (loaded) {
    await selectSkill(loaded.id);
    return;
  }
  state.activeId = null;
  state.detail = { ...asset, scopeOnly: true, status: asset.appliesHere ? "shadowed" : "out-of-scope" };
  renderList();
  renderDetail(state.detail);
}

function selectRule(key) {
  state.activeRuleId = key;
  state.ruleDetail = state.scopeAssets.find((asset) =>
    asset.assetType === "rule" && scopeAssetKey(asset) === key
  ) || null;
  renderRuleList();
  renderRuleDetail(state.ruleDetail);
}

function scopeAssetKey(asset) {
  return `${asset.assetType}:${asset.source}`;
}

function openScopeDialog(assetType, asset) {
  state.scopeAsset = { assetType, ...asset };
  state.scopeMode = asset.appliesTo === "global" ? "global" : "projects";
  document.getElementById("scope-asset-name").textContent = asset.name;
  document.getElementById("scope-asset-id").textContent = asset.id;
  document.getElementById("scope-current-project-id").textContent = state.projectIdentity?.id || "unknown";
  document.getElementById("scope-project-ids").value = asset.appliesTo === "global"
    ? ""
    : (asset.appliesTo?.projects || []).join("\n");
  document.getElementById("scope-error").textContent = "";
  renderScopeMode();
  const dialog = document.getElementById("scope-dialog");
  if (!dialog.open) dialog.showModal();
}

function setScopeMode(mode) {
  state.scopeMode = mode === "projects" ? "projects" : "global";
  renderScopeMode();
}

function renderScopeMode() {
  for (const button of document.querySelectorAll("[data-scope-mode]")) {
    button.classList.toggle("active", button.dataset.scopeMode === state.scopeMode);
  }
  document.getElementById("scope-project-fields").hidden = state.scopeMode !== "projects";
}

function useCurrentProjectScope() {
  const input = document.getElementById("scope-project-ids");
  const current = state.projectIdentity?.id;
  if (!current) return;
  const values = parseProjectIds(input.value);
  if (!values.includes(current)) values.push(current);
  input.value = values.join("\n");
}

async function saveScope() {
  const asset = state.scopeAsset;
  if (!asset) return;
  const error = document.getElementById("scope-error");
  error.textContent = "";
  const projects = parseProjectIds(document.getElementById("scope-project-ids").value);
  if (state.scopeMode === "projects" && projects.length === 0) {
    error.textContent = t("scope.required");
    return;
  }
  const appliesTo = state.scopeMode === "global" ? "global" : { projects };
  try {
    const result = await api(
      `/api/assets/${asset.assetType}/${encodeURIComponent(asset.id)}/scope`,
      {
        method: "PUT",
        body: JSON.stringify({
          source: asset.source,
          appliesTo,
          expectedSha256: asset.sha256,
        }),
      },
    );
    document.getElementById("scope-dialog").close();
    state.scopeAsset = null;
    await loadAll();
    if (asset.assetType === "skill") {
      const remainsVisible = state.scopeAssets.some((candidate) =>
        candidate.assetType === "skill" && candidate.source === asset.source
      );
      if (remainsVisible) await selectSkillAsset(scopeAssetKey(asset));
      else {
        state.activeId = null;
        state.activeSkillKey = null;
        state.detail = null;
        renderDetail(null);
      }
      flash(t(result.appliesHere ? "scope.saved" : "scope.scopedOut"));
    } else {
      const remainsVisible = state.scopeAssets.some((candidate) =>
        candidate.assetType === "rule" && candidate.source === asset.source
      );
      if (remainsVisible) selectRule(scopeAssetKey(asset));
      else {
        state.activeRuleId = null;
        state.ruleDetail = null;
        renderRuleDetail(null);
      }
      flash(t(result.appliesHere ? "scope.saved" : "scope.scopedOut"));
    }
  } catch (err) {
    if (err.status === 409 && err.detail?.current) {
      const current = err.detail.current;
      state.scopeAsset = {
        ...asset,
        appliesTo: current.appliesTo,
        sha256: current.sha256,
      };
      state.scopeMode = current.appliesTo === "global" ? "global" : "projects";
      document.getElementById("scope-project-ids").value = current.appliesTo === "global"
        ? ""
        : current.appliesTo.projects.join("\n");
      renderScopeMode();
    }
    error.textContent = err.message;
  }
}

function parseProjectIds(input) {
  return [...new Set(String(input || "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean))];
}

function openCreateAssetDialog(assetType) {
  state.createAssetType = assetType === "rule" ? "rule" : "skill";
  const dialog = document.getElementById("create-asset-dialog");
  document.getElementById("create-asset-title").textContent = t(state.createAssetType === "skill" ? "create.skill" : "create.rule");
  document.getElementById("create-layer-label").textContent = t("create.layer");
  document.getElementById("create-import-label").textContent = t("create.import");
  document.getElementById("create-asset-error").textContent = "";
  document.getElementById("create-asset-yaml").value = createAssetTemplate(state.createAssetType);
  renderCreateLayerOptions();
  if (!dialog.open) dialog.showModal();
}

function renderCreateLayerOptions() {
  const select = document.getElementById("create-skill-layer");
  const label = document.getElementById("create-layer-label");
  if (!select || !label) return;
  const skillMode = state.createAssetType === "skill";
  select.hidden = !skillMode;
  label.hidden = !skillMode;
  select.innerHTML = (state.workspace?.layers || [])
    .filter((layer) => layer.id)
    .map((layer) => `<option value="${escapeHtml(layer.id)}" ${layer.id === "02-workflows" ? "selected" : ""}>${escapeHtml(layer.id)} · ${escapeHtml(String(layer.priority))}</option>`)
    .join("");
}

function createAssetTemplate(assetType) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  if (assetType === "rule") {
    return `schemaVersion: skillcentral.dev/rule/v1
id: new-rule-${stamp}
name: New Rule
description: Describe the covenant this rule enforces
severity: info
tags: [governance]
body: |
  State the rule clearly and include the boundary it protects.
`;
  }
  return `schemaVersion: skillcentral.dev/v1
id: new-skill-${stamp}
name: New Skill
description: Describe when an IDE should use this skill
type: prompt
tags: [workflow]
prompt: |
  Write the reusable instruction here.
`;
}

async function importCreateAssetFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    document.getElementById("create-asset-yaml").value = await file.text();
    document.getElementById("create-asset-error").textContent = "";
  } catch (err) {
    document.getElementById("create-asset-error").textContent = err.message;
  } finally {
    event.target.value = "";
  }
}

async function saveCreateAsset() {
  const error = document.getElementById("create-asset-error");
  error.textContent = "";
  const rawYaml = document.getElementById("create-asset-yaml").value;
  const assetType = state.createAssetType;
  const layerId = document.getElementById("create-skill-layer")?.value || undefined;
  try {
    const result = await api(`/api/assets/${assetType}`, {
      method: "POST",
      body: JSON.stringify({ rawYaml, layerId: assetType === "skill" ? layerId : undefined }),
    });
    document.getElementById("create-asset-dialog").close();
    await loadAll();
    if (assetType === "skill") await selectSkill(result.id);
    else selectRule(scopeAssetKey({ assetType: "rule", source: result.source }));
    flash(t("create.saved"));
  } catch (err) {
    error.textContent = err.message;
  }
}

async function loadIdeTargets() {
  try {
    state.ideTargets = await api("/api/ide-targets");
    if (!state.ideTargets.some((target) => target.target === state.activeIde)) {
      state.activeIde = state.ideTargets[0]?.target || "codex";
    }
    renderIdeTargets();
  } catch (err) {
    const container = document.getElementById("ide-targets");
    if (container) container.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

function renderIdeTargets() {
  const container = document.getElementById("ide-targets");
  if (!container) return;
  container.innerHTML = state.ideTargets.map((target) => {
    const invalid = !target.configReadable && target.configExists;
    const statusKey = invalid ? "ide.invalidConfig" : target.registered ? "ide.registered" : "ide.notRegistered";
    const statusClass = invalid ? "error" : target.registered ? "connected" : "";
    return `
      <button class="ide-card ${target.target === state.activeIde ? "active" : ""}" type="button" data-ide-target="${escapeHtml(target.target)}">
        <span class="ide-card-head">
          <strong>${escapeHtml(target.label)}</strong>
          <span class="connection-state ${statusClass}">${escapeHtml(t(statusKey))}</span>
        </span>
        <p>${escapeHtml(ideDescription(target))}</p>
        <span class="ide-card-foot">
          <code>${escapeHtml(target.configPath)}</code>
          <span>${escapeHtml(target.configFormat.toUpperCase())}</span>
        </span>
      </button>`;
  }).join("");
  const registered = state.ideTargets.filter((target) => target.registered).length;
  const summary = document.getElementById("ide-summary");
  if (summary) summary.textContent = `${registered} / ${state.ideTargets.length} connected`;
  const active = activeIdeRecord();
  if (active) {
    document.getElementById("active-ide-label").textContent = active.label;
    document.getElementById("active-ide-path").textContent = active.configPath;
  }
}

function ideDescription(target) {
  if (state.locale !== "zh-CN") return target.description;
  const descriptions = {
    codex: "Codex 当前项目或用户范围共享的 MCP 配置。",
    claude: "Claude Code 用户配置或 Claude Desktop MCP 配置。",
    trae: "兼容 Trae 国际版与中国版的全局 MCP 配置。",
    cursor: "Cursor 全局 MCP 配置。",
    windsurf: "Windsurf 全局 MCP 配置。",
    cline: "Cline VS Code 扩展的 MCP 配置。",
  };
  return descriptions[target.target] || target.description;
}

function selectIde(target) {
  if (!state.ideTargets.some((candidate) => candidate.target === target)) return;
  state.activeIde = target;
  state.connectPlan = null;
  writePreference("skill-central.ide", target);
  renderIdeTargets();
}

function activeIdeRecord() {
  return state.ideTargets.find((target) => target.target === state.activeIde) || state.ideTargets[0];
}

async function showIdeHealth() {
  const output = document.getElementById("ide-output");
  const target = activeIdeRecord();
  if (!target) return;
  output.textContent = t("ide.checking", { target: target.label });
  try {
    const health = await api(`/api/ide-health?target=${encodeURIComponent(target.target)}&verify=true`);
    output.classList.toggle("error", health.status !== "connected");
    output.innerHTML = `
      <strong>${escapeHtml(target.label)}</strong> · ${escapeHtml(health.status)}<br>
      config: <code>${escapeHtml(health.configPath)}</code><br>
      loaded: ${health.loadedSkillCount} / registry ${health.registryLoadedSkillCount}<br>
      next: ${escapeHtml((health.nextActions || []).join(" "))}
    `;
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function showConnectPlan() {
  const output = document.getElementById("ide-output");
  const target = activeIdeRecord();
  if (!target) return;
  output.textContent = t("ide.building", { target: target.label });
  try {
    const plan = await api("/api/connect/plan", {
      method: "POST",
      body: JSON.stringify({ target: target.target }),
    });
    state.connectPlan = plan;
    output.classList.remove("error");
    output.innerHTML = renderConnectPlan(plan, "Connect plan");
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function applyConnect() {
  const output = document.getElementById("ide-output");
  const active = activeIdeRecord();
  if (!active) return;
  const target = state.connectPlan?.target || active.target;
  const configPath = state.connectPlan?.configPath;
  output.textContent = t("ide.applying", { target: active.label });
  try {
    const plan = await api("/api/connect/apply", {
      method: "POST",
      body: JSON.stringify({ target, configPath, verify: true }),
    });
    state.connectPlan = plan;
    output.classList.toggle("error", !!plan.health && plan.health.status !== "connected");
    output.innerHTML = renderConnectPlan(plan, "Connect applied");
    await loadIdeTargets();
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function rollbackConnect() {
  const output = document.getElementById("ide-output");
  if (!state.connectPlan) {
    output.classList.add("error");
    output.textContent = t("ide.noPlan");
    return;
  }
  const target = activeIdeRecord();
  output.textContent = t("ide.rollingBack", { target: target?.label || state.connectPlan.target });
  try {
    const plan = await api("/api/connect/rollback", {
      method: "POST",
      body: JSON.stringify({
        target: state.connectPlan.target,
        configPath: state.connectPlan.configPath,
        backupPath: state.connectPlan.backupPath,
      }),
    });
    state.connectPlan = plan;
    output.classList.remove("error");
    output.innerHTML = renderConnectPlan(plan, "Connect rolled back");
    await loadIdeTargets();
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

function renderConnectPlan(plan, title) {
  const steps = (plan.steps || [])
    .map((step) => `${step.status} ${step.kind}: ${step.title}`)
    .join("\n");
  const health = plan.health
    ? `<br>health: <strong>${escapeHtml(plan.health.status)}</strong> · loaded ${plan.health.loadedSkillCount}`
    : "";
  return `
    <strong>${escapeHtml(title)}</strong> · ${escapeHtml(plan.target)}<br>
    config: <code>${escapeHtml(plan.configPath)}</code> · ${escapeHtml((plan.configFormat || "json").toUpperCase())}<br>
    backup: <code>${escapeHtml(plan.backupPath || "(new file)")}</code>${health}
    <pre>${escapeHtml(steps)}</pre>
    <pre>${escapeHtml(plan.diffPreview)}</pre>
  `;
}

async function showCompilePreview() {
  const output = document.getElementById("skills-output");
  output.hidden = false;
  const intent = state.activeId || "ci-workflow";
  const target = document.getElementById("compile-target")?.value || "cursor";
  output.textContent = `Compiling ${target} preview...`;
  try {
    const bundle = await api("/api/compile/preview", {
      method: "POST",
      body: JSON.stringify({ target, intent }),
    });
    output.classList.remove("error");
    output.innerHTML = `
      <strong>Compile preview</strong> · ${escapeHtml(target)} · ${escapeHtml(intent)}<br>
      hash: <code>${escapeHtml(bundle.hash)}</code><br>
      selected: ${bundle.selectedSkills.length} · artifacts: ${bundle.artifacts.length}
      <pre>${escapeHtml((bundle.artifacts[0]?.preview || "").split("\n").slice(0, 8).join("\n"))}</pre>
    `;
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function showSyncStatus() {
  const output = document.getElementById("sync-output");
  output.textContent = "Reading sync status...";
  try {
    const report = await api("/api/sync/status");
    output.classList.remove("error");
    output.innerHTML = `
      <strong>Sync status</strong> · local-first ${report.localFirst ? "yes" : "no"}<br>
      app state: <code>${escapeHtml(report.appState.paths.root)}</code><br>
      audit: <code>${escapeHtml(report.appState.paths.audit)}</code><br>
      sync layers: ${report.layers.filter((layer) => layer.syncEnabled).length} / ${report.layers.length}
      <pre>${escapeHtml(report.layers.map((layer) => `${layer.syncEnabled ? "on " : "off"} ${layer.id} ${layer.path}`).join("\n"))}</pre>
    `;
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function showSyncPlan() {
  const output = document.getElementById("sync-output");
  const registryDir = syncRegistryDir();
  if (!registryDir) {
    output.classList.add("error");
    output.textContent = "Enter a local registry checkout path before building a sync plan.";
    return;
  }
  output.textContent = "Building sync dry-run plan...";
  try {
    const plan = await api("/api/sync/plan", {
      method: "POST",
      body: JSON.stringify({ registryDir, direction: syncDirection() }),
    });
    state.syncPlan = plan;
    output.classList.toggle("error", plan.counts.conflict > 0);
    output.innerHTML = renderSyncPlan(plan);
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function applySync() {
  const output = document.getElementById("sync-output");
  const registryDir = syncRegistryDir();
  if (!registryDir) {
    output.classList.add("error");
    output.textContent = "Enter a local registry checkout path before applying sync.";
    return;
  }
  // Apply is the only sync control here that can write files. The server still
  // enforces the confirmation phrase and Phase 4 preflight; this path only
  // collects the explicit user choices for that transaction.
  output.textContent = "Applying sync transaction...";
  try {
    const report = await api("/api/sync/apply", {
      method: "POST",
      body: JSON.stringify({
        registryDir,
        direction: syncDirection(),
        force: syncForce(),
        confirm: syncConfirm(),
        resolutions: syncConflictResolutions(),
      }),
    });
    output.classList.toggle("error", report.preflightBlocked);
    output.innerHTML = renderSyncApplyReport(report, "Sync applied");
  } catch (err) {
    const report = err.detail?.report;
    if (report) {
      output.classList.add("error");
      output.innerHTML = renderSyncApplyReport(report, "Sync apply blocked");
      return;
    }
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function showSyncAudits(append = false) {
  const output = document.getElementById("sync-output");
  output.textContent = "Reading sync audit reports...";
  try {
    const page = await api(syncAuditQuery(append ? state.syncAuditNextCursor : null));
    state.syncAudits = append ? [...state.syncAudits, ...page.items] : page.items;
    state.syncAuditNextCursor = page.nextCursor || null;
    output.classList.remove("error");
    output.innerHTML = `<strong>Sync audit</strong> · loaded ${state.syncAudits.length} report(s).`;
    showAuditView(true);
    renderSyncAuditView();
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

function renderSyncPlan(plan) {
  const counts = Object.entries(plan.counts || {})
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}: ${count}`)
    .join("\n");
  const preview = (plan.operations || [])
    .slice(0, 12)
    .map((op) => `${op.status} ${op.layerId}/${op.relativePath}\n  ${op.reason}`)
    .join("\n");
  const conflicts = (plan.operations || []).filter((op) => op.status === "conflict");
  return `
    <strong>Sync plan</strong> · ${escapeHtml(plan.direction)} · dry-run<br>
    remote: <code>${escapeHtml(plan.remoteRoot)}</code><br>
    manifest: ${plan.scanner?.manifestOk ? "ok" : "invalid"} · operations ${plan.operations?.length || 0}
    <pre>${escapeHtml(counts || "(no operations)")}</pre>
    <pre>${escapeHtml(preview || "(empty)")}</pre>
    ${renderSyncConflictControls(conflicts)}
  `;
}

function renderSyncConflictControls(conflicts) {
  if (!conflicts.length) return "";
  return `
    <div class="sync-conflicts">
      <strong>Conflict resolution</strong>
      ${conflicts.map((op, index) => `
        <label class="sync-conflict">
          <span>
            <code>${escapeHtml(op.layerId)}/${escapeHtml(op.relativePath)}</code>
            <span class="muted">local ${shortHash(op.localHash)} · remote ${shortHash(op.remoteHash)}</span>
          </span>
          <select
            data-sync-resolution-index="${index}"
            data-layer-id="${escapeHtml(op.layerId)}"
            data-relative-path="${escapeHtml(op.relativePath)}"
            data-local-hash="${escapeHtml(op.localHash || "")}"
            data-remote-hash="${escapeHtml(op.remoteHash || "")}"
            aria-label="Sync conflict resolution for ${escapeHtml(op.relativePath)}"
          >
            <option value="">blocked</option>
            <option value="use-remote">use remote</option>
            <option value="use-local">use local</option>
            <option value="skip">skip</option>
          </select>
        </label>
        <pre class="sync-diff">${escapeHtml(op.diffPreview || "(diff preview unavailable)")}</pre>
      `).join("")}
    </div>
  `;
}

function renderSyncAudits(audits) {
  if (!audits.length) {
    return `
      <strong>Sync audit</strong><br>
      ${renderSyncAuditFilters()}
      <span class="muted">No sync apply audit reports match this filter.</span>
    `;
  }
  return `
    <strong>Sync audit</strong> · showing ${audits.length}<br>
    ${renderSyncAuditFilters()}
    <div class="audit-list">
      ${audits.map(renderSyncAuditCard).join("")}
    </div>
    ${state.syncAuditNextCursor ? '<button type="button" class="audit-load-more" data-sync-audit-more>Load more</button>' : ""}
  `;
}

function renderSyncAuditFilters() {
  const layers = syncAuditLayerOptions();
  return `
    <div class="audit-filters">
      <select data-sync-audit-field="outcome" aria-label="Audit outcome filter">
        ${["all", "blocked", "applied", "skipped"].map((value) =>
          `<option value="${value}" ${state.syncAuditFilters.outcome === value ? "selected" : ""}>${value}</option>`,
        ).join("")}
      </select>
      <select data-sync-audit-field="direction" aria-label="Audit direction filter">
        ${["all", "both", "pull", "push"].map((value) =>
          `<option value="${value}" ${state.syncAuditFilters.direction === value ? "selected" : ""}>${value}</option>`,
        ).join("")}
      </select>
      <select data-sync-audit-field="layer" aria-label="Audit layer filter">
        ${layers.map((value) =>
          `<option value="${escapeHtml(value)}" ${state.syncAuditFilters.layer === value ? "selected" : ""}>${escapeHtml(value)}</option>`,
        ).join("")}
      </select>
      <input data-sync-audit-field="since" type="datetime-local" value="${escapeHtml(toDateTimeLocal(state.syncAuditFilters.since))}" aria-label="Audit since filter" />
      <input data-sync-audit-field="until" type="datetime-local" value="${escapeHtml(toDateTimeLocal(state.syncAuditFilters.until))}" aria-label="Audit until filter" />
      <button type="button" data-sync-audit-apply>Apply</button>
      <button type="button" data-sync-audit-reset>Reset</button>
    </div>
  `;
}

function renderSyncAuditView() {
  const view = document.getElementById("sync-audit-view");
  if (!view) return;
  const detail = document.getElementById("sync-audit-detail");
  const list = ensureSyncAuditList(view);
  list.innerHTML = renderSyncAudits(state.syncAudits);
  if (detail && !detail.dataset.loadedPath) {
    detail.textContent = "Select an audit or backup path.";
  }
}

function renderSyncAuditCard(audit) {
  const counts = Object.entries(audit.counts || {})
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}=${count}`)
    .join(" ");
  const operations = (audit.operations || [])
    .slice(0, 8)
    .map((op) => `${op.applyStatus} ${op.plannedStatus} ${op.layerId}/${op.relativePath}\n  ${op.reason}${op.backupPath ? `\n  backup: ${op.backupPath}` : ""}`)
    .join("\n");
  return `
    <section class="audit-card">
      <div>
        <strong>${escapeHtml(audit.direction)}</strong>
        <span class="muted">${escapeHtml(audit.appliedAt)} · preflightBlocked=${audit.preflightBlocked ? "yes" : "no"} · ${escapeHtml(counts || "empty")}</span>
      </div>
      <code>${escapeHtml(audit.auditPath)}</code>
      <div class="audit-card-actions">
        <button type="button" data-open-audit-path="${escapeHtml(audit.auditPath)}">Open audit</button>
        ${backupButtons(audit)}
      </div>
      <pre>${escapeHtml(operations || "(no operations)")}</pre>
    </section>
  `;
}

function backupButtons(audit) {
  const backups = Array.from(new Set((audit.operations || [])
    .map((operation) => operation.backupPath)
    .filter(Boolean)));
  return backups.map((backupPath, index) => `
    <button type="button" data-open-backup-path="${escapeHtml(backupPath)}">Open backup ${index + 1}</button>
  `).join("");
}

function ensureSyncAuditList(view) {
  let list = view.querySelector("[data-sync-audit-list]");
  if (!list) {
    list = document.createElement("div");
    list.dataset.syncAuditList = "true";
    view.insertBefore(list, document.getElementById("sync-audit-detail"));
  }
  return list;
}

function showAuditView(visible) {
  document.getElementById("sync-audit-view").hidden = !visible;
}

async function openSyncEvidence(kind, filePath) {
  const detail = document.getElementById("sync-audit-detail");
  detail.dataset.loadedPath = filePath;
  detail.textContent = `Opening ${kind}...`;
  try {
    const endpoint = kind === "audit" ? "/api/sync/audit-file" : "/api/sync/backup-file";
    const result = await api(`${endpoint}?path=${encodeURIComponent(filePath)}`);
    detail.classList.remove("error");
    detail.innerHTML = `
      <strong>${escapeHtml(kind)}</strong><br>
      <code>${escapeHtml(result.path)}</code>
      <pre>${escapeHtml(result.content)}</pre>
    `;
  } catch (err) {
    detail.classList.add("error");
    detail.textContent = err.message;
  }
}

function syncAuditQuery(cursor) {
  const params = new URLSearchParams({ limit: "20", page: "true" });
  if (cursor) params.set("cursor", cursor);
  for (const [key, value] of Object.entries(state.syncAuditFilters)) {
    if (!value || value === "all") continue;
    const apiValue = key === "since" || key === "until" ? fromDateTimeLocal(value) : value;
    if (apiValue) params.set(key, apiValue);
  }
  return `/api/sync/audits?${params.toString()}`;
}

function syncAuditLayerOptions() {
  const layers = new Set(["all"]);
  for (const audit of state.syncAudits) {
    for (const operation of audit.operations || []) {
      layers.add(operation.layerId);
    }
  }
  return Array.from(layers);
}

function readSyncAuditFilterControls() {
  const next = { ...state.syncAuditFilters };
  for (const el of document.querySelectorAll("[data-sync-audit-field]")) {
    next[el.dataset.syncAuditField] = el.value;
  }
  state.syncAuditFilters = next;
}

function resetSyncAuditFilters() {
  state.syncAuditFilters = {
    outcome: "all",
    direction: "all",
    layer: "all",
    since: "",
    until: "",
  };
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function renderSyncApplyReport(report, title) {
  const counts = Object.entries(report.counts || {})
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}: ${count}`)
    .join("\n");
  const preview = (report.operations || [])
    .slice(0, 12)
    .map((op) => `${op.applyStatus} ${op.plannedStatus} ${op.layerId}/${op.relativePath}\n  ${op.reason}${op.backupPath ? `\n  backup: ${op.backupPath}` : ""}`)
    .join("\n");
  return `
    <strong>${escapeHtml(title)}</strong> · ${escapeHtml(report.direction)} · force ${report.force ? "yes" : "no"}<br>
    preflightBlocked: ${report.preflightBlocked ? "yes" : "no"}<br>
    audit: <code>${escapeHtml(report.auditPath)}</code><br>
    plan: <code>${escapeHtml(report.planHash)}</code>
    <pre>${escapeHtml(counts || "(no operations)")}</pre>
    <pre>${escapeHtml(preview || "(empty)")}</pre>
  `;
}

function syncRegistryDir() {
  return document.getElementById("sync-registry-dir")?.value.trim();
}

function syncDirection() {
  return document.getElementById("sync-direction")?.value || "both";
}

function syncForce() {
  return !!document.getElementById("sync-force")?.checked;
}

function syncConfirm() {
  return document.getElementById("sync-confirm")?.value.trim();
}

function syncConflictResolutions() {
  return Array.from(document.querySelectorAll("[data-sync-resolution-index]"))
    .map((el) => ({
      layerId: el.dataset.layerId,
      relativePath: el.dataset.relativePath,
      choice: el.value,
      expectedLocalHash: el.dataset.localHash || undefined,
      expectedRemoteHash: el.dataset.remoteHash || undefined,
    }))
    .filter((resolution) => resolution.choice);
}

function shortHash(value) {
  return value ? escapeHtml(String(value).slice(0, 8)) : "missing";
}

async function showRuntimeStatus() {
  const output = document.getElementById("runtime-output");
  output.textContent = "Reading runtime status...";
  try {
    const snapshot = await api("/api/runtime/status");
    output.classList.toggle("error", snapshot.status === "error");
    output.innerHTML = renderRuntime(snapshot);
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function startRuntime() {
  const output = document.getElementById("runtime-output");
  output.textContent = "Starting local MCP runtime...";
  try {
    const snapshot = await api("/api/runtime/start", { method: "POST" });
    output.classList.toggle("error", snapshot.status === "error");
    output.innerHTML = renderRuntime(snapshot);
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function stopRuntime() {
  const output = document.getElementById("runtime-output");
  output.textContent = "Stopping local MCP runtime...";
  try {
    const snapshot = await api("/api/runtime/stop", { method: "POST" });
    output.classList.toggle("error", snapshot.status === "error");
    output.innerHTML = renderRuntime(snapshot);
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

function renderRuntime(snapshot) {
  const stderr = (snapshot.stderrLines || []).slice(-8).join("\n");
  const stdout = (snapshot.stdoutLines || []).slice(-4).join("\n");
  return `
    <strong>Runtime</strong> · ${escapeHtml(snapshot.status)} · ${escapeHtml(snapshot.transport)}<br>
    command: <code>${escapeHtml([snapshot.command, ...(snapshot.args || [])].join(" "))}</code><br>
    ${snapshot.pid ? `pid: ${snapshot.pid}<br>` : ""}
    ${snapshot.lastError ? `last error: ${escapeHtml(snapshot.lastError)}<br>` : ""}
    <span class="muted">diagnostic stderr</span>
    <pre>${escapeHtml(stderr || "(empty)")}</pre>
    <span class="muted">protocol stdout sample</span>
    <pre>${escapeHtml(stdout || "(captured, not printed)")}</pre>
  `;
}

async function loadGithubStatus() {
  const statusText = document.getElementById("github-status-text");
  if (statusText) statusText.textContent = "...";
  try {
    const status = await api("/api/auth/github/status");
    state.githubStatus = status;
    renderGithubStatus(status);
  } catch (err) {
    state.githubStatus = { available: false, loggedIn: false, error: err.message };
    renderGithubStatus(state.githubStatus);
  }
}

function renderGithubStatus(status) {
  const connected = !!status?.loggedIn;
  const available = status?.available !== false;
  const loginAvailable = status?.loginAvailable !== false;
  const label = connected
    ? t("github.connected")
    : available && loginAvailable
      ? t("github.notConnected")
      : available
        ? t("github.notConfigured")
        : t("github.unavailable");
  const sidebar = document.getElementById("github-sidebar-status");
  const detail = document.getElementById("github-status-text");
  if (sidebar) sidebar.textContent = label;
  if (detail) detail.textContent = label;
  const login = document.getElementById("btn-github-login");
  const logout = document.getElementById("btn-github-logout");
  if (login) login.disabled = connected || !available || !loginAvailable;
  if (logout) logout.disabled = !connected || !available;
  const statusError = !available
    ? status?.error
    : !loginAvailable
      ? t("github.configurationHelp")
      : undefined;
  if (statusError) {
    const output = document.getElementById("github-auth-output");
    output.classList.add("error");
    output.textContent = statusError;
  }
}

async function startGithubLogin() {
  const output = document.getElementById("github-auth-output");
  output.classList.remove("error");
  output.textContent = t("github.requesting");
  clearGithubPollTimer();
  try {
    const device = await api("/api/auth/github/device", {
      method: "POST",
    });
    output.innerHTML = `
      <a href="${escapeHtml(device.verificationUri)}" target="_blank" rel="noreferrer">${escapeHtml(t("github.open"))}</a><br>
      <span class="device-code">${escapeHtml(device.userCode)}</span><br>
      <span>${escapeHtml(t("github.waiting"))}</span>`;
    scheduleGithubPoll(device.flowId, device.interval);
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

function scheduleGithubPoll(flowId, intervalSeconds) {
  clearGithubPollTimer();
  state.githubPollTimer = setTimeout(() => pollGithubLogin(flowId), Math.max(1, intervalSeconds) * 1000);
}

async function pollGithubLogin(flowId) {
  const output = document.getElementById("github-auth-output");
  try {
    const result = await api("/api/auth/github/poll", {
      method: "POST",
      body: JSON.stringify({ flowId }),
    });
    if (result.pending) {
      scheduleGithubPoll(flowId, result.retryAfter);
      return;
    }
    clearGithubPollTimer();
    output.classList.remove("error");
    output.textContent = result.user?.login
      ? `${t("github.success")}: @${result.user.login}`
      : t("github.success");
    await loadGithubStatus();
  } catch (err) {
    clearGithubPollTimer();
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function logoutGithub() {
  const output = document.getElementById("github-auth-output");
  clearGithubPollTimer();
  try {
    await api("/api/auth/github/logout", { method: "POST" });
    output.classList.remove("error");
    output.textContent = t("github.notConnected");
    await loadGithubStatus();
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

function clearGithubPollTimer() {
  if (state.githubPollTimer) clearTimeout(state.githubPollTimer);
  state.githubPollTimer = null;
}

async function loadUpdateStatus() {
  try {
    state.updateStatus = await api("/api/update/status");
  } catch (err) {
    state.updateStatus = {
      supported: false,
      status: "error",
      currentVersion: "unknown",
      message: err.message,
    };
  }
  renderUpdateStatus(state.updateStatus);
  scheduleUpdatePollIfNeeded();
}

function renderUpdateStatus(status) {
  const statusText = document.getElementById("update-status-text");
  const output = document.getElementById("update-output");
  const checkButton = document.getElementById("btn-update-check");
  const installButton = document.getElementById("btn-update-install");
  const progress = document.getElementById("update-progress");
  const progressBar = document.getElementById("update-progress-bar");
  if (!statusText || !output || !checkButton || !installButton || !progress || !progressBar) return;

  const version = status.availableVersion || status.currentVersion || "";
  const percent = Number.isFinite(status.progressPercent) ? status.progressPercent : 0;
  const key = status.status === "unsupported" && status.supported !== false
    ? "setup-required"
    : status.supported === false ? "unsupported" : (status.status || "idle");
  statusText.textContent = t(`update.${key}`, { version, percent: String(percent) });
  output.textContent = status.errorCode
    ? t(`update.error.${status.errorCode}`)
    : (status.message || (status.provider ? `${status.provider} · v${status.currentVersion}` : ""));
  output.classList.toggle("error", status.status === "error");
  checkButton.disabled = !status.supported || ["checking", "downloading", "installing"].includes(status.status);
  installButton.disabled = !status.supported || !["available", "ready"].includes(status.status);
  progress.hidden = !["downloading", "ready", "installing"].includes(status.status);
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function checkForUpdates() {
  clearUpdatePollTimer();
  try {
    state.updateStatus = await api("/api/update/check", { method: "POST" });
  } catch (err) {
    state.updateStatus = { ...state.updateStatus, status: "error", message: err.message };
  }
  renderUpdateStatus(state.updateStatus);
  scheduleUpdatePollIfNeeded();
}

async function installUpdate() {
  clearUpdatePollTimer();
  try {
    state.updateStatus = await api("/api/update/install", { method: "POST" });
  } catch (err) {
    state.updateStatus = { ...state.updateStatus, status: "error", message: err.message };
  }
  renderUpdateStatus(state.updateStatus);
  scheduleUpdatePollIfNeeded();
}

function scheduleUpdatePollIfNeeded() {
  clearUpdatePollTimer();
  if (!["checking", "downloading", "installing"].includes(state.updateStatus?.status)) return;
  state.updatePollTimer = setTimeout(loadUpdateStatus, 1500);
}

function clearUpdatePollTimer() {
  if (state.updatePollTimer) clearTimeout(state.updatePollTimer);
  state.updatePollTimer = null;
}

function openSettings() {
  const dialog = document.getElementById("settings-dialog");
  if (!dialog.open) dialog.showModal();
  loadGithubStatus();
  loadUpdateStatus();
}

async function loadAll() {
  try {
    const [health, workspace, skills, rules, scopes] = await Promise.all([
      api("/api/health"),
      api("/api/workspace"),
      api("/api/skills"),
      api("/api/rules"),
      api("/api/assets/scopes"),
    ]);
    state.workspace = workspace;
    state.skills = skills;
    state.rules = rules;
    state.scopeAssets = scopes.assets;
    state.projectIdentity = scopes.project;
    renderHealth(health);
    renderList();
    renderRuleList();
    const projectLabel = document.getElementById("project-identity-label");
    if (projectLabel) projectLabel.textContent = scopes.project.id;
  } catch (err) {
    document.getElementById("health").innerHTML = `<span class="status-dot"></span><span>offline</span>`;
    document.getElementById("health").classList.add("error");
    console.error(err);
  }
  await loadIdeTargets();
}

async function changeWorkspace() {
  const current = state.workspace?.rootDir || "";
  const rootDir = prompt(t("workspace.prompt"), current);
  if (rootDir === null) return;
  const trimmed = rootDir.trim();
  if (!trimmed || trimmed === current) return;
  try {
    state.workspace = await api("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ rootDir: trimmed }),
    });
    state.activeId = null;
    state.activeSkillKey = null;
    state.activeRuleId = null;
    state.detail = null;
    state.ruleDetail = null;
    state.editing = false;
    await loadAll();
    renderDetail(null);
    renderRuleDetail(null);
    flash(t("workspace.changed"));
  } catch (err) {
    flash(`✗ ${err.message}`, true);
  }
}

function flash(msg, isError) {
  const el = document.getElementById("flash");
  if (!el) return;
  el.textContent = msg;
  el.className = `flash ${isError ? "error" : "ok"}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", () => {
  // Remove Client IDs saved by alpha.1. OAuth application identity is now
  // fixed by the local server and must not remain user-controlled browser state.
  removePreference("skill-central.githubClientId");
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => navigate(button.dataset.view));
  }
  document.getElementById("ide-targets").addEventListener("click", (event) => {
    const card = event.target.closest("[data-ide-target]");
    if (card) selectIde(card.dataset.ideTarget);
  });
  document.getElementById("skill-search").addEventListener("input", (event) => {
    state.skillFilter = event.target.value;
    renderList();
  });
  document.getElementById("rule-search").addEventListener("input", (event) => {
    state.ruleFilter = event.target.value;
    renderRuleList();
  });
  document.getElementById("btn-ide-health").addEventListener("click", showIdeHealth);
  document.getElementById("btn-connect-plan").addEventListener("click", showConnectPlan);
  document.getElementById("btn-connect-apply").addEventListener("click", applyConnect);
  document.getElementById("btn-connect-rollback").addEventListener("click", rollbackConnect);
  document.getElementById("btn-runtime-status").addEventListener("click", showRuntimeStatus);
  document.getElementById("btn-runtime-start").addEventListener("click", startRuntime);
  document.getElementById("btn-runtime-stop").addEventListener("click", stopRuntime);
  document.getElementById("btn-compile-preview").addEventListener("click", showCompilePreview);
  document.getElementById("btn-create-skill").addEventListener("click", () => openCreateAssetDialog("skill"));
  document.getElementById("btn-create-rule").addEventListener("click", () => openCreateAssetDialog("rule"));
  document.getElementById("create-import-file").addEventListener("change", importCreateAssetFile);
  document.getElementById("btn-save-create-asset").addEventListener("click", saveCreateAsset);
  for (const id of ["btn-close-create-asset", "btn-cancel-create-asset"]) {
    document.getElementById(id).addEventListener("click", () => {
      document.getElementById("create-asset-dialog").close();
    });
  }
  document.getElementById("create-asset-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.getElementById("btn-sync-status").addEventListener("click", showSyncStatus);
  document.getElementById("btn-sync-plan").addEventListener("click", showSyncPlan);
  document.getElementById("btn-sync-apply").addEventListener("click", applySync);
  document.getElementById("btn-sync-audits").addEventListener("click", showSyncAudits);
  document.getElementById("btn-close-sync-audit").addEventListener("click", () => showAuditView(false));
  document.getElementById("sync-output").addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-sync-audit-filter]");
    if (!filterButton) return;
    state.syncAuditFilters.outcome = filterButton.dataset.syncAuditFilter;
    renderSyncAuditView();
  });
  document.getElementById("sync-audit-view").addEventListener("click", (event) => {
    const applyButton = event.target.closest("[data-sync-audit-apply]");
    if (applyButton) {
      readSyncAuditFilterControls();
      state.syncAudits = [];
      state.syncAuditNextCursor = null;
      showSyncAudits();
      return;
    }
    const resetButton = event.target.closest("[data-sync-audit-reset]");
    if (resetButton) {
      resetSyncAuditFilters();
      state.syncAudits = [];
      state.syncAuditNextCursor = null;
      showSyncAudits();
      return;
    }
    const moreButton = event.target.closest("[data-sync-audit-more]");
    if (moreButton) {
      showSyncAudits(true);
      return;
    }
    const auditButton = event.target.closest("[data-open-audit-path]");
    if (auditButton) {
      openSyncEvidence("audit", auditButton.dataset.openAuditPath);
      return;
    }
    const backupButton = event.target.closest("[data-open-backup-path]");
    if (backupButton) {
      openSyncEvidence("backup", backupButton.dataset.openBackupPath);
    }
  });
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    // Manual refresh: tell the server to reload its engine from disk,
    // then re-pull the list and the active detail. Without the server
    // reload, external file edits (e.g. in vim) wouldn't surface because
    // the in-memory engine was populated at startup only.
    try {
      await api("/api/reload", { method: "POST" });
      await loadAll();
      if (state.activeId) await selectSkill(state.activeId);
      flash("↻ Refreshed");
    } catch (err) {
      flash(`✗ ${err.message}`, true);
    }
  });
  document.getElementById("btn-refresh-rules").addEventListener("click", async () => {
    try {
      await api("/api/reload", { method: "POST" });
      await loadAll();
      if (state.activeRuleId) selectRule(state.activeRuleId);
      flash("↻ Refreshed");
    } catch (err) {
      flash(`✗ ${err.message}`, true);
    }
  });
  for (const button of document.querySelectorAll("[data-scope-mode]")) {
    button.addEventListener("click", () => setScopeMode(button.dataset.scopeMode));
  }
  document.getElementById("btn-use-current-project").addEventListener("click", useCurrentProjectScope);
  document.getElementById("btn-save-scope").addEventListener("click", saveScope);
  for (const id of ["btn-close-scope", "btn-cancel-scope"]) {
    document.getElementById(id).addEventListener("click", () => {
      document.getElementById("scope-dialog").close();
      state.scopeAsset = null;
    });
  }
  document.getElementById("scope-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
      state.scopeAsset = null;
    }
  });
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("btn-workspace").addEventListener("click", changeWorkspace);
  document.getElementById("btn-close-settings").addEventListener("click", () => {
    document.getElementById("settings-dialog").close();
  });
  document.getElementById("settings-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  for (const button of document.querySelectorAll("[data-theme-value]")) {
    button.addEventListener("click", () => {
      state.theme = button.dataset.themeValue;
      writePreference("skill-central.theme", state.theme);
      applyPreferences();
    });
  }
  for (const button of document.querySelectorAll("[data-locale-value]")) {
    button.addEventListener("click", () => {
      state.locale = button.dataset.localeValue;
      writePreference("skill-central.locale", state.locale);
      applyPreferences();
    });
  }
  document.getElementById("btn-github-login").addEventListener("click", startGithubLogin);
  document.getElementById("btn-github-logout").addEventListener("click", logoutGithub);
  document.getElementById("btn-update-check").addEventListener("click", checkForUpdates);
  document.getElementById("btn-update-install").addEventListener("click", installUpdate);
  applyPreferences();
  loadAll();
});
