import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function registrationsEditorSource() {
 const paths = ["registration-editor-model.ts", "useRegistrationsEditor.ts", "RegistrationFormFields.tsx", "RegistrationRegistrants.tsx", "ClassicRegistrationsEditor.tsx"];
 return (await Promise.all(paths.map(path => readFile(resolve(process.cwd(), "components/admin/registrations", path), "utf8")))).join("\n");
}
