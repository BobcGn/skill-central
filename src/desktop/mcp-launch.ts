import path from "node:path";
import type { McpServerConfig } from "../ide-detection/types.js";
import { PROJECT_ROOT_ENV } from "../mcp.js";

export function desktopCliArgs(argv: readonly string[], packaged: boolean): string[] {
  return argv.slice(packaged ? 1 : 2);
}

export function isDesktopMcpMode(argv: readonly string[], packaged: boolean): boolean {
  return desktopCliArgs(argv, packaged)[0] === "mcp";
}

/**
 * Environment that turns the packaged Electron executable into a plain Node
 * runtime. Clients merge this over their own environment; it is never the
 * complete environment of the spawned server.
 */
export const DESKTOP_NODE_MODE_ENV: Readonly<Record<string, string>> = { ELECTRON_RUN_AS_NODE: "1" };

export function withProjectRootEnv(
  server: McpServerConfig | undefined,
  projectRoot: string,
): McpServerConfig | undefined {
  if (!server) return undefined;
  return {
    ...server,
    env: {
      ...(server.env ?? {}),
      [PROJECT_ROOT_ENV]: projectRoot,
    },
  };
}

/**
 * Builds the MCP launch entry written into IDE configurations.
 *
 * Windows Electron binaries are linked for the GUI subsystem, so writes to
 * `process.stdout` from `<app>.exe mcp` never reach the parent pipe: the stdio
 * server starts, logs readiness on stderr, and then loses every JSON-RPC
 * response, which every client sees as a handshake timeout. Running the same
 * executable under ELECTRON_RUN_AS_NODE against the packaged CLI entry restores
 * stdout and skips the Chromium stack that a stdio server never needs.
 *
 * POSIX packages keep the plain `mcp` argument, which is the launch path the
 * project already validates on macOS.
 */
export function desktopMcpServerConfig(
  packaged: boolean,
  execPath: string,
  appPath: string,
  platform: NodeJS.Platform = process.platform,
  projectRoot?: string,
): McpServerConfig | undefined {
  if (!packaged) return undefined;
  const projectRootEnv: Record<string, string> | undefined = projectRoot
    ? { [PROJECT_ROOT_ENV]: projectRoot }
    : undefined;
  if (platform === "win32") {
    // Resolve with the Windows flavour explicitly: the target platform is an
    // argument here, so the separator must not follow whichever host builds it.
    return {
      command: execPath,
      args: [path.win32.join(appPath, "dist", "index.js"), "mcp"],
      env: { ...DESKTOP_NODE_MODE_ENV, ...(projectRootEnv ?? {}) },
    };
  }
  return {
    command: execPath,
    args: ["mcp"],
    env: projectRootEnv,
  };
}
