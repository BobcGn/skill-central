// ============================================================================
// Auth / Token Store
// ----------------------------------------------------------------------------
// Credential boundary for Phase 4 login and sync.
//
// Design intent:
// - Callers depend on the TokenStore interface, not on a file path. Packaged
//   desktop builds can swap in OS keychain storage without changing sync/auth.
// - The file fallback exists only for development and tests. It refuses
//   production use unless explicitly allowed by construction.
// - Tokens are stored under app state, never project config or skill layers.
// ============================================================================

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveLocalStorePaths } from "../local-store/paths.js";

export interface StoredToken {
  provider: "github";
  accessToken: string;
  tokenType?: string;
  scope?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenStore {
  get(provider: StoredToken["provider"]): Promise<StoredToken | undefined>;
  set(token: Omit<StoredToken, "createdAt" | "updatedAt">): Promise<StoredToken>;
  delete(provider: StoredToken["provider"]): Promise<void>;
  describe(): TokenStoreDescription;
}

export interface TokenStoreDescription {
  kind: "development-file" | "os-keychain";
  path?: string;
  productionReady: boolean;
  warning?: string;
}

export interface DevelopmentFileTokenStoreOptions {
  appStateDir?: string;
  allowProduction?: boolean;
}

export class DevelopmentFileTokenStore implements TokenStore {
  private readonly tokenDir: string;

  constructor(private readonly options: DevelopmentFileTokenStoreOptions = {}) {
    if (process.env.NODE_ENV === "production" && !options.allowProduction) {
      throw new Error("DevelopmentFileTokenStore refuses production use; provide an OS keychain TokenStore.");
    }
    this.tokenDir = resolveLocalStorePaths({ overrideDir: options.appStateDir }).tokens;
  }

  async get(provider: StoredToken["provider"]): Promise<StoredToken | undefined> {
    try {
      return JSON.parse(await readFile(this.filePath(provider), "utf-8")) as StoredToken;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return undefined;
      throw err;
    }
  }

  async set(token: Omit<StoredToken, "createdAt" | "updatedAt">): Promise<StoredToken> {
    await mkdir(this.tokenDir, { recursive: true });
    const now = new Date().toISOString();
    const existing = await this.get(token.provider);
    const stored: StoredToken = {
      ...token,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeFile(this.filePath(token.provider), `${JSON.stringify(stored, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    return stored;
  }

  async delete(provider: StoredToken["provider"]): Promise<void> {
    await rm(this.filePath(provider), { force: true });
  }

  describe(): TokenStoreDescription {
    return {
      kind: "development-file",
      path: this.tokenDir,
      productionReady: false,
      warning: "Development fallback only. Packaged .msi/.dmg builds must use OS keychain storage.",
    };
  }

  private filePath(provider: StoredToken["provider"]): string {
    return path.join(this.tokenDir, `${provider}.token.json`);
  }
}
