import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const receiptName = "onzio-pilot-build.json";
const temporaryName = ".onzio-pilot-build.tmp";
const lockName = ".onzio-pilot-build.lock";
const inputExclusions = new Set([".git", "node_modules", ".next", ".vercel", ".codex-work", ".turbo", "test-results", "playwright-report", "coverage", "output", "tmp", "tsconfig.tsbuildinfo", lockName, "supabase/.temp", "supabase/.branches"]);
const outputExclusions = new Set(["cache", "diagnostics", "trace", receiptName, temporaryName]);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({
  path: z.string().min(1).refine(path => !path.includes("\\") && !path.includes("\0") && path.split("/").every(part => part !== "" && part !== "." && part !== "..")),
  bytes: z.number().int().nonnegative(),
  sha256: hashSchema,
}).strict();
const inventorySchema = z.array(entrySchema).min(1).refine(entries => entries.every((entry, index) => index === 0 || entries[index - 1].path < entry.path));
const receiptSchema = z.object({
  format: z.literal("onzio-pilot-build@1"),
  buildId: z.string().trim().min(1),
  publicEnvironmentSha256: hashSchema,
  inputs: inventorySchema,
  outputs: inventorySchema,
}).strict();
type Inventory = z.infer<typeof inventorySchema>;
type BuildReceipt = z.infer<typeof receiptSchema>;

function hash(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function publicBuildEnvironmentSha256(environment: Record<string, string | undefined>) {
  const values = Object.entries(environment).filter(([name, value]) => value !== undefined && (name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV" || name === "ONZIO_ENVIRONMENT"));
  values.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return hash(JSON.stringify(values));
}
function fileStat(path: string) {
  try { return lstatSync(path); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
function assertDirectory(path: string) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Reconstruction inventory requires regular directories");
}
function inventory(root: string, output: boolean): Inventory {
  assertDirectory(root);
  const entries: Inventory = [];
  function walk(relative: string) {
    for (const name of readdirSync(join(root, relative))) {
      const path = relative ? `${relative}/${name}` : name;
      if (output ? outputExclusions.has(path) : inputExclusions.has(path) || name === ".env" || name.startsWith(".env.")) continue;
      const full = join(root, path);
      const stat = lstatSync(full);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        const bytes = readFileSync(full);
        entries.push({ path, bytes: bytes.length, sha256: hash(bytes) });
      } else throw new Error("Reconstruction inventory refuses included symlinks and special files");
    }
  }
  walk("");
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return entries;
}
export function reconstructionInputs(root: string): Inventory {
  return inventory(root, false);
}
export function assertSameReconstructionInputs(before: Inventory, after: Inventory) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Reconstruction inputs changed; run a fresh guarded build");
}
function outputSnapshot(root: string) {
  const output = join(root, ".next");
  const outputs = inventory(output, true);
  const buildId = outputs.find(entry => entry.path === "BUILD_ID");
  if (!buildId || buildId.bytes === 0 || !outputs.some(entry => entry.path.startsWith("server/") && entry.bytes > 0) || !outputs.some(entry => entry.path.startsWith("static/") && entry.bytes > 0)) {
    throw new Error("Reconstruction requires a complete .next build with BUILD_ID, server and static output");
  }
  const id = readFileSync(join(output, "BUILD_ID"), "utf8").trim();
  if (!id) throw new Error("Reconstruction requires a nonempty BUILD_ID");
  return { outputs, buildId: id };
}
function assertReceiptPaths(root: string, names = [receiptName, temporaryName]) {
  const output = join(root, ".next");
  if (!fileStat(output)) return;
  assertDirectory(output);
  for (const name of names) {
    const path = join(output, name);
    if (fileStat(path) && !lstatSync(path).isFile()) throw new Error("Reconstruction receipt must be a regular file");
  }
}
export function invalidateReconstructionBuild(root: string) {
  assertReceiptPaths(root, [receiptName]);
  const path = join(root, ".next", receiptName);
  if (fileStat(path)) unlinkSync(path);
  const output = join(root, ".next");
  if (fileStat(output)) inventory(output, true);
  const buildId = join(output, "BUILD_ID");
  const stat = fileStat(buildId);
  if (stat && !stat.isFile()) throw new Error("Reconstruction requires a regular BUILD_ID");
  if (stat) unlinkSync(buildId);
  assertReceiptPaths(root, [temporaryName]);
}
export function publishReconstructionBuild(root: string, inputs: Inventory, publicEnvironmentSha256: string) {
  assertReceiptPaths(root);
  const receipt: BuildReceipt = receiptSchema.parse({ format: "onzio-pilot-build@1", inputs, publicEnvironmentSha256, ...outputSnapshot(root) });
  const temporary = join(root, ".next", temporaryName);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    try { writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`); }
    finally { closeSync(descriptor); }
    renameSync(temporary, join(root, ".next", receiptName));
  } catch (error) { unlinkSync(temporary); throw error; }
}
export function verifyReconstructionBuild(root: string, publicEnvironmentSha256: string) {
  let receipt: BuildReceipt;
  let bytes: Buffer;
  try {
    assertReceiptPaths(root);
    bytes = readFileSync(join(root, ".next", receiptName));
    receipt = receiptSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch { throw new Error("Missing or invalid reconstruction build receipt; run a fresh guarded build"); }
  if (receipt.publicEnvironmentSha256 !== publicEnvironmentSha256) throw new Error("Reconstruction public build environment changed; run a fresh guarded build");
  assertSameReconstructionInputs(receipt.inputs, reconstructionInputs(root));
  const current = outputSnapshot(root);
  if (receipt.buildId !== current.buildId || JSON.stringify(receipt.outputs) !== JSON.stringify(current.outputs)) throw new Error("Reconstruction output changed; run a fresh guarded build");
  return { buildId: receipt.buildId, receiptSha256: hash(bytes) };
}
export function acquireReconstructionLock(root: string) {
  const path = join(root, lockName);
  let descriptor: number;
  try { descriptor = openSync(path, "wx", 0o600); }
  catch { throw new Error("Another guarded reconstruction command holds the local lock; remove a stale lock only after checking its process"); }
  return () => { closeSync(descriptor); unlinkSync(path); };
}
export function withReconstructionLock(root: string, action: () => void) {
  const release = acquireReconstructionLock(root);
  try { action(); }
  finally { release(); }
}
