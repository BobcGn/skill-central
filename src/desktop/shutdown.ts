// ============================================================================
// Desktop / Deterministic Shutdown
// ----------------------------------------------------------------------------
// Electron must keep the main process alive until its owned MCP child and
// loopback HTTP listener have both stopped. This module stays Electron-free so
// lifecycle behavior can be tested without launching a GUI.
// ============================================================================

import type { RuntimeController } from "../web/server.js";

interface ClosableServer {
  listening?: boolean;
  close(callback?: (error?: Error) => void): unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}

export interface DesktopServiceHandle {
  runtime: RuntimeController;
  server: ClosableServer;
}

export async function shutdownDesktopServices(
  board: DesktopServiceHandle | undefined,
  serverTimeoutMs = 2000,
): Promise<void> {
  if (!board) return;
  const results = await Promise.allSettled([
    board.runtime.stop(),
    closeServer(board.server, serverTimeoutMs),
  ]);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}

function closeServer(server: ClosableServer, timeoutMs: number): Promise<void> {
  if (server.listening === false) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      error ? reject(error) : resolve();
    };
    const forceTimer = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, timeoutMs);
    server.closeIdleConnections?.();
    try {
      server.close(finish);
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
