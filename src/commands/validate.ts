// ============================================================================
// Validate Command
// ----------------------------------------------------------------------------
// "skill-central validate <file...>" — parse one or more skill files and
// run the same validateSkill() the engine uses at load time. Exits 0 on
// all-pass, 1 if any file fails.
// ============================================================================

import { parseSkillFile } from "../storage/parser.js";

export async function cmdValidate(files: string[]): Promise<void> {
  if (files.length === 0) {
    throw new Error("Usage: skill-central validate <file...>");
  }

  let errors = 0;
  console.log("");
  for (const file of files) {
    const schema = await parseSkillFile(file);
    if (schema) {
      console.log(`  ✓ ${file}`);
      console.log(`      id=${schema.id} type=${schema.type} tags=[${(schema.tags ?? []).join(",")}]`);
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