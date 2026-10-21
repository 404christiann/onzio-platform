import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { z } from "zod";
import ts from "typescript";
import { homepageHeroSchema } from "@/lib/homepage-editor/contract";
import { parsePresentationDocument } from "@/packages/presentation";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "./environment";

export const releaseIds = {
  a: "10000000-0000-4000-8000-000000000001",
  b: "10000000-0000-4000-8000-000000000002",
};
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const eventSchema = z.object({
  clubId: z.uuid(), id: z.uuid(), previousId: z.uuid().nullable(),
  releaseId: z.uuid().nullable(), legacyId: z.uuid().nullable(),
  digest: z.string().regex(/^[a-f0-9]{64}$/).nullable(), binding: z.string().nullable(), legacy: z.unknown(),
}).strict().refine(row => (row.releaseId === null) !== (row.legacyId === null));
export type AssignmentEvent = z.infer<typeof eventSchema>;
export type Release = { id: string; root: string; digest: string; binding: string };
export type Resolution =
  | { kind: "published"; event: AssignmentEvent; release: Release }
  | { kind: "legacy"; event: AssignmentEvent }
  | { kind: "missing" | "invalid" | "unavailable" | "lookup-failed" };
const files = ["badge.png", "bindings.mjs", "page.mjs", "site.css"];

export async function artifactDigest(root: string) {
  assert.deepEqual((await readdir(root)).sort(), files);
  const entries = await Promise.all(files.map(async file => {
    assert((await lstat(join(root, file))).isFile(), "Retained fixtures require regular files");
    const bytes = await readFile(join(root, file));
    if (file.endsWith(".mjs")) {
      const source = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function inspect(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
          assert(ts.isStringLiteral(node.moduleSpecifier) && ["react", "./bindings.mjs"].includes(node.moduleSpecifier.text), "Fixture import escapes its declared closure");
        }
        assert(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), "Fixture imports must be static");
        ts.forEachChild(node, inspect);
      }
      inspect(source);
    }
    if (file.endsWith(".css")) assert(!/@import|url\s*\(/i.test(bytes.toString()), "Fixture CSS must be self-contained");
    return [file, createHash("sha256").update(bytes).digest("hex")];
  }));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

export async function resolveAssignment(clubId: string, lookup: () => Promise<unknown>, releases: readonly Release[]): Promise<Resolution> {
  let raw: unknown;
  try { raw = await lookup(); } catch { return { kind: "lookup-failed" }; }
  if (raw === null) return { kind: "missing" };
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success || parsed.data.clubId !== clubId) return { kind: "invalid" };
  const event = parsed.data;
  if (event.legacyId) {
    try { parsePresentationDocument(event.legacy, { surface: "production" }); }
    catch { return { kind: "invalid" }; }
    return { kind: "legacy", event };
  }
  const release = releases.find(candidate => candidate.id === event.releaseId);
  if (!release) return { kind: "unavailable" };
  if (release.digest !== event.digest || release.binding !== event.binding) return { kind: "invalid" };
  try { if (await artifactDigest(release.root) !== release.digest) return { kind: "unavailable" }; }
  catch { return { kind: "unavailable" }; }
  return { kind: "published", event, release };
}

