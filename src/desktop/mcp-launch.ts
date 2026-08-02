import type { McpServerConfig } from "../ide-detection/types.js";

export function desktopCliArgs(argv: readonly string[], packaged: boolean): string[] {
  return argv.slice(packaged ? 1 : 2);
}

export function isDesktopMcpMode(argv: readonly string[], packaged: boolean): boolean {
  return desktopCliArgs(argv, packaged)[0] === "mcp";
}

export function desktopMcpServerConfig(packaged: boolean, execPath: string): McpServerConfig | undefined {
  if (!packaged) return undefined;
  return {
    command: execPath,
    args: ["mcp"],
  };
}
