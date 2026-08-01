// ============================================================================
// Validate-Rule Command
// ----------------------------------------------------------------------------
// "skill-central validate-rule <file...>" — parse one or more rule files and
// run the same validateRule() the reader uses at load time. Exits 0 on
// all-pass, 1 if any file fails. Mirrors the skill-side `validate` command but
// stays on the independent rule pipeline.
// ============================================================================

import { parseRuleFile } from "../storage/rule-reader.js";

export async function cmdValidateRule(files: string[]): Promise<void> {
  if (files.length === 0) {
    throw new Error("Usage: skill-central validate-rule <file...>");
  }

  let errors = 0;
  console.log("");
  for (const file of files) {
    const rule = await parseRuleFile(file);
    if (rule) {
      console.log(`  ✓ ${file}`);
      console.log(
        `      id=${rule.id} severity=${rule.severity} tags=[${(rule.tags ?? []).join(",")}]`,
      );
    } else {
      console.log(`  ✗ ${file}  (see warnings above)`);
      errors++;
    }
  }
  console.log("");

  if (errors > 0) {
    throw new Error(`${errors} file(s) failed validation.`);
  }
}
