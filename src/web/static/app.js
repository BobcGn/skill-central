// ============================================================================
// skill-central · web board frontend
// ----------------------------------------------------------------------------
// Vanilla JS — no build step. Fetches /api/skills, renders the list, shows
// the prompt body when a skill is clicked, and supports in-browser editing
// with sha256-conflict detection + .bak restore.
// ============================================================================

const state = {
  skills: [],
  activeId: null,
  detail: null,        // last fetched /api/skills/:id
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
};

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
  if (health.ok) {
    el.textContent = `v${health.version} · ${state.skills.length} skills`;
    el.classList.remove("error");
  } else {
    el.textContent = "offline";
    el.classList.add("error");
  }
}

function renderList() {
  const ul = document.getElementById("skill-list");
  ul.innerHTML = "";
  if (state.skills.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "(no skills loaded)";
    ul.appendChild(li);
    return;
  }
  const byLayer = new Map();
  for (const s of state.skills) {
    const k = s.layer || "(unknown)";
    if (!byLayer.has(k)) byLayer.set(k, []);
    byLayer.get(k).push(s);
  }
  for (const [layer, skills] of byLayer) {
    const title = document.createElement("li");
    title.className = "section-title";
    title.textContent = `${layer} (${skills.length})`;
    ul.appendChild(title);
    for (const s of skills) {
      const li = document.createElement("li");
      if (s.id === state.activeId) li.classList.add("active");
      li.dataset.id = s.id;
      li.innerHTML = `
        <span class="skill-name">${escapeHtml(s.name)}</span>
        <span class="skill-id">${escapeHtml(s.id)} · ${escapeHtml(s.type)} · ${escapeHtml(s.status || "effective")}</span>
      `;
      li.addEventListener("click", () => selectSkill(s.id));
      ul.appendChild(li);
    }
  }
}

function renderDetail(skill) {
  const el = document.getElementById("skill-detail");
  if (!skill) {
    el.innerHTML = `<div class="placeholder">Select a skill to preview.</div>`;
    return;
  }
  const tags = (skill.tags || []).join(", ");
  // Bilingual prompt: render English if present, plus a  中文 sub-section
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
      <pre id="prompt-body"><span class="muted">(no prompt)</span></pre>
    `;
  }
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
          <span>sha: ${(skill.sha256 || "").slice(0, 12)}…</span>
        </div>
      </div>
      <div class="actions">
        <button id="btn-edit">Edit</button>
        <button id="btn-resolution">Resolution</button>
        <button id="btn-backups">Backups</button>
      </div>
    </div>
    <p>${escapeHtml(skill.description || "")}</p>
    <p class="muted">tags: ${escapeHtml(tags || "(none)")}</p>
    ${promptHtml}
    <div id="backups-pane"></div>
  `;
  document.getElementById("btn-edit").addEventListener("click", () => enterEditMode(skill));
  document.getElementById("btn-resolution").addEventListener("click", () => showResolution(skill));
  document.getElementById("btn-backups").addEventListener("click", () => showBackups(skill));
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
        <button id="btn-save">Save</button>
        <button id="btn-cancel">Cancel</button>
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
  renderList();
  try {
    const detail = await api(`/api/skills/${encodeURIComponent(id)}`);
    state.detail = detail;
    if (!state.editing) renderDetail(detail);
  } catch (err) {
    document.getElementById("skill-detail").innerHTML =
      `<div class="error">Failed to load: ${escapeHtml(String(err))}</div>`;
  }
}

