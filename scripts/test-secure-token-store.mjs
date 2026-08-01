#!/usr/bin/env node
// Exercises the desktop credential boundary with a deterministic in-memory
// crypto adapter. No real Keychain, DPAPI profile, or user app state is used.

import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  SafeStorageTokenStore,
  SecureTokenStoreError,
} from "../dist/auth/token-store.js";

const root = await mkdtemp(path.join(tmpdir(), "skill-central-secure-token-store."));

try {
  const events = [];
  const adapter = reversibleAdapter();
  const store = new SafeStorageTokenStore({
    safeStorage: adapter,
    appStateDir: root,
    platform: "darwin",
    onEvent: (event) => events.push(event),
  });

  await store.checkAvailability();
  const first = await store.set({
    provider: "github",
    accessToken: "github-secret-token-fixture",
    tokenType: "bearer",
    scope: "repo",
  });
  const tokenPath = path.join(root, "tokens", "github.token.enc.json");
  const raw = await readFile(tokenPath, "utf8");
  assert(!raw.includes("github-secret-token-fixture"), "encrypted file contains plaintext token");
  assert(!raw.includes('"accessToken"'), "encrypted file exposes token schema");
  assert((await store.get("github"))?.accessToken === "github-secret-token-fixture", "secure token roundtrip failed");

  const second = await store.set({
    provider: "github",
    accessToken: "rotated-token-fixture",
    tokenType: "bearer",
    scope: "repo",
  });
  assert(second.createdAt === first.createdAt, "token rotation did not preserve creation time");
  assert((await store.get("github"))?.accessToken === "rotated-token-fixture", "token rotation failed");
  assert(!(await readdir(path.join(root, "tokens"))).some((name) => name.endsWith(".tmp")), "atomic write left a temporary file");

  if (process.platform !== "win32") {
    assert(((await stat(path.join(root, "tokens"))).mode & 0o777) === 0o700, "token directory mode is not 0700");
    assert(((await stat(tokenPath)).mode & 0o777) === 0o600, "encrypted token mode is not 0600");
  }

  await store.delete("github");
  assert(await store.get("github") === undefined, "secure token delete failed");

  const legacyPath = path.join(root, "tokens", "github.token.json");
  await mkdir(path.dirname(legacyPath), { recursive: true });
  await writeFile(legacyPath, '{"accessToken":"legacy-plaintext-fixture"}\n', { mode: 0o600 });
  await store.checkAvailability();
  assert(!await fileExists(legacyPath), "legacy plaintext token was not removed");
  assert(events.some((event) => event.type === "legacy-plaintext-removed"), "legacy removal event missing");

  await store.set({ provider: "github", accessToken: "corruption-fixture" });
  await chmod(tokenPath, 0o600);
  await writeFile(tokenPath, '{"version":1,"provider":"github","ciphertext":"broken"}\n');
  assert(await store.get("github") === undefined, "corrupt ciphertext should force logged-out state");
  assert(!await fileExists(tokenPath), "corrupt ciphertext was not removed");
  assert(events.some((event) => event.type === "unreadable-ciphertext-removed"), "corrupt ciphertext event missing");

  const unavailable = new SafeStorageTokenStore({
    safeStorage: { ...adapter, isEncryptionAvailable: () => false },
    appStateDir: root,
    platform: "darwin",
  });
  await expectSecureError(
    () => unavailable.checkAvailability(),
    "SECURE_STORAGE_UNAVAILABLE",
    "unavailable encryption did not block login",
  );

  const unsupported = new SafeStorageTokenStore({
    safeStorage: adapter,
    appStateDir: root,
    platform: "linux",
  });
  await expectSecureError(
    () => unsupported.checkAvailability(),
    "SECURE_STORAGE_UNSUPPORTED",
    "unsupported platform did not block login",
  );

  const throwing = new SafeStorageTokenStore({
    safeStorage: {
      ...adapter,
      encryptString: () => { throw new Error("native-error-with-private-token-fixture"); },
    },
    appStateDir: root,
    platform: "win32",
  });
  const writeError = await expectSecureError(
    () => throwing.set({ provider: "github", accessToken: "private-token-fixture" }),
    "SECURE_STORAGE_WRITE_FAILED",
    "native encryption failure was not normalized",
  );
  assert(!writeError.message.includes("private"), "normalized storage error leaked sensitive native text");
} finally {
  await rm(root, { recursive: true, force: true });
}

function reversibleAdapter() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, "utf8").reverse(),
    decryptString: (value) => Buffer.from(value).reverse().toString("utf8"),
  };
}

async function expectSecureError(operation, expectedCode, failureMessage) {
  try {
    await operation();
  } catch (err) {
    if (err instanceof SecureTokenStoreError && err.code === expectedCode) return err;
    throw err;
  }
  throw new Error(failureMessage);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
