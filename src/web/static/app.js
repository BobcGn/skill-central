// ============================================================================
// skill-central · web board frontend
// ----------------------------------------------------------------------------
// Vanilla JS — no build step. Fetches /api/skills, renders the list, and
// shows the prompt body when a skill is clicked.
// ============================================================================

const state = {
  skills: [],
  activeId: null,
};

// ── API helpers ────────────────────────────────────────────────────────────

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) {
    throw new Error(`${path} → ${r.status}`);
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
  // Group by layer.
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
    <h2>${escapeHtml(skill.name)}</h2>
    <div class="meta">
      <span>id: ${escapeHtml(skill.id)}</span>
      <span>type: ${escapeHtml(skill.type)}</span>
      <span>layer: ${escapeHtml(skill.layer || "?")}</span>
      <span>priority: ${skill.priority ?? "?"}</span>
    </div>
    <p>${escapeHtml(skill.description || "")}</p>
    <p class="muted">tags: ${escapeHtml(tags || "(none)")}</p>
    <h3>Prompt</h3>
    <pre>${escapeHtml(skill.prompt || "(no prompt)")}</pre>
  `;
}

// ── Actions ────────────────────────────────────────────────────────────────

async function selectSkill(id) {
  state.activeId = id;
  renderList();
  try {
    const detail = await api(`/api/skills/${encodeURIComponent(id)}`);
    renderDetail(detail);
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", loadAll);