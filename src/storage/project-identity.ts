// ============================================================================
// Storage / Project Identity
// ----------------------------------------------------------------------------
// Resolves the current workspace to stable ids used by the shared asset scope
// contract. A recognised origin remote is canonical; the real absolute path is
// retained as an alias and becomes the fallback outside a Git repository.
//
// Git probing is intentionally best-effort. Listing Skills or Rules must still
// work when Git is absent, a directory is not a repository, or origin is not a
// supported URL form.
// ============================================================================

import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  normaliseProjectId,
  type AssetScopeContext,
} from "../schema/asset-scope.js";

const execFileAsync = promisify(execFile);

export interface ProjectIdentity {
  id: string;
  aliases: string[];
  root: string;
  source: "git" | "path";
}

export async function resolveProjectIdentity(projectRoot = process.cwd()): Promise<ProjectIdentity> {
  const requestedRoot = await realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const gitRoot = await runGit(requestedRoot, ["rev-parse", "--show-toplevel"]);
  const root = gitRoot ? await realpath(gitRoot).catch(() => path.resolve(gitRoot)) : requestedRoot;
  const pathId = normaliseProjectId(`path:${root}`);

  if (gitRoot) {
    const remote = await runGit(root, ["remote", "get-url", "origin"]);
    const gitId = remote ? projectIdFromGitRemote(remote) : undefined;
    if (gitId) {
      // Both aliases participate in matching, but `id` remains the portable
      // value written by `scope set --current-project`.
      return { id: gitId, aliases: [gitId, pathId], root, source: "git" };
    }
  }

  return { id: pathId, aliases: [pathId], root, source: "path" };
}

export async function resolveAssetScopeContext(
  projectRoot = process.cwd(),
  projectId?: string,
): Promise<AssetScopeContext> {
  if (projectId) return { projectIds: [normaliseProjectId(projectId)] };
  const identity = await resolveProjectIdentity(projectRoot);
  return { projectIds: identity.aliases };
}

export function projectIdFromGitRemote(remoteInput: string): string | undefined {
  const remote = remoteInput.trim();
  if (!remote) return undefined;

  if (remote.includes("://")) {
    try {
      const url = new URL(remote);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ssh:" || url.protocol === "git:") {
        return toGitProjectId(url.hostname, url.pathname);
      }
    } catch {
      return undefined;
    }
  }

  // Git commonly prints SSH remotes in SCP syntax. Exclude Windows drive
  // paths before interpreting the first colon as a host/path separator.
  const scp = remote.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
  if (scp && !/^[A-Za-z]:[\\/]/.test(remote)) return toGitProjectId(scp[1]!, scp[2]!);
  return undefined;
}

function toGitProjectId(host: string, repositoryPath: string): string | undefined {
  let cleanPath = repositoryPath.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  if (!host || !cleanPath) return undefined;
  const normalisedHost = host.toLowerCase();
  if (normalisedHost === "github.com") cleanPath = cleanPath.toLowerCase();
  return normaliseProjectId(`git:${normalisedHost}/${cleanPath}`);
}

async function runGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 1024 * 1024,
    });
    const output = result.stdout.trim();
    return output || undefined;
  } catch {
    // Identity detection degrades to a path id; Git errors are not user-facing
    // failures for ordinary list/show operations.
    return undefined;
  }
}
