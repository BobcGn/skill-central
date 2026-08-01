#!/usr/bin/env electron
// Runs a real Device Flow against GitHub, persists the token with safeStorage,
// and emits only fixed-schema, non-secret validation events.

import { app, safeStorage, shell } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { GitHubDeviceFlowClient, tokenResponseToStoredToken } from "../dist/auth/github.js";
import { SafeStorageTokenStore } from "../dist/auth/token-store.js";

const [appStateDir, userDataDir] = process.argv.slice(2);
const clientId = process.env.SKILL_CENTRAL_GITHUB_CLIENT_ID?.trim();
let stage = "boot";

markStage(stage);

if (
  !appStateDir
  || !userDataDir
  || !clientId
  || !/^[A-Za-z0-9._-]{8,128}$/.test(clientId)
) {
  console.error("GitHub authentication worker received invalid configuration.");
  process.exit(2);
}

app.setName("Skill Central");
app.setPath("userData", userDataDir);
app.whenReady().then(runValidation).catch(failValidation);

async function runValidation() {
  stage = "secure-storage";
  markStage(stage);
  const store = new SafeStorageTokenStore({ safeStorage, appStateDir, platform: "darwin" });
  await store.checkAvailability();

  stage = "device-request";
  markStage(stage);
  const client = new GitHubDeviceFlowClient({ clientId, scope: "repo" });
  const device = await client.requestDeviceCode();
  console.log(JSON.stringify({
    event: "authorization-required",
    verificationUri: device.verificationUri,
    userCode: device.userCode,
    scope: "repo",
  }));
  void shell.openExternal(device.verificationUri).catch(() => undefined);

  stage = "authorization";
  markStage(stage);
  const token = await pollUntilToken(client, device);
  const grantedScopes = new Set((token.scope ?? "").split(",").map((scope) => scope.trim()));
  if (!grantedScopes.has("repo")) throw new Error("AUTH_REPO_SCOPE_MISSING");

  stage = "profile";
  markStage(stage);
  const user = await client.fetchUser(token.accessToken);
  if (!Number.isInteger(user.id) || !user.login) throw new Error("AUTH_PROFILE_INVALID");

  stage = "persistence";
  markStage(stage);
  await store.set(tokenResponseToStoredToken(token));
  const persisted = await store.get("github");
  if (persisted?.accessToken !== token.accessToken) throw new Error("AUTH_PERSISTENCE_FAILED");
  const encryptedPath = path.join(appStateDir, "tokens", "github.token.enc.json");
  const encrypted = await readFile(encryptedPath, "utf8");
  if (encrypted.includes(token.accessToken) || encrypted.includes('"accessToken"')) {
    throw new Error("AUTH_CIPHERTEXT_LEAK");
  }

  stage = "logout";
  markStage(stage);
  await store.delete("github");
  if (await store.get("github")) throw new Error("AUTH_LOCAL_LOGOUT_FAILED");

  stage = "complete";
  markStage(stage);
  console.log(JSON.stringify({
    event: "complete",
    result: {
      ok: true,
      authenticated: true,
      profileFetched: true,
      encryptedPersistence: true,
      localLogout: true,
    },
  }));
  app.quit();
}

async function pollUntilToken(client, device) {
  const expiresAt = Date.now() + device.expiresIn * 1000;
  let intervalSeconds = device.interval;
  while (Date.now() < expiresAt) {
    await delay(intervalSeconds * 1000);
    const result = await client.pollForToken(device.deviceCode);
    if (!("pending" in result)) return result;
    intervalSeconds += result.intervalAdjustmentSeconds;
  }
  throw new Error("AUTH_DEVICE_FLOW_EXPIRED");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function markStage(value) {
  console.error(`SC_GITHUB_AUTH_STAGE:${value}`);
}

function failValidation() {
  // The parent reports the fixed stage code. Never serialize network, provider,
  // safeStorage, token, ciphertext, or filesystem error objects.
  app.exit(1);
}
