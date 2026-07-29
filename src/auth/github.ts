// ============================================================================
// Auth / GitHub Device Flow
// ----------------------------------------------------------------------------
// Thin GitHub OAuth Device Flow client.
//
// Design intent:
// - The desktop shell and CLI need the same auth primitive: start device flow,
//   show the user code, then poll for a token.
// - Network calls are injectable so tests can verify protocol behavior without
//   touching GitHub.
// - Token persistence is intentionally outside this module; callers store the
//   returned token through TokenStore so production keychain replacement stays
//   localized.
// ============================================================================

import type { StoredToken } from "./token-store.js";

export interface GitHubDeviceFlowClientOptions {
  clientId: string;
  scope?: string;
  fetchImpl?: typeof fetch;
}

export interface GitHubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface GitHubTokenResponse {
  accessToken: string;
  tokenType?: string;
  scope?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
}

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export class GitHubDeviceFlowClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GitHubDeviceFlowClientOptions) {
    if (!options.clientId) throw new Error("GitHub client id is required");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async requestDeviceCode(): Promise<GitHubDeviceCode> {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
    });
    if (this.options.scope) params.set("scope", this.options.scope);

    const data = await postForm(this.fetchImpl, DEVICE_CODE_URL, params);
    return {
      deviceCode: requireString(data, "device_code"),
      userCode: requireString(data, "user_code"),
      verificationUri: requireString(data, "verification_uri"),
      expiresIn: requireNumber(data, "expires_in"),
      interval: typeof data.interval === "number" ? data.interval : 5,
    };
  }

  async pollForToken(deviceCode: string): Promise<GitHubTokenResponse | GitHubDeviceFlowPending> {
    const data = await postForm(this.fetchImpl, ACCESS_TOKEN_URL, new URLSearchParams({
      client_id: this.options.clientId,
      device_code: deviceCode,
      grant_type: DEVICE_GRANT_TYPE,
    }));

    if (typeof data.error === "string") {
      if (data.error === "authorization_pending" || data.error === "slow_down") {
        return {
          pending: true,
          error: data.error,
          intervalAdjustmentSeconds: data.error === "slow_down" ? 5 : 0,
        };
      }
      throw new Error(`GitHub device flow failed: ${data.error}`);
    }

    return {
      accessToken: requireString(data, "access_token"),
      tokenType: typeof data.token_type === "string" ? data.token_type : undefined,
      scope: typeof data.scope === "string" ? data.scope : undefined,
    };
  }

  async fetchUser(accessToken: string): Promise<GitHubUser> {
    const res = await this.fetchImpl(USER_URL, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "skill-central",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub user request failed: HTTP ${res.status}`);
    }
    const data = await res.json() as Record<string, unknown>;
    return {
      id: requireNumber(data, "id"),
      login: requireString(data, "login"),
      name: typeof data.name === "string" ? data.name : undefined,
    };
  }
}

export interface GitHubDeviceFlowPending {
  pending: true;
  error: "authorization_pending" | "slow_down";
  intervalAdjustmentSeconds: number;
}

export function tokenResponseToStoredToken(token: GitHubTokenResponse): Omit<StoredToken, "createdAt" | "updatedAt"> {
  return {
    provider: "github",
    accessToken: token.accessToken,
    tokenType: token.tokenType,
    scope: token.scope,
  };
}

async function postForm(fetchImpl: typeof fetch, url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "skill-central",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`GitHub OAuth request failed: HTTP ${res.status}`);
  }
  return await res.json() as Record<string, unknown>;
}

function requireString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`GitHub response missing ${key}`);
  return value;
}

function requireNumber(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value !== "number") throw new Error(`GitHub response missing ${key}`);
  return value;
}
