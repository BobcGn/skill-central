// ============================================================================
// Auth / GitHub Configuration
// ----------------------------------------------------------------------------
// Resolves the public GitHub OAuth App identifier used by Device Flow. Client
// IDs are not secrets: packaged builds inject the project-owned value into
// package metadata, while source checkouts may provide it through the
// environment.
// ============================================================================

export const GITHUB_OAUTH_CLIENT_ID_ENV = "SKILL_CENTRAL_GITHUB_CLIENT_ID";

export interface ResolveGitHubOAuthClientIdOptions {
  override?: string;
  packaged?: string;
  environment?: NodeJS.ProcessEnv;
}

export function resolveGitHubOAuthClientId(
  options: ResolveGitHubOAuthClientIdOptions = {},
): string | undefined {
  // Explicit dependency injection wins in tests and CLI callers, followed by
  // packaged metadata and finally the source-development environment.
  for (const candidate of [
    options.override,
    options.packaged,
    (options.environment ?? process.env)[GITHUB_OAUTH_CLIENT_ID_ENV],
  ]) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}

export function missingGitHubOAuthClientIdMessage(): string {
  return `GitHub login is not configured in this build. Maintainers must set ${GITHUB_OAUTH_CLIENT_ID_ENV} to the client ID of the Skill Central OAuth App with Device Flow enabled.`;
}
