// ============================================================================
// Capabilities Command
// ----------------------------------------------------------------------------
// `skill-central capabilities --target <target>`
//
// Design intent:
// - This command exposes the exact capability matrix used by the compiler, so
//   target support can be audited before a dry-run or export.
// - Unknown capabilities are not printed because they are open-ended; the
//   compiler treats any capability absent from this matrix as `unknown`.
// ============================================================================

import { getTargetAdapter, isCompileTarget, listTargetNames } from "../adapters/registry.js";
import type { CompileTarget } from "../adapters/types.js";

export interface CapabilitiesOptions {
  target?: string;
}

export function cmdCapabilities(opts: CapabilitiesOptions): void {
  const adapter = getTargetAdapter(parseTarget(opts.target));
  const capabilities = adapter.capabilities();

  console.log("");
  console.log(`▸ Target capabilities`);
  console.log("  " + "-".repeat(72));
  console.log(`  Target : ${adapter.target}`);
  console.log(`  Adapter: ${adapter.label}`);
  console.log(`  Notes  : ${adapter.description}`);
  console.log("");

  for (const capability of capabilities) {
    const suffix = capability.description ? ` - ${capability.description}` : "";
    console.log(`  • ${capability.name}: ${capability.support}${suffix}`);
  }
  console.log("");
  console.log("  Undeclared capabilities resolve as unknown.");
  console.log("");
}

function parseTarget(value: string | undefined): CompileTarget {
  if (!value) throw new Error("Missing required option: --target");
  if (!isCompileTarget(value)) {
    throw new Error(`Unsupported target "${value}". Valid targets: ${listTargetNames().join(", ")}`);
  }
  return value;
}
