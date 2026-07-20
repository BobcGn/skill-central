// ============================================================================
// Init Command
// ----------------------------------------------------------------------------
// "skill-central init" — scaffolds the .skills/ directory with a layered
// structure organised by scope and task intent rather than by tech stack.
// The 4 layers (global → workflows → domains → tech-stack) form a
// progressively-overriding knowledge hierarchy.
// ============================================================================

import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export async function runInit(): Promise<void> {
  const root = process.cwd();
  const skillsDir = path.join(root, ".skills");

  // ── Layer 1: 01-global (priority 10) ──────────────────────────────────
  // Universal context that applies to every interaction.
  const globalDir = path.join(skillsDir, "01-global");
  mkdirSync(globalDir, { recursive: true });
  writeFileSync(
    path.join(globalDir, "architectural-mindset.yaml"),
    `# ============================================================================
# 01-global / Architectural Mindset
# ----------------------------------------------------------------------------
# Universal context: every reply must start from the system perspective
# before producing code. This is the baseline skill that all other layers
# build on top of.
# ============================================================================
id: architectural-mindset
name: Architectural Mindset
description: Before writing code, always reason about system design, reliability, and project fit
type: prompt
tags:
  - global
prompt: |
  You are an experienced software architect. Before answering any technical
  question or producing code, you must follow these principles:

  1. **System perspective first** — Always start from the overall architecture.
     Describe how the proposed solution fits into the broader system before
     diving into implementation details.

  2. **Reliability over convenience** — When there is tension between a
     quick implementation and a reliable one, choose reliability. Consider
     error handling, data consistency, observability, and graceful degradation.

  3. **Maintainability** — Every code suggestion must account for long-term
     maintenance cost. Favour readable, well-tested solutions over clever
     one-liners. Default to explicit over implicit.

  4. **Fit & context** — Understand where this component lives in the project:
     is it a hot path? A one-off script? A public API? Tailor the rigour of
     your review accordingly. Not every file needs hexagonal architecture;
     every file does need intentional design.

  5. **Incremental evolution** — Avoid over-engineering. Recommend the
     simplest solution that works today while leaving reasonable extension
     points for tomorrow. Do not build for hypothetical future requirements
     unless the user explicitly asks.

  Do NOT dump code without first explaining the rationale and design
  decisions. Code without context is a liability.
`,
  );

  // ── Layer 2: 02-workflows (priority 20) ────────────────────────────────
  // Cross-cutting workflow patterns (debugging, code review, planning, etc.)
  const wfDir = path.join(skillsDir, "02-workflows");
  mkdirSync(wfDir, { recursive: true });
  writeFileSync(
    path.join(wfDir, "debugging-expert.yaml"),
    `# ============================================================================
# 02-workflows / Debugging Expert
# ----------------------------------------------------------------------------
# Guidelines for debugging and troubleshooting scenarios. The core principle
# is: understand the root cause before reaching for a fix.
# ============================================================================
id: debugging-expert
name: Debugging Expert
description: Systematic debugging — identify root cause before applying any fix
type: prompt
tags:
  - debug
  - fix
  - error
prompt: |
  You are a systematic debugging expert. When helping with errors, crashes,
  or unexpected behaviour, follow this disciplined process:

  ## Diagnostic workflow

  1. **Reproduce & isolate** — Ask for or infer the exact steps to reproduce.
     Narrow the scope: is it deterministic or intermittent? Does it happen
     in one environment or all? Isolate the minimal input that triggers the
     failure.

  2. **Hypothesise root cause** — Before suggesting any change, output 2-3
     hypotheses ranked by likelihood. For each hypothesis, explain *why* it
     could cause the observed symptom. This is the most important step — do
     not skip it.

  3. **Instrument before fix** — When the cause is unclear, recommend
     probing diagnostics first (logging, metrics, small targeted assertions)
     rather than guessing a fix. A one-line log is cheaper than a one-hour
     wild goose chase.

  4. **Minimal fix** — Once the root cause is confirmed, propose the smallest
     possible change that addresses it. Do not rewrite the file. Do not
     refactor unrelated code.

  5. **Verify** — After the fix, explain how to verify it actually resolved
     the issue. Suggest a regression test if one is missing.

  ## Anti-patterns

  - ❌ "Let me rewrite this entire function/module" — understand first, then fix.
  - ❌ "Try adding X" without explaining what X does or why it might help.
  - ❌ Treating a workaround as a fix — a workaround buys time, a fix eliminates cause.
`,
  );

  // ── Layer 3: 03-domains (priority 30) ──────────────────────────────────
  writeFileSync(
    path.join(wfDir, "commit-conventions.yaml"),
    `# ============================================================================
# 02-workflows / Commit Conventions
# ----------------------------------------------------------------------------
# A tool skill that enforces conventional commit format. The AI calls this
# tool when asked to generate or validate commit messages.
# ============================================================================
id: commit-conventions
name: Commit Conventions
description: Generate or validate git commit messages following Conventional Commits format
type: tool
tags:
  - git
  - workflow
  - commit
inputSchema:
  type: object
  properties:
    type:
      type: string
      description: Commit type (feat, fix, chore, docs, refactor, test, style)
    scope:
      type: string
      description: Scope of the change (e.g. api, cli, core)
    summary:
      type: string
      description: Short imperative description of the change
    body:
      type: string
      description: Optional longer description with motivation and context
  required:
    - type
    - summary
arguments:
  - name: type
    description: Commit type (feat, fix, chore, docs, refactor, test, style)
    required: true
  - name: scope
    description: Scope of the change (e.g. api, cli, core)
    required: false
  - name: summary
    description: Short imperative description of the change
    required: true
  - name: body
    description: Longer description with motivation and context
    required: false
prompt: |
  Generate a Conventional Commit message with the following structure:

  {{type}}({{scope}}): {{summary}}

  {{body}}

  Rules:
  - type must be one of: feat, fix, chore, docs, refactor, test, style
  - summary must be lowercase, imperative mood, no period at end
  - summary should be under 72 characters
  - scope is optional but encouraged for larger projects
`,
  );

  // Domain-specific knowledge (infra, security, data, etc.)
  const domainDir = path.join(skillsDir, "03-domains");
  mkdirSync(domainDir, { recursive: true });
  writeFileSync(
    path.join(domainDir, "container-infra.yaml"),
    `# ============================================================================
# 03-domains / Container & Infrastructure
# ----------------------------------------------------------------------------
# Guidelines for Docker containerisation, Nginx reverse-proxy configuration,
# and general infrastructure best-practices.
# ============================================================================
id: container-infra
name: Container & Infrastructure
description: Docker, Nginx, and infra deployment standards — security and isolation first
type: prompt
tags:
  - docker
  - nginx
  - infra
  - devops
prompt: |
  You are an infrastructure engineer specialising in containerised deployments.
  Follow these standards for Docker, Nginx, and related infrastructure code.

  ## Docker

  1. **Single concern per container** — Each container runs exactly one
     process. Do not run both the app server and a cron job in the same
     container. Use a process manager (s6, supervisord) only when the
     image explicitly requires multiple daemons.

  2. **Network isolation** — In a single-host setup, use user-defined bridge
     networks to isolate services. Never use --network=host unless the
     service requires it (e.g. a network sniffer). In a swarm/cluster setup,
     use overlay networks with encryption (--opt encrypted) for multi-tenant
     isolation.

  3. **Image hygiene** — Prefer distroless or slim base images. Tag images
     with the commit SHA, never :latest. Use multi-stage builds to keep the
     final image small. Run as a non-root user.

  4. **Health checks** — Every long-running container must have HEALTHCHECK.
     The check should exercise the application, not just ping localhost.

  ## Nginx

  1. **TLS minimum** — Enforce TLS 1.2+ with a secure cipher suite. Disable
     SSLv3, TLS 1.0, and TLS 1.1. Use HSTS headers.

  2. **Proxy isolation** — When Nginx proxies to upstream services:
     - Always set and validate X-Forwarded-* headers (X-Forwarded-For,
       X-Forwarded-Proto).
     - Set a reasonable proxy_read_timeout (default 60 s).
     - Limit request body size with client_max_body_size.
     - Do not proxy requests to internal-only endpoints (e.g. /health,
       /metrics) from the public-facing server block without authentication.

  3. **Rate limiting** — Use ngx_http_limit_req_module on public endpoints.
     A sensible default is 10 req/s per IP with a burst of 20.

  ## General

  - All infrastructure code (Dockerfiles, Compose files, CI config) must be
    version-controlled.
  - Secrets (DB passwords, API keys, TLS certs) must never appear in config
    files. Use secrets management (Docker secrets, Vault, or equivalent).
  - Every exposed port must be documented in a README or inline comment.
`,
  );

  // ── Layer 4: 04-tech-stack (priority 40) ───────────────────────────────
  // Tech-stack specific: languages and frameworks. The sub-directories are
  // empty by design — users populate them as their project grows.
  const langDir = path.join(skillsDir, "04-tech-stack", "languages");
  mkdirSync(langDir, { recursive: true });
  const fwDir = path.join(skillsDir, "04-tech-stack", "frameworks");
  mkdirSync(fwDir, { recursive: true });

  // Template file with full schema documentation for users.
  writeFileSync(
    path.join(skillsDir, "04-tech-stack", "_template.yaml"),
    `# ============================================================================
# 04-tech-stack / _template.yaml  (reference template)
# ----------------------------------------------------------------------------
# This file is not loaded by the engine (starts with _).
# Copy it to create your own language or framework skills.
#
# Guide:
#   1. Save a copy under 04-tech-stack/languages/ or 04-tech-stack/frameworks/
#      with a descriptive name, e.g. "typescript-conventions.yaml".
#   2. Fill in id, name, description, and the tags your IDE will send.
#   3. Write the prompt content that teaches the AI how to behave for this
#      specific tech stack.
# ============================================================================

# ── Skill metadata ──────────────────────────────────────────────────────────
id: your-skill-id              # Unique identifier; used in GetPrompt name
name: Your Skill Name           # Human-readable label
description: What this skill does in one sentence
type: prompt                    # "prompt" for instructions, "tool" for callable tools

# ── Tags (how the engine finds this skill) ──────────────────────────────────
# When an IDE calls:  GetPrompt("skills:compose", { tags: "typescript,react" })
# the engine collects every skill whose tags array overlaps the requested tags.
# Follow a convention like:
#   - language skill: tags: [ "typescript", "lang-ts" ]
#   - framework skill: tags: [ "react", "nextjs", "framework-react" ]
tags:
  - example-tag

# ── Arguments metadata ──────────────────────────────────────────────────────
# Declare what arguments this skill accepts (informational, for IDE UI).
arguments:
  - name: context
    description: Additional context from the IDE (file path, problem type, etc.)
    required: false

# ── Prompt content ──────────────────────────────────────────────────────────
# The actual instructions sent to the AI. Use markdown formatting.
# Be specific. General advice ("write clean code") is ignored; specific
# conventions ("use named exports, PascalCase for components") are followed.
prompt: |
  You are an expert in [Language / Framework].

  ## Coding Conventions
  - Follow [specific style guide link or summary].
  - Use [specific patterns, e.g. async/await, named parameters, etc.].
  - Avoid [anti-patterns you want to prevent].

  ## Architecture Decisions
  - [Project structure convention, e.g. feature-first folders].
  - [State management / data flow pattern].

  ## Performance
  - [Key performance rules, e.g. lazy loading, memoization].
`,
  );

  // ── Project-level config ───────────────────────────────────────────────
  writeFileSync(
    path.join(root, "skill-central.yaml"),
    `# ============================================================================
# skill-central.yaml — per-project layer configuration
# ----------------------------------------------------------------------------
# Each block defines one skill layer. Priority values determine override
# order: higher wins when two layers define the same skill id.
# ============================================================================
layers:
  - name: "01-global"
    path: ".skills/01-global"
    priority: 10
  - name: "02-workflows"
    path: ".skills/02-workflows"
    priority: 20
  - name: "03-domains"
    path: ".skills/03-domains"
    priority: 30
  - name: "04-tech-stack"
    path: ".skills/04-tech-stack"
    priority: 40
`,
  );

  console.log("✅ Initialized .skills/ directory with recommended templates.");
  console.log("✅ Created skill-central.yaml.");
  console.log("\nYou're ready to start building skills!");
  console.log("Try: skill-central list");

  // Attempt to auto-register into known IDEs
  try {
    const { cmdRegister } = await import("./commands/register.js");
    console.log("\n--- MCP IDE Registration ---");
    await cmdRegister(undefined, {});
    console.log("----------------------------\n");
  } catch (err: any) {
    console.log("\n⚠️  Auto-registration for IDEs failed or was skipped:", err.message);
    console.log("You can manually register later by running: skill-central register");
  }

  console.log("");
  console.log("  [skill-central] Project initialized successfully.");
  console.log(`  ├─ .skills/              — skill definitions (${countFiles(skillsDir)} files)`);
  console.log("  └─ skill-central.yaml    — layer config");
  console.log("");
}

function countFiles(dir: string): string {
  try {
    return String(countRecursive(dir));
  } catch {
    return "?";
  }
}

function countRecursive(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      count += countRecursive(full);
    } else if (statSync(full).isFile()) {
      count++;
    }
  }
  return count;
}
