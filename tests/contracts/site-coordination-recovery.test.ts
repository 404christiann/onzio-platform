import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { recoverCoordinationProof } from "../helpers/site-coordination-proof";

const directories: string[] = [];
const record = () => ({
  version: 2, ownerPid: process.pid, clubId: randomUUID(), schema: `site_coordination_${randomUUID().replaceAll("-", "")}`,
  documents: { a: randomUUID(), b: randomUUID(), legacy: randomUUID() }, stage: "prepared",
  baseline: { scope: "base", protectedSha256: "a".repeat(64), immutableTrigger: "O" },
});

async function journal(value: unknown) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "onzio-academy-proof-")));
  directories.push(directory);
  const file = join(directory, "recovery.json");
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  return file;
}

afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

it("rejects a live owner before opening an offline cleanup", async () => {
  await expect(recoverCoordinationProof(await journal(record()))).rejects.toThrow("Cannot recover a live proof owner");
});

it("does not treat a clean marker as permission to recover a live owner", async () => {
  await expect(recoverCoordinationProof(await journal({ ...record(), stage: "verified-clean" }))).rejects.toThrow("Cannot recover a live proof owner");
});

it("requires manual recovery for a journal that lost its original baseline", async () => {
  await expect(recoverCoordinationProof(await journal({ version: 1, clubId: randomUUID(), stage: "cleanup-failed" }))).rejects.toThrow("Version 1 journals require manual recovery");
});

it.each([
  ["club ID", (value: ReturnType<typeof record>) => ({ ...value, clubId: "not-an-id" })],
  ["schema name", (value: ReturnType<typeof record>) => ({ ...value, schema: "onzio; drop schema onzio" })],
  ["duplicate document", (value: ReturnType<typeof record>) => ({ ...value, documents: { ...value.documents, b: value.documents.a } })],
  ["missing protected hash", (value: ReturnType<typeof record>) => ({ ...value, baseline: { scope: "base", immutableTrigger: "O" } })],
  ["missing full baseline", (value: ReturnType<typeof record>) => ({ ...value, stage: "populated" })],
  ["missing schema hash", (value: ReturnType<typeof record>) => ({ ...value, stage: "populated", baseline: { ...value.baseline, scope: "academy", clubs: [], tenant: { content: "a".repeat(64), billing: "a".repeat(64), editor: "a".repeat(64), authority: "a".repeat(64) } } })],
  ["raw row payload", (value: ReturnType<typeof record>) => ({ ...value, baseline: { ...value.baseline, rows: [{ name: "Not a permitted journal field" }] } })],
])("rejects malformed %s without a database operation", async (_label, change) => {
  await expect(recoverCoordinationProof(await journal(change(record())))).rejects.toThrow();
});

it("rejects a full baseline that includes its disposable club", async () => {
  const value = record();
  await expect(recoverCoordinationProof(await journal({ ...value, stage: "populated", baseline: { ...value.baseline, scope: "academy", clubs: [value.clubId], tenant: { content: "a".repeat(64), billing: "a".repeat(64), editor: "a".repeat(64), authority: "a".repeat(64) }, schemaSha256: "a".repeat(64) } }))).rejects.toThrow("Unrelated recovery clubs");
});

it("rejects a readable journal and directory with unsafe permissions", async () => {
  const file = await journal(record());
  await chmod(file, 0o644);
  await expect(recoverCoordinationProof(file)).rejects.toThrow("Recovery journal must have mode 600");
  await chmod(file, 0o600);
  await chmod(dirname(file), 0o755);
  await expect(recoverCoordinationProof(file)).rejects.toThrow("Recovery directory must have mode 700");
});

it("rejects a journal symlink", async () => {
  const file = await journal(record());
  const target = join(dirname(file), "target.json");
  await writeFile(target, JSON.stringify(record()), { mode: 0o600 });
  await rm(file);
  await symlink(target, file);
  await expect(recoverCoordinationProof(file)).rejects.toThrow("Recovery journal must be a regular file");
});

it("rejects a directory symlink", async () => {
  const file = await journal(record());
  const link = `${dirname(file)}alias`;
  await symlink(dirname(file), link);
  try { await expect(recoverCoordinationProof(join(link, "recovery.json"))).rejects.toThrow("private regular directory"); }
  finally { await rm(link); }
});
