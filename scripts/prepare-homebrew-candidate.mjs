#!/usr/bin/env node
// ============================================================================
// Local Homebrew Candidate Tap
// ----------------------------------------------------------------------------
// Creates or advances a temporary Git Tap whose generated Cask points at local
// candidate DMGs. This stages repeatable install and upgrade tests without
// changing the user's Homebrew configuration or installed application.
// ============================================================================

import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = parseArgs(process.argv.slice(2));
const version = requireArg(args, "version");
const arm64Path = await realpath(requireArg(args, "arm64"));
const x64Path = await realpath(requireArg(args, "x64"));

assertArtifactName(arm64Path, `Skill-Central-${version}-mac-arm64.dmg`);
assertArtifactName(x64Path, `Skill-Central-${version}-mac-x64.dmg`);
if (path.dirname(arm64Path) !== path.dirname(x64Path)) {
  throw new Error("candidate DMGs must be in the same directory");
}

const tapDirectory = args["tap-dir"]
  ? path.resolve(args["tap-dir"])
  : await mkdtemp(path.join(tmpdir(), `skill-central-homebrew-${version}-`));
const caskDirectory = path.join(tapDirectory, "Casks");
const caskPath = path.join(caskDirectory, "skill-central.rb");
await mkdir(caskDirectory, { recursive: true });

const artifactTemplate = path.join(
  path.dirname(arm64Path),
  "Skill-Central-#{version}-mac-#{arch}.dmg",
);
const artifactUrl = args.url
  || pathToFileURL(artifactTemplate).href
    .replace(/%23%7Bversion%7D/i, "#{version}")
    .replace(/%23%7Barch%7D/i, "#{arch}");
const generatorPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "generate-homebrew-cask.mjs");
execFileSync(process.execPath, [
  generatorPath,
  "--version", version,
  "--arm64", arm64Path,
  "--x64", x64Path,
  "--url", artifactUrl,
  "--output", caskPath,
], { stdio: "inherit" });

if (!(await exists(path.join(tapDirectory, ".git")))) {
  runGit(tapDirectory, ["init", "--quiet"]);
}
// Each candidate version is a commit so `brew update` can observe a real Tap
// transition when the same directory is reused for an upgrade test.
runGit(tapDirectory, ["add", "Casks/skill-central.rb"]);
const hasChanges = runGit(tapDirectory, ["diff", "--cached", "--quiet"], true) !== 0;
if (!hasChanges) throw new Error(`candidate Tap already contains ${version} with these checksums`);
runGit(tapDirectory, [
  "-c", "user.name=Skill Central Candidate",
  "-c", "user.email=candidate@skillcentral.dev",
  "commit", "--quiet", "-m", `Test Skill Central ${version}`,
]);

console.log(`\nCandidate Tap: ${tapDirectory}`);
console.log("No Homebrew configuration or installed application was changed.");
console.log("Follow docs/en/release-and-updates.md or docs/ch/release-and-updates.md to use and remove this Tap.");

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`missing value for ${value}`);
    parsed[value.slice(2)] = next;
    index += 1;
  }
  return parsed;
}

function requireArg(values, name) {
  const value = values[name];
  if (!value) throw new Error(`missing required argument: --${name}`);
  return value;
}

function assertArtifactName(filePath, expected) {
  const actual = path.basename(filePath);
  if (actual !== expected) throw new Error(`expected ${expected}, received ${actual}`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runGit(directory, gitArgs, returnStatus = false) {
  try {
    execFileSync("git", ["-C", directory, ...gitArgs], {
      stdio: returnStatus ? "ignore" : "inherit",
    });
    return 0;
  } catch (error) {
    if (returnStatus && typeof error?.status === "number") return error.status;
    throw error;
  }
}