async function showIdeHealth() {
  const output = document.getElementById("console-output");
  output.textContent = "Checking Cursor registration...";
  try {
    const health = await api("/api/ide-health?target=cursor");
    output.classList.toggle("error", !["connected", "registered"].includes(health.status));
    output.innerHTML = `
      <strong>Cursor</strong> · ${escapeHtml(health.status)}<br>
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
  const output = document.getElementById("console-output");
  output.textContent = "Building Cursor connect plan...";
  try {
    const plan = await api("/api/connect/plan", {
      method: "POST",
      body: JSON.stringify({ target: "cursor" }),
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
  const output = document.getElementById("console-output");
  const target = state.connectPlan?.target || "cursor";
  const configPath = state.connectPlan?.configPath;
  output.textContent = "Applying Cursor connect plan...";
  try {
    const plan = await api("/api/connect/apply", {
      method: "POST",
      body: JSON.stringify({ target, configPath, verify: true }),
    });
    state.connectPlan = plan;
    output.classList.toggle("error", !!plan.health && plan.health.status !== "connected");
    output.innerHTML = renderConnectPlan(plan, "Connect applied");
  } catch (err) {
    output.classList.add("error");
    output.textContent = err.message;
  }
}

async function rollbackConnect() {
  const output = document.getElementById("console-output");
  if (!state.connectPlan) {
    output.classList.add("error");
    output.textContent = "Build or apply a connect plan before rollback.";
    return;
  }
  output.textContent = "Rolling back Cursor connect plan...";
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
    config: <code>${escapeHtml(plan.configPath)}</code><br>
    backup: <code>${escapeHtml(plan.backupPath || "(new file)")}</code>${health}
    <pre>${escapeHtml(steps)}</pre>
    <pre>${escapeHtml(plan.diffPreview)}</pre>
  `;
}

async function showCompilePreview() {
  const output = document.getElementById("console-output");
  const intent = state.activeId || "ci-workflow";
  output.textContent = "Compiling Cursor preview...";
  try {
    const bundle = await api("/api/compile/preview", {
      method: "POST",
      body: JSON.stringify({ target: "cursor", intent }),
    });
    output.classList.remove("error");
    output.innerHTML = `
      <strong>Compile preview</strong> · cursor · ${escapeHtml(intent)}<br>
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
  const output = document.getElementById("console-output");
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
  const output = document.getElementById("console-output");
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
  const output = document.getElementById("console-output");
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
  const output = document.getElementById("console-output");
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
  document.getElementById("skill-detail").hidden = visible;
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
  const output = document.getElementById("console-output");
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
  const output = document.getElementById("console-output");
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
  const output = document.getElementById("console-output");
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

async function loadAll() {
  try {
    const health = await api("/api/health");
    state.skills = await api("/api/skills");
    renderHealth(health);
    renderList();
  } catch (err) {
    document.getElementById("health").textContent = "offline";
    document.getElementById("health").classList.add("error");
    console.error(err);
  }
}

function flash(msg, isError) {
  const el = document.getElementById("flash");
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error" : "ok";
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3500);
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
  document.getElementById("btn-ide-health").addEventListener("click", showIdeHealth);
  document.getElementById("btn-connect-plan").addEventListener("click", showConnectPlan);
  document.getElementById("btn-connect-apply").addEventListener("click", applyConnect);
  document.getElementById("btn-connect-rollback").addEventListener("click", rollbackConnect);
  document.getElementById("btn-runtime-status").addEventListener("click", showRuntimeStatus);
  document.getElementById("btn-runtime-start").addEventListener("click", startRuntime);
  document.getElementById("btn-runtime-stop").addEventListener("click", stopRuntime);
  document.getElementById("btn-compile-preview").addEventListener("click", showCompilePreview);
  document.getElementById("btn-sync-status").addEventListener("click", showSyncStatus);
  document.getElementById("btn-sync-plan").addEventListener("click", showSyncPlan);
  document.getElementById("btn-sync-apply").addEventListener("click", applySync);
  document.getElementById("btn-sync-audits").addEventListener("click", showSyncAudits);
  document.getElementById("btn-close-sync-audit").addEventListener("click", () => showAuditView(false));
  document.getElementById("console-output").addEventListener("click", (event) => {
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
  loadAll();
});
