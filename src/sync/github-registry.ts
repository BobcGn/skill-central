// ============================================================================
// Sync / GitHub Registry Repo
// ----------------------------------------------------------------------------
// Plans GitHub registry repository binding/creation without writing remotely.
//
// Design intent:
// - Repo creation and binding must be previewable before Phase 4 enables any
//   write. This module returns plan objects only.
// - Defaults are private and local-first: absence of a GitHub token never
//   blocks local skill commands.
// - Future apply code should consume these plans and write audit entries.
// ============================================================================

export type GitHubRepoPlanAction = "bind-existing" | "create-private";

export interface GitHubRegistryRepoPlan {
  provider: "github";
  action: GitHubRepoPlanAction;
  owner: string;
  repo: string;
  visibility: "private";
  dryRun: true;
  remoteUrl: string;
  steps: Array<{
    kind: "detect" | "preview" | "manifest";
    title: string;
    detail: string;
  }>;
  manifestPreview: string;
}

export interface BuildGitHubRegistryRepoPlanOptions {
  owner: string;
  repo?: string;
  exists?: boolean;
}

export function buildGitHubRegistryRepoPlan(
  options: BuildGitHubRegistryRepoPlanOptions,
): GitHubRegistryRepoPlan {
  const owner = normaliseOwner(options.owner);
  const repo = normaliseRepo(options.repo ?? "skill-central-registry");
  const action: GitHubRepoPlanAction = options.exists ? "bind-existing" : "create-private";
  const manifestPreview = buildManifestPreview(owner, repo);

  return {
    provider: "github",
    action,
    owner,
    repo,
    visibility: "private",
    dryRun: true,
    remoteUrl: `https://github.com/${owner}/${repo}`,
    steps: [
      {
        kind: "detect",
        title: "检测 registry repo",
        detail: options.exists
          ? `将绑定既有私有仓库 ${owner}/${repo}`
          : `未确认既有仓库；将规划创建私有仓库 ${owner}/${repo}`,
      },
      {
        kind: "preview",
        title: "预览 repo 写入",
        detail: "当前阶段只生成计划，不创建 repo、不 push 文件。",
      },
      {
        kind: "manifest",
        title: "预览 manifest",
        detail: "远端 registry 将使用 skillcentral.dev/registry/v1 manifest。",
      },
    ],
    manifestPreview,
  };
}

function buildManifestPreview(owner: string, repo: string): string {
  return [
    "schemaVersion: skillcentral.dev/registry/v1",
    "owner:",
    "  provider: github",
    `  login: ${owner}`,
    "defaults:",
    "  visibility: private",
    "  syncMode: bidirectional",
    "remote:",
    `  repo: ${repo}`,
    "layers:",
    "  - id: personal",
    "    path: layers/personal",
    "    scope: user",
    "    sync:",
    "      enabled: true",
    "      direction: bidirectional",
    "    visibility: private",
    "",
  ].join("\n");
}

function normaliseOwner(value: string): string {
  const owner = value.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(owner)) throw new Error(`Invalid GitHub owner: ${value}`);
  return owner;
}

function normaliseRepo(value: string): string {
  const repo = value.trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error(`Invalid GitHub repo: ${value}`);
  return repo;
}
