cask "skill-central" do
  arch arm: "arm64", intel: "x64"

  version "1.0.0-alpha.3"
  sha256 arm:   "95306fa274b59a374b63deaf6810089befd373b4b64f6231e3c0ad12a9cf9d89",
         intel: "5d9a60529f5c4cbcbe2ea471c0d8e98b52a72652ef5172075c0cbfa5c41baa3e"

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