export function renderRelease(release: Release, hero: z.infer<typeof homepageHeroSchema>) {
  const markup = execFileSync(process.execPath, ["--input-type=module", "--eval", `
    import {readFileSync} from 'node:fs';
    import {pathToFileURL} from 'node:url';
    import {createElement} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    const {Page,revision} = await import(pathToFileURL(process.argv[1]).href);
    const input=JSON.parse(readFileSync(0,'utf8'));
    if(revision!==input.binding) throw new Error('BINDING_CHANGED');
    process.stdout.write(renderToStaticMarkup(createElement(Page,input)));
  `, join(release.root, "page.mjs")], {
    cwd: release.root, encoding: "utf8",
    input: JSON.stringify({ hero: homepageHeroSchema.parse(hero), assets: `/releases/${release.id}`, binding: release.binding }),
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alpha assignment proof</title><link rel="stylesheet" href="/releases/${release.id}/site.css"></head><body>${markup}</body></html>`;
}

export async function contentFingerprint(db: Client) {
  const result = await db.query(`select
    (select jsonb_agg(to_jsonb(h) order by club_id) from onzio.homepage_hero_content h where club_id=any($1::uuid[])) as hero,
    (select jsonb_agg(to_jsonb(s) order by club_id) from onzio.presentation_state s where club_id=any($1::uuid[])) as design,
    (select jsonb_agg(to_jsonb(r) order by club_id,actor_id,operation_id) from onzio_private.homepage_save_receipts r where club_id=any($1::uuid[])) as receipts`,
  [[CLUB_IDS.alpha, CLUB_IDS.bravo]]);
  return JSON.stringify(result.rows);
}


export async function openProof() {
  assertSafeTestEnvironment();
  await mkdir(resolve("test-results"), { recursive: true });
  const directory = await mkdtemp(resolve("test-results/site-assignment-"));
  const schema = `site_proof_${randomUUID().replaceAll("-", "")}`;
  const db = new Client(config);
  try { await db.connect(); } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  const initialContent = await contentFingerprint(db);
  const clients = [db];
  const releases: Release[] = [];
  async function close() {
    try {
      const outcomes = await Promise.allSettled(clients.slice(1).map(async client => {
        try { await client.query("rollback"); } finally { await client.end(); }
      }));
      assert(outcomes.every(outcome => outcome.status === "fulfilled"), "Proof connections failed to close");
      assert.equal(await contentFingerprint(db), initialContent, "Alpha/Bravo fixtures changed");
    } finally {
      try { await db.query(`drop schema if exists ${schema} cascade`); } finally { await db.end(); }
    }
  }
  try {
    const clubs = await db.query("select id,kind,slug from onzio.clubs where id=any($1::uuid[]) order by slug", [[CLUB_IDS.alpha, CLUB_IDS.bravo]]);
    assert.deepEqual(clubs.rows.map(row => [row.kind, row.slug]), [["test", "alpha"], ["test", "bravo"]]);
    await db.query((await readFile("tests/fixtures/site-assignment/schema.sql", "utf8")).replaceAll("PROOF_SCHEMA", schema));
    for (const [label, id] of Object.entries(releaseIds)) {
      const root = join(directory, label);
      await cp(resolve("tests/fixtures/site-assignment/releases", label), root, { recursive: true });
      const release = { id, root, digest: await artifactDigest(root), binding: "legacy-homepage-hero@1" };
      releases.push(release);
      await db.query(`insert into ${schema}.releases values($1,$2,$3,$4)`, [CLUB_IDS.alpha, id, release.digest, release.binding]);
    }
    async function connection(role = "service_role") {
      assert(["service_role", "authenticated", "anon"].includes(role));
      const client = new Client(config); await client.connect(); clients.push(client);
      await client.query("set statement_timeout='8s'");
      await client.query(`set role ${role}`);
      return client;
    }
    async function lookup(clubId: string = CLUB_IDS.alpha): Promise<unknown> {
      const result = await db.query(`select jsonb_build_object('clubId',e.club_id,'id',e.id,'previousId',e.previous_id,
        'releaseId',e.release_id,'legacyId',e.legacy_id,'digest',r.digest,'binding',r.binding,'legacy',d.configuration) as data
        from ${schema}.state s join ${schema}.events e on e.club_id=s.club_id and e.id=s.current_id
        left join ${schema}.releases r on r.club_id=e.club_id and r.id=e.release_id
        left join onzio.presentation_documents d on d.club_id=e.club_id and d.id=e.legacy_id where s.club_id=$1`, [clubId]);
      return result.rows[0]?.data ?? null;
    }
    async function transition(client: Client, expected: string | null, release: string | null, action = "publish", legacy: string | null = null, clubId: string = CLUB_IDS.alpha) {
      return z.uuid().parse((await client.query(`select ${schema}.transition($1,$2,$3,$4,$5,$6) as id`,
        [clubId, expected, release, legacy, USER_IDS.ownerAal2, action])).rows[0].id);
    }
    async function selected() {
      return resolveAssignment(CLUB_IDS.alpha, () => lookup(), releases);
    }
    async function publish(client: Client, expected: string | null, releaseId: string, action = "publish") {
      const current = await selected();
      if (current.kind !== "missing" && current.kind !== "published" && current.kind !== "legacy") throw new Error("CURRENT_UNAVAILABLE");
      const target = releases.find(release => release.id === releaseId);
      try { assert(target && await artifactDigest(target.root) === target.digest); }
      catch { throw new Error("TARGET_UNAVAILABLE"); }
      return transition(client, expected, releaseId, action);
    }
    return { db, schema, directory, releases, connection, lookup, transition, selected, publish, close,
      removeArtifacts: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await close(); await rm(directory, { recursive: true, force: true }); throw error; }
}
export type Proof = Awaited<ReturnType<typeof openProof>>;
