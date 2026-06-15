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
        <span class="skill-id">${escapeHtml(s.id)}</span>
      `;
      li.addEventListener("click", () => selectSkill(s.id));
      ul.appendChild(li);
    }
  }
}

function renderDetail(skill) {
  const el = document.getElementById("detail");
  if (!skill) {
    el.innerHTML = `<div class="placeholder">Select a skill to preview.</div>`;
    return;
  }
  const tags = (skill.tags || []).join(", ");
  el.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(skill.name)}</h2>
        <div class="meta">
          <span>id: ${escapeHtml(skill.id)}</span>
          <span>type: ${escapeHtml(skill.type)}</span>
          <span>layer: ${escapeHtml(skill.layer || "?")}</span>
          <span>priority: ${skill.priority ?? "?"}</span>
          <span>sha: ${(skill.sha256 || "").slice(0, 12)}…</span>
        </div>
      </div>
      <div class="actions">
        <button id="btn-edit">Edit</button>
        <button id="btn-backups">Backups</button>
      </div>
    </div>
    <p>${escapeHtml(skill.description || "")}</p>
    <p class="muted">tags: ${escapeHtml(tags || "(none)")}</p>
    <h3>Prompt</h3>
    <pre id="prompt-body">${escapeHtml(skill.prompt || "(no prompt)")}</pre>
    <div id="backups-pane"></div>
  `;
  document.getElementById("btn-edit").addEventListener("click", () => enterEditMode(skill));
  document.getElementById("btn-backups").addEventListener("click", () => showBackups(skill));
}

function renderEditForm(skill, draftYaml, conflictMsg) {
  const el = document.getElementById("detail");
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
    // Success — reload detail and re-render read-only.
    state.editing = false;
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
      document.getElementById("detail").appendChild(comparison);
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

// ── Actions ────────────────────────────────────────────────────────────────

async function selectSkill(id) {
  state.activeId = id;
  renderList();
  try {
    const detail = await api(`/api/skills/${encodeURIComponent(id)}`);
    state.detail = detail;
    if (!state.editing) renderDetail(detail);
  } catch (err) {
    document.getElementById("detail").innerHTML =
      `<div class="error">Failed to load: ${escapeHtml(String(err))}</div>`;
  }
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

document.addEventListener("DOMContentLoaded", loadAll);