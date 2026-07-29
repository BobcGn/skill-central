// ============================================================================
// Adapters / Registry
// ----------------------------------------------------------------------------
// Stable lookup table for supported target adapters.
//
// Design intent:
// - All CLI/compiler paths validate targets through one registry so adding a
//   fourth IDE does not require hunting through command-specific constants.
// - The registry exposes adapter metadata for `skill-central capabilities`,
//   which keeps capability reporting tied to the adapter implementation.
// ============================================================================

import { cursorAdapter } from "./cursor.js";
import { genericMcpAdapter } from "./generic-mcp.js";
import type { CompileTarget, TargetAdapter } from "./types.js";
import { windsurfAdapter } from "./windsurf.js";

const ADAPTERS: TargetAdapter[] = [
  genericMcpAdapter,
  cursorAdapter,
  windsurfAdapter,
];

export function listTargetAdapters(): TargetAdapter[] {
  return ADAPTERS.slice();
}

export function listTargetNames(): CompileTarget[] {
  return ADAPTERS.map((adapter) => adapter.target);
}

export function isCompileTarget(value: string): value is CompileTarget {
  return ADAPTERS.some((adapter) => adapter.target === value);
}

export function getTargetAdapter(target: CompileTarget): TargetAdapter {
  const adapter = ADAPTERS.find((candidate) => candidate.target === target);
  if (!adapter) {
    throw new Error(`Unsupported target "${target}". Valid targets: ${listTargetNames().join(", ")}`);
  }
  return adapter;
}
