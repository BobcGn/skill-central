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

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
  /** Fail before authorization starts when the selected backend cannot persist safely. */
  checkAvailability(): Promise<void>;
  get(provider: StoredToken["provider"]): Promise<StoredToken | undefined>;
  set(token: Omit<StoredToken, "createdAt" | "updatedAt">): Promise<StoredToken>;
  delete(provider: StoredToken["provider"]): Promise<void>;
  describe(): TokenStoreDescription;
}

export interface TokenStoreDescription {
  kind: "development-file" | "os-keychain";
  backend?: "macos-keychain" | "windows-dpapi";
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

  async checkAvailability(): Promise<void> {
    // Construction already enforces the production boundary. This method keeps
    // callers backend-agnostic while the development store remains synchronous.
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

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export type SecureTokenStoreEventType =
  | "legacy-plaintext-removed"
  | "unreadable-ciphertext-removed";

export interface SecureTokenStoreEvent {
  type: SecureTokenStoreEventType;
  provider: StoredToken["provider"];
}

export type SecureTokenStoreErrorCode =
  | "SECURE_STORAGE_UNSUPPORTED"
  | "SECURE_STORAGE_UNAVAILABLE"
  | "SECURE_STORAGE_READ_FAILED"
  | "SECURE_STORAGE_WRITE_FAILED"
  | "SECURE_STORAGE_DELETE_FAILED";

/**
 * Error messages are deliberately fixed and contain no filesystem, encrypted
 * payload, OS error, or credential material. UI and log callers may expose the
 * code and message without serializing the original exception.
 */
export class SecureTokenStoreError extends Error {
  constructor(
    readonly code: SecureTokenStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SecureTokenStoreError";
  }
}

export interface SafeStorageTokenStoreOptions {
  safeStorage: SafeStorageAdapter;
  appStateDir?: string;
  platform?: NodeJS.Platform;
  onEvent?: (event: SecureTokenStoreEvent) => void;
}

interface EncryptedTokenEnvelope {
  version: 1;
  provider: StoredToken["provider"];
  ciphertext: string;
}

const ENCRYPTED_TOKEN_VERSION = 1;

/**
 * Desktop credential store backed by Electron safeStorage. The complete token
 * record is encrypted through macOS Keychain or Windows DPAPI before any bytes
 * are written to disk. Linux is intentionally excluded from the alpha support
 * contract because safeStorage may select an insecure basic-text backend.
 */
export class SafeStorageTokenStore implements TokenStore {
  private readonly tokenDir: string;
  private readonly platform: NodeJS.Platform;
  private operation: Promise<void> = Promise.resolve();

  constructor(private readonly options: SafeStorageTokenStoreOptions) {
    this.tokenDir = resolveLocalStorePaths({ overrideDir: options.appStateDir }).tokens;
    this.platform = options.platform ?? process.platform;
  }

  checkAvailability(): Promise<void> {
    return this.exclusive(async () => {
      await this.removeLegacyPlaintext("github");
      this.assertEncryptionAvailable();
    });
  }

  get(provider: StoredToken["provider"]): Promise<StoredToken | undefined> {
    return this.exclusive(async () => {
      await this.removeLegacyPlaintext(provider);
      this.assertEncryptionAvailable();
      return this.readEncrypted(provider);
    });
  }

  set(token: Omit<StoredToken, "createdAt" | "updatedAt">): Promise<StoredToken> {
    return this.exclusive(async () => {
      await this.removeLegacyPlaintext(token.provider);
      this.assertEncryptionAvailable();
      const existing = await this.readEncrypted(token.provider);
      const now = new Date().toISOString();
      const stored: StoredToken = {
        ...token,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      let ciphertext: Buffer;
      try {
        ciphertext = this.options.safeStorage.encryptString(JSON.stringify(stored));
      } catch {
        throw secureStoreError("SECURE_STORAGE_WRITE_FAILED");
      }
      const envelope: EncryptedTokenEnvelope = {
        version: ENCRYPTED_TOKEN_VERSION,
        provider: token.provider,
        ciphertext: ciphertext.toString("base64"),
      };
      await this.writeEnvelope(token.provider, envelope);
      return stored;
    });
  }

  delete(provider: StoredToken["provider"]): Promise<void> {
    return this.exclusive(async () => {
      await this.removeFile(this.encryptedFilePath(provider), "SECURE_STORAGE_DELETE_FAILED");
      await this.removeLegacyPlaintext(provider);
    });
  }

  describe(): TokenStoreDescription {
    const backend = this.platform === "darwin"
      ? "macos-keychain"
      : this.platform === "win32"
        ? "windows-dpapi"
        : undefined;
    let encryptionAvailable = false;
    try {
      encryptionAvailable = !!backend && this.options.safeStorage.isEncryptionAvailable();
    } catch {
      encryptionAvailable = false;
    }
    return {
      kind: "os-keychain",
      backend,
      productionReady: encryptionAvailable,
      warning: encryptionAvailable
        ? undefined
        : "Secure credential storage is unavailable. GitHub login is disabled.",
    };
  }

  private async readEncrypted(provider: StoredToken["provider"]): Promise<StoredToken | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.encryptedFilePath(provider), "utf8");
    } catch (err) {
      if (isMissingFileError(err)) return undefined;
      throw secureStoreError("SECURE_STORAGE_READ_FAILED");
    }

    try {
      const envelope = parseEnvelope(raw, provider);
      const plaintext = this.options.safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
      return parseStoredToken(plaintext, provider);
    } catch {
      await this.removeFile(this.encryptedFilePath(provider), "SECURE_STORAGE_DELETE_FAILED");
      this.emit({ type: "unreadable-ciphertext-removed", provider });
      return undefined;
    }
  }

