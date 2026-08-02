cask "skill-central" do
  arch arm: "arm64", intel: "x64"

  version "1.0.0-rc.3"
  sha256 arm:   "791decfc05c93f24be613fb4fae6b29f5582056d1620f3f8b5737a8bc6a61f1d",
         intel: "5439cf89607e24da3c4263240d536fb849c9049eccede8d70aaa5c34e47be622"

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
