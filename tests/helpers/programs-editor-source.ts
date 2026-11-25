import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readProgramsEditorSource() {
  return [
  "app/admin/(protected)/programs/page.tsx",
  "components/admin/programs/program-editor-types.ts",
  "components/admin/programs/useProgramsEditor.ts",
  "components/admin/programs/ClassicProgramsEditor.tsx",
  "components/admin/programs/ProgramFields.tsx",
  "components/admin/programs/ProgramsCopyFields.tsx",
  "components/admin/programs/ProgramFormField.tsx"
].map(path => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
}
