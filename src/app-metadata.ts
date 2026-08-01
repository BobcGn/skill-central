// ============================================================================
// Application Metadata
// ----------------------------------------------------------------------------
// Reads package metadata through a relative import that remains valid after
// TypeScript output is placed in dist/. Release packaging injects public
// application identifiers here without placing them in source-controlled
// package.json.
// ============================================================================

import pkg from "../package.json" with { type: "json" };

interface SkillCentralPackageMetadata {
  skillCentral?: {
    githubOAuthClientId?: string;
  };
}

const metadata = pkg as SkillCentralPackageMetadata;

/** Public GitHub OAuth App identifier injected into packaged desktop builds. */
export const PACKAGED_GITHUB_OAUTH_CLIENT_ID: string | undefined =
  metadata.skillCentral?.githubOAuthClientId;
