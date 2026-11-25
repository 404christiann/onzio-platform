import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Operator SQL and rollback scripts live in the private onzio-ops repo, at the same paths they had here.
// Tests that read them run when a checkout sits next to this repo (or ONZIO_OPS_DIR points at one) and skip otherwise.
export const OPS_DIR = process.env.ONZIO_OPS_DIR ?? resolve(__dirname, "../../../onzio-ops");

export function opsPath(relativePath: string): string {
  return resolve(OPS_DIR, relativePath);
}

export function hasOpsFile(relativePath: string): boolean {
  return existsSync(opsPath(relativePath));
}

export function readOpsFile(relativePath: string): string {
  return readFileSync(opsPath(relativePath), "utf8").replaceAll("\r\n", "\n");
}
