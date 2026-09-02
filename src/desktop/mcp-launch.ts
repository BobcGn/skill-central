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
 * Packaged MCP servers must never enter Electron's GUI runtime. Besides fixing
 * stdout for Windows GUI-subsystem executables, ELECTRON_RUN_AS_NODE prevents
 * every desktop Runtime, IDE connection, and health probe from allocating a
 * second Chromium process tree on macOS.
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
  const entrypoint = platform === "win32"
    // The target platform is an argument here, so path separators must not
    // follow whichever host happens to build or test the package.
    ? path.win32.join(appPath, "dist", "index.js")
    : path.posix.join(appPath, "dist", "index.js");
  return {
    command: execPath,
    args: [entrypoint, "mcp"],
    env: { ...DESKTOP_NODE_MODE_ENV, ...(projectRootEnv ?? {}) },
  };
}
