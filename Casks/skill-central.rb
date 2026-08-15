cask "skill-central" do
  arch arm: "arm64", intel: "x64"

  version "1.1.0"
  sha256 arm:   "b24b9b81aa9daef893e9f79d637c601abd4824c6380293aa6ba266a225d4714a",
         intel: "a73b8a2137ed04562e999737018c633276a90e1d76a7e3d17a5a24d8103393b4"

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
    This release has no Developer ID signature and is not notarized. If macOS
    blocks first launch, verify the release source and prefer Open Anyway in
    System Settings. Use the README quarantine step only as a last resort.

    Skill Central keeps its local service running after the last window closes.
    Use the application menu or menu bar icon to show the window or quit fully.
  EOS
end
