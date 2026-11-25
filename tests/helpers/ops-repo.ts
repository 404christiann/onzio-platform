import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Operator SQL and rollback scripts live in the private onzio-ops repo, at the same paths they had here.
// Tests that read them run when a checkout sits next to this repo (or ONZIO_OPS_DIR points at one).
// Without one they skip with a warning; this repo's CI has no access, so onzio-ops CI runs them for real
// (`npm run test:ops`, ONZIO_OPS_REQUIRED=1, where a missing file fails instead of skipping).
// tests/architecture/ops-checked-inputs.test.ts fails here if a file they check against changes.
export const OPS_DIR = process.env.ONZIO_OPS_DIR ?? resolve(__dirname, "../../../onzio-ops");
const OPS_REQUIRED = process.env.ONZIO_OPS_REQUIRED === "1";

export function opsPath(relativePath: string): string {
  return resolve(OPS_DIR, relativePath);
}

export function hasOpsFile(relativePath: string): boolean {
  if (existsSync(opsPath(relativePath))) return true;
  if (OPS_REQUIRED) throw new Error(`ONZIO_OPS_REQUIRED=1 but ${relativePath} is missing from ${OPS_DIR}`);
  const message = `${relativePath} is not here (no onzio-ops checkout); its checks are skipped and run in onzio-ops CI`;
  process.stderr.write(`${process.env.GITHUB_ACTIONS ? "::warning title=onzio-ops checks skipped::" : "[onzio-ops] "}${message}\n`);
  return false;
}

export function readOpsFile(relativePath: string): string {
  return readFileSync(opsPath(relativePath), "utf8").replaceAll("\r\n", "\n");
}