  private async writeEnvelope(
    provider: StoredToken["provider"],
    envelope: EncryptedTokenEnvelope,
  ): Promise<void> {
    const target = this.encryptedFilePath(provider);
    const temporary = path.join(this.tokenDir, `.${provider}.${process.pid}.${randomUUID()}.tmp`);
    try {
      await mkdir(this.tokenDir, { recursive: true, mode: 0o700 });
      await chmod(this.tokenDir, 0o700);
      await writeFile(temporary, `${JSON.stringify(envelope)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, target);
      await chmod(target, 0o600);
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw secureStoreError("SECURE_STORAGE_WRITE_FAILED");
    }
  }

  private async removeLegacyPlaintext(provider: StoredToken["provider"]): Promise<void> {
    const legacyPath = this.legacyFilePath(provider);
    try {
      await rm(legacyPath);
      this.emit({ type: "legacy-plaintext-removed", provider });
    } catch (err) {
      if (!isMissingFileError(err)) throw secureStoreError("SECURE_STORAGE_DELETE_FAILED");
    }
  }

  private async removeFile(filePath: string, code: SecureTokenStoreErrorCode): Promise<void> {
    try {
      await rm(filePath, { force: true });
    } catch {
      throw secureStoreError(code);
    }
  }

  private assertEncryptionAvailable(): void {
    if (this.platform !== "darwin" && this.platform !== "win32") {
      throw secureStoreError("SECURE_STORAGE_UNSUPPORTED");
    }
    let available = false;
    try {
      available = this.options.safeStorage.isEncryptionAvailable();
    } catch {
      available = false;
    }
    if (!available) throw secureStoreError("SECURE_STORAGE_UNAVAILABLE");
  }

  private encryptedFilePath(provider: StoredToken["provider"]): string {
    return path.join(this.tokenDir, `${provider}.token.enc.json`);
  }

  private legacyFilePath(provider: StoredToken["provider"]): string {
    return path.join(this.tokenDir, `${provider}.token.json`);
  }

  private emit(event: SecureTokenStoreEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      // Credential storage must not fail because a diagnostic sink is broken.
    }
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }
}

function parseEnvelope(raw: string, provider: StoredToken["provider"]): EncryptedTokenEnvelope {
  const value = JSON.parse(raw) as Partial<EncryptedTokenEnvelope>;
  if (
    value.version !== ENCRYPTED_TOKEN_VERSION
    || value.provider !== provider
    || typeof value.ciphertext !== "string"
    || value.ciphertext.length === 0
  ) {
    throw new Error("Invalid encrypted token envelope");
  }
  return value as EncryptedTokenEnvelope;
}

function parseStoredToken(raw: string, provider: StoredToken["provider"]): StoredToken {
  const value = JSON.parse(raw) as Partial<StoredToken>;
  if (
    value.provider !== provider
    || typeof value.accessToken !== "string"
    || value.accessToken.length === 0
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || (value.tokenType !== undefined && typeof value.tokenType !== "string")
    || (value.scope !== undefined && typeof value.scope !== "string")
  ) {
    throw new Error("Invalid encrypted token payload");
  }
  return value as StoredToken;
}

function isMissingFileError(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "ENOENT";
}

function secureStoreError(code: SecureTokenStoreErrorCode): SecureTokenStoreError {
  const messages: Record<SecureTokenStoreErrorCode, string> = {
    SECURE_STORAGE_UNSUPPORTED: "Secure credential storage is not supported on this platform.",
    SECURE_STORAGE_UNAVAILABLE: "System secure storage is unavailable. Unlock or repair the OS credential store and try again.",
    SECURE_STORAGE_READ_FAILED: "The encrypted GitHub credential could not be read. Check application data permissions and try again.",
    SECURE_STORAGE_WRITE_FAILED: "The GitHub credential could not be saved securely. Login was not completed.",
    SECURE_STORAGE_DELETE_FAILED: "The stored GitHub credential could not be removed securely.",
  };
  return new SecureTokenStoreError(code, messages[code]);
}
