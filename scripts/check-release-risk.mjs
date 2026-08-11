#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import { RELEASE_SUPPORTED_IDES, EXPERIMENTAL_IDES } from "../dist/ide-detection/registry.js";

const root = process.cwd();
const allowPrerelease = process.argv.includes("--allow-prerelease");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const pkg = JSON.parse(await text("package.json"));
const lock = JSON.parse(await text("package-lock.json"));
const changelog = await text("CHANGELOG.md");
const builder = parseYaml(await text("electron-builder.yml"));
const ci = await text(".github/workflows/ci.yml");
const release = await text(".github/workflows/release.yml");
const gitignore = await text(".gitignore");
const cask = await text("Casks/skill-central.rb");
const caskGenerator = await text("scripts/generate-homebrew-cask.mjs");
const publicDocs = await collectPublicDocs();

check(pkg.version === lock.packages?.[""]?.version, "package.json and package-lock root versions differ");
check(allowPrerelease || /^\d+\.\d+\.\d+$/.test(pkg.version), `stable release gate requires a stable SemVer version, found ${pkg.version}`);
check(changelog.includes(`## [${pkg.version}]`), `CHANGELOG is missing ## [${pkg.version}]`);
check(pkg.engines?.node === ">=22", "package engines.node must be >=22");
check(pkg.scripts?.["package:mac"] && pkg.scripts?.["package:win"], "macOS and Windows package scripts are required");
check(pkg.scripts?.["test:mcp"] && pkg.scripts?.["test:risk"], "MCP and risk test scripts are required");
check(!pkg.files?.some((entry) => entry.startsWith("logs")), "logs must not enter the published npm package");

check(equal(RELEASE_SUPPORTED_IDES, ["codex", "claude", "cursor"]), "formal Agent support must be Codex, Claude Code, and Cursor");
check(equal(EXPERIMENTAL_IDES, ["trae", "windsurf", "cline"]), "experimental Agent list drifted");

check(hasTarget(builder?.mac?.target, "dmg", ["x64", "arm64"]), "macOS DMG must target x64 and arm64");
check(hasTarget(builder?.mac?.target, "zip", ["x64", "arm64"]), "macOS ZIP must target x64 and arm64");
check(hasTarget(builder?.win?.target, "nsis", ["x64"]), "Windows NSIS must target x64");
check(hasTarget(builder?.win?.target, "msi", ["x64"]), "Windows MSI must target x64");
check(!builder?.linux, "Linux desktop packaging must not be claimed in the current stable release");

for (const [name, workflow] of [["CI", ci], ["Release", release]]) {
  check(workflow.includes("npm audit --omit=dev"), `${name} workflow is missing production dependency audit`);
  check(workflow.includes("npm run test:mcp"), `${name} workflow is missing the explicit MCP gate`);
  check(workflow.includes("npm run test:risk"), `${name} workflow is missing the release-risk gate`);
}
check(release.includes("macos-latest") && release.includes("windows-latest"), "Release workflow must build on native macOS and Windows runners");
check(ci.includes("macos-latest") && ci.includes("windows-latest"), "Main CI must prove native macOS and Windows packages before tagging");
check(ci.includes("Upload native package evidence"), "Main CI must retain native package evidence");
check(!ci.includes("Skill-Central-1.0.0-"), "Main CI artifact paths must follow the package version instead of hard-coding 1.0.0");
check(release.includes('tags: ["v*"]'), "Release workflow must remain tag-gated");
check(release.includes("Push Cask update branch"), "Release workflow must preserve a checksum-pinned Cask branch");
check(release.includes("continue-on-error: true") && release.includes("Manual Homebrew Cask PR required"), "Release workflow must survive repository-level PR creation restrictions");

check(gitignore.includes("/logs/"), "logs directory must remain ignored");
check(gitignore.includes(".skills/") && gitignore.includes(".rules/"), "personal Skill/Rule libraries must remain ignored");
const caskVersion = /version\s+"(\d+\.\d+\.\d+)"/.exec(cask)?.[1];
check(!!caskVersion, "Cask must declare a stable SemVer version");
check(
  !!caskVersion && compareSemver(caskVersion, pkg.version) <= 0,
  `tracked Cask version ${caskVersion ?? "unknown"} must not be newer than release target ${pkg.version}`,
);
check(!/This alpha/i.test(caskGenerator), "generated Cask still contains preview release copy");

const forbidden = [
  /1\.0\.0-(?:alpha|rc)[.\w-]*/i,
  /current alpha/i,
  /当前\s*Alpha/i,
];
for (const entry of publicDocs) {
  for (const pattern of forbidden) {
    check(!pattern.test(entry.content), `${entry.file} contains stale preview copy matching ${pattern}`);
  }
}
check(!publicDocs.some((entry) => /(?:test-report|release-blockers)/.test(entry.file)), "internal test/blocker reports must be archived under logs/Done");

if (failures.length > 0) {
  console.error("Release risk gate failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Release risk gate passed for ${pkg.version}${allowPrerelease ? " (prerelease allowed)" : ""}.`);

async function text(file) {
  return readFile(path.join(root, file), "utf8");
}

async function collectPublicDocs() {
  const files = ["README.md", "README.zh-CN.md"];
  for (const locale of ["en", "ch"]) {
    for (const name of await readdir(path.join(root, "docs", locale))) {
      if (name.endsWith(".md")) files.push(path.join("docs", locale, name));
    }
  }
  return Promise.all(files.map(async (file) => ({ file, content: await text(file) })));
}

function equal(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function hasTarget(targets, name, arches) {
  const target = Array.isArray(targets) && targets.find((entry) => entry?.target === name);
  return !!target && arches.every((arch) => target.arch?.includes(arch));
}

function compareSemver(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
