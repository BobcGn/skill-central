#!/usr/bin/env electron
// Electron-only worker for validate-macos-keychain.mjs. It prints fixed result
// metadata and never serializes tokens, ciphertext, paths, or native errors.

import { app, safeStorage } from "electron";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  SafeStorageTokenStore,
  SecureTokenStoreError,
} from "../dist/auth/token-store.js";

const [mode, appStateDir, userDataDir] = process.argv.slice(2);
const tokenFixture = process.env.SC_SAFE_STORAGE_TEST_TOKEN;

console.error("SC_KEYCHAIN_STAGE:boot");

if (!tokenFixture || !appStateDir || !userDataDir || !["write", "read-delete"].includes(mode)) {
  console.error("Keychain validation worker received invalid arguments.");
  process.exit(2);
}

app.setName("Skill Central");
app.setPath("userData", userDataDir);

app.whenReady().then(runValidation).catch(failValidation);

async function runValidation() {
  console.error("SC_KEYCHAIN_STAGE:ready");
  const events = [];
  const store = new SafeStorageTokenStore({
    safeStorage,
    appStateDir,
    platform: "darwin",
    onEvent: (event) => events.push(event.type),
  });
  await store.checkAvailability();
  console.error("SC_KEYCHAIN_STAGE:store-ready");

  if (mode === "write") {
    await store.set({
      provider: "github",
      accessToken: tokenFixture,
      tokenType: "bearer",
      scope: "repo",
    });
    console.error("SC_KEYCHAIN_STAGE:written");
    const raw = await readFile(path.join(appStateDir, "tokens", "github.token.enc.json"), "utf8");
    if (raw.includes(tokenFixture) || raw.includes('"accessToken"')) {
      throw new Error("CIPHERTEXT_CONTAINS_PLAINTEXT");
    }
    if (!events.includes("legacy-plaintext-removed")) {
      throw new Error("LEGACY_REMOVAL_EVENT_MISSING");
    }
    await assertRestrictedPermissions(appStateDir);
  } else {
    const token = await store.get("github");
    console.error("SC_KEYCHAIN_STAGE:read");
    if (token?.accessToken !== tokenFixture) throw new Error("CROSS_PROCESS_DECRYPT_FAILED");
    await store.delete("github");
    console.error("SC_KEYCHAIN_STAGE:deleted");
    if (await store.get("github")) throw new Error("LOGOUT_FAILED");
  }

  console.log(JSON.stringify({ ok: true, stage: mode, backend: store.describe().backend }));
  app.quit();
}

function failValidation(err) {
  const code = err instanceof SecureTokenStoreError
    ? err.code
    : err instanceof Error && /^[A-Z0-9_]+$/.test(err.message)
      ? err.message
      : "KEYCHAIN_VALIDATION_FAILED";
  console.error(`Keychain validation worker failed: ${code}`);
  app.exit(1);
}

async function assertRestrictedPermissions(root) {
  const tokenDirMode = (await stat(path.join(root, "tokens"))).mode & 0o777;
  const tokenFileMode = (await stat(path.join(root, "tokens", "github.token.enc.json"))).mode & 0o777;
  if (tokenDirMode !== 0o700 || tokenFileMode !== 0o600) {
    throw new Error("TOKEN_PERMISSIONS_INVALID");
  }
}
