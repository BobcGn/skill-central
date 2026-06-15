// ============================================================================
// Install · Sources
// ----------------------------------------------------------------------------
// URL parser + fetcher for `github:` and `npm:` source strings.
//
// Grammar:
//   github:<user>/<repo>/<path/to/file.yaml>[@<ref>]
//   npm:<pkg>[@<version>]
//
// Only HTTPS endpoints are accepted. The npm fetcher lands in P10.
// ============================================================================

import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { extract as tarExtract } from "tar-stream";

// ── Source URL grammar ─────────────────────────────────────────────────────

export type SourceSpec =
  | {
      kind: "github";
      user: string;
      repo: string;
      path: string;
      ref: string;
      raw: string;
    }
  | {
      kind: "npm";
      pkg: string;
      version: string; // "" = latest
      raw: string;
    };

const GITHUB_RE =
  /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(.+?)(?:@([A-Za-z0-9_./-]+))?$/;

const NPM_RE =
  /^npm:((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)(?:@([A-Za-z0-9_.+-]+))?$/;

/**
 * Parse a user-supplied source string. Throws on syntax error.
 */
export function parseSource(input: string): SourceSpec {
  const s = input.trim();
  if (s.startsWith("github:")) {
    const m = GITHUB_RE.exec(s);
    if (!m) {
      throw new Error(
        `Invalid github source: "${input}"\n` +
          `Expected: github:<user>/<repo>/<path/to/file.yaml>[@<ref>]`,
      );
    }
    const [, user, repo, filePath, ref] = m;
    if (!filePath.endsWith(".yaml") && !filePath.endsWith(".yml") && !filePath.endsWith(".json")) {
      throw new Error(
        `GitHub source path must end in .yaml, .yml, or .json: got "${filePath}"`,
      );
    }
    return {
      kind: "github",
      user: user!,
      repo: repo!,
      path: filePath!,
      ref: ref ?? "main",
      raw: s,
    };
  }
  if (s.startsWith("npm:")) {
    const m = NPM_RE.exec(s);
    if (!m) {
      throw new Error(
        `Invalid npm source: "${input}"\n` +
          `Expected: npm:<pkg>[@<version>]  (P10 feature)`,
      );
    }
    return {
      kind: "npm",
      pkg: m[1]!,
      version: m[2] ?? "",
      raw: s,
    };
  }
  throw new Error(
    `Unknown source prefix: "${input}". Supported: "github:" and "npm:".`,
  );
}

// ── Fetch result ───────────────────────────────────────────────────────────

export interface FetchedSkill {
  spec: SourceSpec;
  rawYaml: string;
  sha256: string;
  version: string;
  /** Optional: manifest info from npm packages (P10). */
  meta?: { name: string; license?: string; repository?: string };
}

// ── GitHub fetcher (P8) ────────────────────────────────────────────────────

/**
 * Fetch a skill from a github: source. Returns the YAML body, its sha256,
 * and the version (which for github is the resolved ref).
 */
export async function fetchGithubSkill(spec: SourceSpec): Promise<FetchedSkill> {
  if (spec.kind !== "github") {
    throw new Error("fetchGithubSkill called with non-github spec");
  }
  const url = `https://raw.githubusercontent.com/${spec.user}/${spec.repo}/${spec.ref}/${spec.path}`;
  const raw = await httpsFetchText(url, ["text/yaml", "text/x-yaml", "application/json", "text/plain"]);

  return {
    spec,
    rawYaml: raw,
    sha256: sha256Of(raw),
    version: spec.ref,
  };
}

// ── HTTP helper ────────────────────────────────────────────────────────────

/**
 * GET `url` over HTTPS and return the body as text. Refuses non-https URLs.
 * Follows up to 3 redirects; rejects if any redirect targets http:// or a
 * loopback host. Validates that the final response's content-type matches
 * one of the `accepts` prefixes (so we don't silently accept HTML error
 * pages or random binary blobs).
 */
export async function httpsFetchText(
  url: string,
  accepts: string[],
): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    assertHttps(current);
    const u = new URL(current);
    if (isLoopbackHost(u.hostname)) {
      throw new Error(`Refusing to fetch loopback host: ${current}`);
    }
    const res = await fetch(current, { redirect: "manual" });
    // Handle redirects.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`redirect without location header from ${current}`);
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${current}: ${await res.text().catch(() => "")}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (accepts.length > 0 && !accepts.some((a) => ct.includes(a))) {
      throw new Error(
        `Unexpected content-type "${ct}" from ${current}; expected one of: ${accepts.join(", ")}`,
      );
    }
    return await res.text();
  }
  throw new Error(`Too many redirects (limit 3) starting at ${url}`);
}

function assertHttps(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:") {
    throw new Error(`Refusing non-HTTPS URL: ${url}`);
  }
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.startsWith("127.")) return true;
  return false;
}

// ── sha256 ─────────────────────────────────────────────────────────────────

