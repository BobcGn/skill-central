cask "skill-central" do
  arch arm: "arm64", intel: "x64"

  version "1.0.0-alpha.1"
  sha256 arm:   "65c6fd299438dc32e4e2ede034048b0cf0a2dfd51ef2b6f3096245fe5cf43099",
         intel: "d3cbff60764273f00d8efdc223ae3e31060734adbd4c19bcc5cfd1e63800f44d"

  url "https://github.com/BobcGn/skill-central/releases/download/v#{version}/Skill-Central-#{version}-mac-#{arch}.dmg"
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
