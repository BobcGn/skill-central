#!/usr/bin/env node
// ============================================================================
// Homebrew Cask Generator
// ----------------------------------------------------------------------------
// Generates the release Cask from exact arm64/x64 DMG artifacts and their
// SHA-256 digests. Strict artifact-name checks keep the architecture mapping
// aligned with the URL template used by GitHub Releases and local candidates.
// ============================================================================

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const version = requireArg(args, "version");
const arm64Path = requireArg(args, "arm64");
const x64Path = requireArg(args, "x64");
const outputPath = args.output || path.join("Casks", "skill-central.rb");
const downloadUrl = args.url
  || "https://github.com/BobcGn/skill-central/releases/download/v#{version}/Skill-Central-#{version}-mac-#{arch}.dmg";

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`invalid release version: ${version}`);
}
if (!downloadUrl.includes("#{arch}")) {
  throw new Error("Cask URL must contain the #{arch} interpolation");
}

assertArtifactName(arm64Path, `Skill-Central-${version}-mac-arm64.dmg`);
assertArtifactName(x64Path, `Skill-Central-${version}-mac-x64.dmg`);

const [arm64Sha256, x64Sha256] = await Promise.all([
  sha256(arm64Path),
  sha256(x64Path),
]);
const cask = renderCask({ version, arm64Sha256, x64Sha256, downloadUrl });

if (args.check) {
  const current = await readFile(outputPath, "utf8");
  if (current !== cask) {
    throw new Error(`${outputPath} does not match the ${version} release artifacts`);
  }
  console.log(`Verified ${outputPath} for ${version}.`);
} else {
  await writeFile(outputPath, cask, "utf8");
  console.log(`Generated ${outputPath} for ${version}.`);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--check") {
      parsed.check = true;
      continue;
    }
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const name = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`missing value for ${value}`);
    parsed[name] = next;
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
  if (actual !== expected) {
    throw new Error(`expected ${expected}, received ${actual}`);
  }
}

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

function renderCask({ version: releaseVersion, arm64Sha256, x64Sha256, downloadUrl: artifactUrl }) {
  return `cask "skill-central" do
  arch arm: "arm64", intel: "x64"

  version "${releaseVersion}"
  sha256 arm:   "${arm64Sha256}",
         intel: "${x64Sha256}"

  url ${JSON.stringify(artifactUrl)}
  name "Skill Central"
  desc "Local MCP hub for distributing reusable AI skills across IDEs"
  homepage "https://github.com/BobcGn/skill-central"

  depends_on macos: :ventura

  app "Skill Central.app"

  uninstall quit: "dev.skillcentral.app"

  zap trash: [
    "~/Library/Application Support/Skill Central",
    "~/Library/Application Support/skill-central",
    "~/Library/Preferences/dev.skillcentral.app.plist",
    "~/Library/Saved Application State/dev.skillcentral.app.savedState",
  ]

  caveats <<~EOS
    This alpha has no Developer ID signature and is not notarized. If macOS
    blocks first launch, verify the release source and prefer Open Anyway in
    System Settings. Use the README quarantine step only as a last resort.

    Skill Central keeps its local service running after the last window closes.
    Use the application menu or menu bar icon to show the window or quit fully.
  EOS
end
`;
}