export function sha256Of(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

// ── npm fetcher (P10) ─────────────────────────────────────────────────────

/**
 * Fetch a skill from an npm package. The package must declare a
 * `skill-central.paths` field in its package.json (array of file paths
 * inside the tarball). Returns one FetchedSkill per declared path.
 */
export async function fetchNpmSkill(spec: SourceSpec): Promise<FetchedSkill[]> {
  if (spec.kind !== "npm") {
    throw new Error("fetchNpmSkill called with non-npm spec");
  }

  // 1. Resolve the tarball URL via the registry.
  const pkgSpec = spec.version ? `${spec.pkg}@${spec.version}` : spec.pkg;
  const registryUrl = `https://registry.npmjs.org/${encodePkgName(spec.pkg)}${
    spec.version ? `/${encodeURIComponent(spec.version)}` : ""
  }`;
  const regRaw = await httpsFetchText(registryUrl, ["application/json"]);
  const reg = JSON.parse(regRaw) as Record<string, unknown>;

  let tarballUrl: string;
  let resolvedVersion: string;
  if (spec.version) {
    // Registry may return either a version document (when ?version or path
    // /<pkg>/<version> is used) or a full doc with a "versions" map.
    const topDist = reg.dist as { tarball?: string } | undefined;
    if (topDist?.tarball) {
      tarballUrl = topDist.tarball;
      resolvedVersion = spec.version;
    } else {
      const versions = reg.versions as Record<string, Record<string, unknown>> | undefined;
      const v = versions?.[spec.version];
      const dist = v?.dist as { tarball?: string } | undefined;
      if (!dist?.tarball) {
        throw new Error(`No tarball for ${pkgSpec}`);
      }
      tarballUrl = dist.tarball;
      resolvedVersion = spec.version;
    }
  } else {
    const distTags = reg["dist-tags"] as { latest?: string } | undefined;
    const latest = distTags?.latest;
    if (!latest) throw new Error(`No "latest" tag for ${spec.pkg}`);
    const versions = reg.versions as Record<string, Record<string, unknown>> | undefined;
    const v = versions?.[latest];
    const dist = v?.dist as { tarball?: string } | undefined;
    if (!dist?.tarball) {
      throw new Error(`No tarball for ${spec.pkg}@${latest}`);
    }
    tarballUrl = dist.tarball;
    resolvedVersion = latest;
  }

  // 2. Download + decompress + extract.
  const tarRes = await fetch(tarballUrl);
  if (!tarRes.ok || !tarRes.body) {
    throw new Error(`Tarball download failed: HTTP ${tarRes.status}`);
  }
  const files = await extractTarGz(tarRes.body);
  const pkgJsonRaw = files.get("package/package.json");
  if (!pkgJsonRaw) {
    throw new Error("Tarball missing package/package.json");
  }
  const pkgJson = JSON.parse(pkgJsonRaw) as Record<string, unknown>;
  const sc = pkgJson["skill-central"] as { paths?: unknown } | undefined;
  const skillPaths = Array.isArray(sc?.paths) ? (sc!.paths as string[]) : [];
  if (skillPaths.length === 0) {
    throw new Error(
      `Package ${pkgSpec} has no "skill-central.paths" in its package.json.`,
    );
  }

  // 3. Build one FetchedSkill per declared path.
  const out: FetchedSkill[] = [];
  for (const rel of skillPaths) {
    const tarEntryName = `package/${rel.replace(/^\.\//, "")}`;
    const raw = files.get(tarEntryName);
    if (!raw) {
      throw new Error(
        `Path "${rel}" declared in skill-central.paths not found in tarball.`,
      );
    }
    out.push({
      spec,
      rawYaml: raw,
      sha256: sha256Of(raw),
      version: resolvedVersion,
      meta: {
        name: String(pkgJson.name ?? spec.pkg),
        license: typeof pkgJson.license === "string" ? pkgJson.license : undefined,
        repository: extractRepoUrl(pkgJson.repository),
      },
    });
  }
  return out;
}

function extractRepoUrl(repo: unknown): string | undefined {
  if (typeof repo === "string") return repo;
  if (repo && typeof repo === "object" && "url" in repo) {
    const u = (repo as { url?: unknown }).url;
    if (typeof u === "string") return u;
  }
  return undefined;
}

/**
 * Read a gzipped tarball stream and return a map of "tar entry name" → file
 * contents (utf-8 text). Defends against tar-slip: entries must start with
 * `package/` and reject `..` or `\` separators.
 */
async function extractTarGz(body: ReadableStream<Uint8Array>): Promise<Map<string, string>> {
  const gunzip = createGunzip();
  const extractor = tarExtract();
  const files = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    extractor.on("entry", (header, stream, next) => {
      const name = header.name;
      if (!name.startsWith("package/") || name.includes("..") || name.includes("\\")) {
        stream.resume();
        stream.on("end", next);
        return;
      }
      if (header.type === "file") {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => {
          files.set(name, Buffer.concat(chunks).toString("utf-8"));
          next();
        });
      } else {
        stream.resume();
        stream.on("end", next);
      }
    });
    extractor.on("finish", () => resolve());
    extractor.on("error", reject);
    gunzip.on("error", reject);

    Readable.fromWeb(body as never).pipe(gunzip).pipe(extractor);
  });

  return files;
}

function encodePkgName(pkg: string): string {
  return pkg.startsWith("@") ? pkg.replace("/", "%2F") : pkg;
}