// cinematic@2 homepage load and save work on main's binding model; every other template still rejects 'cinematic'.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { cinematicHomepageSaveContent, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

let db: Client;
const clubId = CLUB_IDS.alpha;

async function actor() {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function design(version: 1 | 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)`,
  [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function load(): Promise<any> { return (await db.query("select onzio.load_homepage($1) as data", [clubId])).rows[0].data; }
async function save(sections: Record<string, unknown>): Promise<any> {
  const value = await load();
  const request = { operationId: randomUUID(), expectedRevision: value.revision, designRevision: value.designRevision, sections };
  return (await db.query("select onzio.save_homepage($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); } finally { await db.query("rollback to savepoint expected_failure"); }
}
/** homepage_binding_identity is private (only the security-definer save path calls it), so these checks run as the
 * test's database owner: callers reset the role once, before any savepoint, never inside a failing query. */
async function binding(design: Record<string, unknown>) {
  return (await db.query("select onzio_private.homepage_binding_identity($1::jsonb) as data", [JSON.stringify(design)])).rows[0].data;
}

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic@2 homepage on main's binding model", () => {
  it("loads a cinematic@2 homepage with its binding and saves the cinematic section", async () => {
    await design(2);
    const loaded = await load();
    expect(loaded.design).toMatchObject({ templateKey: "cinematic@2", slideshowVariant: "cinematic" });
    expect(loaded.design.binding).toMatchObject({ revision: 1 });
    const saved = await save({ revamp: cinematicHomepageSaveContent(defaultCinematicHomepageContent()) });
    expect(saved.content.revamp).toBeTruthy();
    expect((await load()).content.revamp).toEqual(saved.content.revamp);
  });

  it("still saves main's sections for cinematic@2 (hero)", async () => {
    await design(2);
    const saved = await save({ hero: { eyebrow: "Rose City FC" } });
    expect(saved.content.hero.eyebrow).toBe("Rose City FC");
  });

  it("rejects the cinematic homepage section for a template that is not cinematic@2", async () => {
    await design(1);
    await rejects(() => save({ revamp: cinematicHomepageSaveContent(defaultCinematicHomepageContent()) }), "SECTION_UNAVAILABLE");
  });

  it("accepts slideshowVariant 'cinematic' only for cinematic@2", async () => {
    await db.query("reset role");
    expect(await binding({ templateKey: "cinematic@2", heroVariant: "editable", slideshowVariant: "cinematic" })).toMatchObject({ revision: 1 });
    for (const templateKey of ["cinematic@1", "academy@1", "clubhouse@1", "editorial@1", "heritage@1", null]) {
      await rejects(() => binding({ templateKey, heroVariant: "editable", slideshowVariant: "cinematic" }), "INVALID_HOMEPAGE_BINDING");
    }
  });

  it("keeps main's binding keys for the existing templates", async () => {
    await db.query("reset role");
    expect((await binding({ templateKey: "academy@1", heroVariant: "editable", slideshowVariant: "none" })).key).toBe("legacy/homepage-story/home-kit/full-hero/no-caption");
    expect((await binding({ templateKey: "clubhouse@1", heroVariant: "editable", slideshowVariant: "matchday" })).key).toBe("legacy/about-story/shop-kits/compact-hero/no-caption");
  });
});
