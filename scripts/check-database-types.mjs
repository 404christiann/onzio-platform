import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const generatedPath = resolve(root, "lib/database.generated.ts");
const committed = readFileSync(generatedPath, "utf8");
const generated = execFileSync(
  "supabase",
  ["gen", "types", "typescript", "--local", "--schema", "onzio"],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);

if (generated !== committed) {
  console.error(
    "Generated database types have drifted. Run `npm run db:types` and commit the result.",
  );
  process.exit(1);
}

console.log("Generated database types match the local Onzio schema.");
