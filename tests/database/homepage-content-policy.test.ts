import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  homepageHeroSchema, homepageStorySchema, homepageVideoSchema, type HomepageSaveRequest,
} from "@/lib/homepage-editor/contract";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const club = CLUB_IDS.alpha;
const snapshotSchema = z.object({
  revision: z.string(), designRevision: z.string(), videoSource: z.string(),
  design: z.object({ templateKey: z.string().nullable(), heroVariant: z.string(), slideshowVariant: z.string() }).passthrough(),
  content: z.object({
    hero: homepageHeroSchema, story: homepageStorySchema, video: homepageVideoSchema,
    photos: z.object({ seasonLabel: z.string(), items: z.array(z.object({
      rowId: z.uuid(), assetId: z.uuid().nullable(), alt: z.string(), order: z.number(), url: z.string(),
    }).passthrough()) }),
  }),
}).passthrough();
type Snapshot = z.infer<typeof snapshotSchema>;
const story = { visible: true, heading: "Maintained story", bodyPrimary: "First paragraph", bodySecondary: "Second paragraph", ctaLabel: "Read more" };
const video = { visible: false, eyebrow: "Behind our club", title: "Maintained video", description: "Our team", video_title: "Club video", caption: "Next season" };
let db: Client;

async function actor(userId: string = USER_IDS.ownerAal2, ageDays = 0) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second - ageDays * 86400 }],
  })]);
  await db.query("set local role authenticated");
}
async function design(template = "editorial", slug?: string) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
  [id, club, template, { schemaVersion: 1, template: { id: template, version: 1 } }, "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=excluded.published_document_id`, [club, id, USER_IDS.ownerAal2]);
  if (slug) await db.query("update onzio.clubs set slug=$2 where id=$1", [club, slug]);
  await actor();
}
async function load(id: string = club): Promise<Snapshot> {
  return snapshotSchema.parse((await db.query("select onzio.load_homepage($1) as data", [id])).rows[0].data);
}
async function request(sections: HomepageSaveRequest["sections"]): Promise<HomepageSaveRequest> {
  const before = await load();
  return { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision, sections };
}
async function save(payload: unknown, id: string = club): Promise<Snapshot> {
  return snapshotSchema.parse((await db.query("select onzio.save_homepage($1,$2::jsonb) as data", [id, JSON.stringify(payload)])).rows[0].data);
}
async function fingerprint(id: string = club) {
  await db.query("savepoint observation");
  try {
    await db.query("reset role");
    return (await db.query(`select
      (select to_jsonb(h) from onzio.homepage_hero_content h where club_id=$1) as hero,
      (select to_jsonb(s) from onzio.homepage_story_section s where club_id=$1) as story,
      (select to_jsonb(v) from onzio.behind_the_rose_section v where club_id=$1) as video,
      (select to_jsonb(s) from onzio.homepage_slideshow_settings s where club_id=$1) as settings,
      (select jsonb_agg(to_jsonb(p) order by id) from onzio.homepage_slideshow_photos p where club_id=$1) as photos,
      (select to_jsonb(r) from onzio_private.homepage_revisions r where club_id=$1) as revision,
      (select jsonb_agg(to_jsonb(r) order by actor_id,operation_id) from onzio_private.homepage_save_receipts r where club_id=$1) as receipts,
      (select jsonb_agg(to_jsonb(a) order by id) from onzio.audit_events a where club_id=$1) as audit`, [id])).rows[0];
  } finally { await db.query("rollback to savepoint observation"); }
}
async function denied(payload: unknown, message: string, id: string = club) {
  const before = await fingerprint(id);
  await db.query("savepoint expected_failure");
  try { await expect(save(payload, id)).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
  expect(await fingerprint(id)).toEqual(before);
}
async function asset(changes: { owner?: string; bucket?: string; surface?: string; status?: string; deleted?: boolean } = {}) {
  await db.query("reset role");
  const id = randomUUID(), owner = changes.owner ?? club;
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at)
    values($1,$2,$3,$4,$5,'photograph','image/webp',100,100,100,$6,$7,now(),$8)`,
  [id, owner, changes.bucket ?? "onzio-media", `${owner}/homepage/${id}.webp`, changes.surface ?? "homepage", "b".repeat(64), changes.status ?? "published", changes.deleted ? new Date() : null]);
  await actor();
  return id;
}
function photo(assetId: string, changes: Record<string, unknown> = {}) {
  return { clientId: "prepared", rowId: null, assetId, alt: "Our players", order: 0, ...changes };
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(config);
  await db.connect();
  await db.query("set statement_timeout='8s'");
  await db.query("begin");
  await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("homepage content independent of current design", () => {
  for (const [role, user] of [["owner", USER_IDS.ownerAal2], ["admin", USER_IDS.adminAal2]] as const) {
    it.each(["editorial", "clubhouse"])(`lets a fresh ${role} maintain a hidden %s eyebrow`, async template => {
      await design(template);
      await actor(user);
      const result = await save(await request({ hero: { eyebrow: "Unrendered eyebrow" } }));
      expect(result.content.hero.eyebrow).toBe("Unrendered eyebrow");
      expect(await load()).toMatchObject({ revision: result.revision, content: { hero: { eyebrow: "Unrendered eyebrow" } } });
    });

    it(`lets a fresh ${role} maintain Rose City's fixed hero`, async () => {
      await design("cinematic", "rose-city");
      await actor(user);
      const before = await load();
      expect(before.design.heroVariant).toBe("legacy-fixed");
      const result = await save(await request({ hero: { headline_line_one: "Maintained fixed hero", intro: "Future introduction" } }));
      expect(result.content.hero).toMatchObject({ headline_line_one: "Maintained fixed hero", intro: "Future introduction" });
      expect((await load()).revision).not.toBe(before.revision);
    });

    it(`lets a fresh ${role} create absent hidden story and video together`, async () => {
      await db.query("reset role");
      await db.query("delete from onzio.homepage_story_section where club_id=$1", [club]);
      await db.query("delete from onzio.behind_the_rose_section where club_id=$1", [club]);
      await actor(user);
      const payload = await request({ hero: { eyebrow: "All supplied fields are hidden" }, story, video });
      const result = await save(payload);
      expect(result.content).toMatchObject({ hero: payload.sections.hero, story, video });
      expect(result.videoSource).toBe("");
      expect((await load()).content).toEqual(result.content);
    });

    it(`lets a fresh ${role} create hidden Academy photos, season label and video`, async () => {
      await design("academy");
      await db.query("reset role");
      await db.query("delete from onzio.homepage_slideshow_photos where club_id=$1", [club]);
      await db.query("delete from onzio.homepage_slideshow_settings where club_id=$1", [club]);
      const assetId = await asset();
      await actor(user);
      expect((await load()).design.slideshowVariant).toBe("none");
      const result = await save(await request({ photos: { items: [photo(assetId)], seasonLabel: "Maintained 2027 season" }, video }));
      expect(result.content.photos).toMatchObject({ seasonLabel: "Maintained 2027 season", items: [{ assetId, order: 0, alt: "Our players" }] });
      expect(result.content.photos.items[0].rowId).toMatch(/^[a-f0-9-]{36}$/);
      expect(result.content.video).toEqual(video);
      expect((await load()).content).toEqual(result.content);
    });

    it(`lets a fresh ${role} maintain hidden Clubhouse video without replacing its source`, async () => {
      await design("clubhouse");
      await db.query("reset role");
      await db.query(`insert into onzio.behind_the_rose_section(club_id,video_url) values($1,'https://example.test/operator-video')
        on conflict(club_id) do update set video_url=excluded.video_url`, [club]);
      await actor(user);
      const result = await save(await request({ video: { ...video, visible: true } }));
      expect(result.content.video).toEqual({ ...video, visible: true });
      expect((await load()).videoSource).toBe("https://example.test/operator-video");
    });
  }

  it.each([
    { story: { ...story, heading: "x".repeat(121) } },
    { story: { ...story, visible: null } },
    { story: { ...story, bodyPrimary: "x".repeat(1201) } },
    { story: { ...story, extra: "forged" } },
    { hero: { eyebrow: 17 } },
    { hero: { primary_cta_href: "https://example.test/external" }, story },
    { video: { ...video, video_url: "https://example.test/forged" } },
    { video: { ...video, videoSource: "https://example.test/forged" } },
    { video: { ...video, visible: "false" } },
    { unknown: story },
  ])("retains strict hidden-content validation with no effects (%#)", async sections => {
    const payload = await request({ hero: { intro: "Must roll back" } });
    await denied({ ...payload, sections: { ...payload.sections, ...sections } }, "INVALID_HOMEPAGE_PAYLOAD");
  });

  it("requires a source for visible video even when the design hides video", async () => {
    await db.query("reset role");
    await db.query("delete from onzio.behind_the_rose_section where club_id=$1", [club]);
    await actor();
    await denied(await request({ hero: { intro: "Must roll back" }, video: { ...video, visible: true } }), "VIDEO_SOURCE_REQUIRED");
  });

  it.each([
    { owner: CLUB_IDS.bravo }, { bucket: "onzio-upload-staging", status: "staged" }, { surface: "roster" },
    { status: "staged" }, { deleted: true },
  ])("rejects unusable assets for hidden Academy photos with no effects (%#)", async changes => {
    await design("academy");
    const assetId = await asset(changes);
    await denied(await request({ hero: { intro: "Must roll back" }, photos: { items: [photo(assetId)] } }), "INVALID_PHOTO");
  });

  it("rejects a foreign photo row while accepting neither its identity nor URL", async () => {
    await design("academy");
    await db.query("reset role");
    const id = randomUUID();
    await db.query("insert into onzio.homepage_slideshow_photos(id,club_id,url,alt,sort_order) values($1,$2,'foreign.webp','Other club',0)", [id, CLUB_IDS.bravo]);
    await actor();
    await denied(await request({ photos: { items: [{ clientId: "foreign", rowId: id, assetId: null, alt: "No", order: 0 }] } }), "INVALID_PHOTO");
  });

  it.each(["url", "order", "duplicate-client", "duplicate-asset", "duplicate-row", "maximum"])("rejects hidden malformed photo %s without effects", async kind => {
    await design("academy");
    const assetId = await asset();
    const nextAsset = await asset();
    let items = [photo(assetId)];
    let message = "INVALID_HOMEPAGE_PAYLOAD";
    if (kind === "url") items = [photo(assetId, { url: "https://example.test/raw.webp" })];
    if (kind === "order") items = [photo(assetId, { order: 2 })];
    if (kind === "duplicate-client") items = [photo(assetId), photo(nextAsset, { order: 1 })];
    if (kind === "duplicate-asset") { items = [photo(assetId), photo(assetId, { clientId: "second", order: 1 })]; message = "INVALID_PHOTO"; }
    if (kind === "duplicate-row") {
      const receipt = await save(await request({ photos: { items: [photo(assetId)] } }));
      const rowId = receipt.content.photos.items[0].rowId;
      items = [photo(assetId, { rowId }), photo(nextAsset, { rowId, clientId: "second", order: 1 })];
      message = "INVALID_PHOTO";
    }
    if (kind === "maximum") items = Array.from({ length: 7 }, (_, order) => photo(assetId, { clientId: `photo-${order}`, order }));
    const baseline = await load();
    await denied({ operationId: randomUUID(), expectedRevision: baseline.revision, designRevision: baseline.designRevision,
      sections: { hero: { intro: "Must roll back" }, photos: { items } } }, message);
  });

  it("rolls back hidden story, hero, audit, revision and receipt on the final video write", async () => {
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_hidden_video() returns trigger language plpgsql as
      $$ begin raise exception 'injected hidden video failure'; end $$`);
    await db.query("create trigger test_reject_hidden_video before insert or update on onzio.behind_the_rose_section for each row execute function pg_temp.reject_hidden_video()");
    await actor();
    await denied(await request({ hero: { eyebrow: "Must roll back" }, story, video }), "injected hidden video failure");
  });

  it.each([USER_IDS.unaffiliated, USER_IDS.removed])("denies hidden-content saves by nonmembers or removed members (%s)", async user => {
    const payload = await request({ story, video });
    await actor(user);
    await denied(payload, "NOT_AUTHORIZED");
  });

  it("denies hidden saves with expired sessions, foreign tenants or anonymous execution", async () => {
    const payload = await request({ story, video });
    await actor(USER_IDS.ownerAal2, 31);
    await denied(payload, "NOT_AUTHORIZED");
    await actor();
    await denied(payload, "NOT_AUTHORIZED", CLUB_IDS.bravo);
    await db.query("reset role");
    await db.query("set local role anon");
    await denied(payload, "permission denied");
  });

  it.each(["archived", "suspended"])("denies hidden writes and exact replay after the club becomes %s", async state => {
    const payload = await request({ story, video });
    await save(payload);
    const fresh = await request({ story: { ...story, heading: "Must not save" } });
    await db.query("reset role");
    if (state === "archived") await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended',archived_at=now() where id=$1", [club]);
    else await db.query("update onzio.clubs set kind='customer',public_access='suspended' where id=$1", [club]);
    await actor();
    await denied(fresh, "NOT_AUTHORIZED");
    await denied(payload, "NOT_AUTHORIZED");
  });

  it.each(["onboarding", "grace"])("keeps hidden content editable during %s", async state => {
    await db.query("reset role");
    await db.query("update onzio.clubs set kind='customer',lifecycle=$2,public_access=$3 where id=$1", [club, state === "onboarding" ? "onboarding" : "active", state === "onboarding" ? "preview" : "grace"]);
    await actor();
    await save(await request({ story, video }));
    expect((await load()).content.story).toEqual(story);
  });

  it("checks current authorization before replaying an exact hidden-content receipt", async () => {
    const payload = await request({ story, video });
    await save(payload);
    await actor(USER_IDS.ownerAal2, 31);
    await denied(payload, "NOT_AUTHORIZED");
    await db.query("reset role");
    await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [club, USER_IDS.ownerAal2]);
    await actor();
    await denied(payload, "NOT_AUTHORIZED");
  });

  it("preserves real pre-policy receipts across the actual migration and later design/content changes", async () => {
    await db.query("reset role");
    const historical = readFileSync("supabase/migrations/20260915180623_homepage_atomic_save.sql", "utf8");
    const start = historical.indexOf("create function onzio.save_homepage(");
    const end = historical.indexOf("revoke all on function onzio.save_homepage", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    await db.query(historical.slice(start, end).replace("create function", "create or replace function"));
    await design("academy");
    const payload = await request({ hero: { intro: "Original pre-policy receipt" }, story });
    const receipt = await save(payload);
    await db.query("reset role");
    const beforeMigration = await fingerprint();
    const security = (await db.query(`select proacl,prosecdef,proconfig,pg_get_function_identity_arguments(oid) as arguments
      from pg_proc where oid='onzio.save_homepage(uuid,jsonb)'::regprocedure`)).rows;
    await db.query(readFileSync("supabase/migrations/20261022183955_homepage_content_policy.sql", "utf8"));
    expect(await fingerprint()).toEqual(beforeMigration);
    expect((await db.query(`select proacl,prosecdef,proconfig,pg_get_function_identity_arguments(oid) as arguments
      from pg_proc where oid='onzio.save_homepage(uuid,jsonb)'::regprocedure`)).rows).toEqual(security);
    await design("clubhouse");
    await actor(USER_IDS.adminAal2);
    const otherOperation = (await db.query("select onzio.load_homepage($1,$2) as data", [club, payload.operationId])).rows[0].data;
    expect(otherOperation.operation).toEqual({ status: "not-committed" });
    await save(await request({ hero: { intro: "Later admin content" }, story: { ...story, heading: "Maintained after migration" } }));
    await denied(payload, "DESIGN_CHANGED");
    await actor();
    const beforeReplay = await fingerprint();
    expect(await save(payload)).toEqual(receipt);
    expect(await fingerprint()).toEqual(beforeReplay);
    expect((await load()).content.hero.intro).toBe("Later admin content");
    await denied({ ...payload, sections: { ...payload.sections, hero: { intro: "Changed original request" } } }, "OPERATION_REUSED");
    await denied({ ...payload, operationId: randomUUID() }, "DESIGN_CHANGED");
  });
});

it("persists hidden legacy story through loopback PostgREST and denies foreign membership without effects", async () => {
  await db.query("rollback");
  const id = randomUUID();
  const { client, cleanup } = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
  try {
    await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Homepage policy HTTP','test','active','live')", [id, `policy-${id}`]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
    const loaded = await client.rpc("load_homepage", { p_club_id: id }).abortSignal(AbortSignal.timeout(5000));
    expect(loaded.error).toBeNull();
    const before = snapshotSchema.parse(loaded.data);
    expect(before.design.templateKey).toBeNull();
    const payload: HomepageSaveRequest = { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision, sections: { story } };
    const saved = await client.rpc("save_homepage", { p_club_id: id, p_request: payload }).abortSignal(AbortSignal.timeout(5000));
    expect(saved.error).toBeNull();
    expect(snapshotSchema.parse(saved.data).content.story).toEqual(story);
    expect((await db.query("select heading from onzio.homepage_story_section where club_id=$1", [id])).rows).toEqual([{ heading: story.heading }]);
    const foreign = await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" });
    try {
      await db.query("begin");
      const untouched = await fingerprint(id);
      const rejected = await foreign.client.rpc("save_homepage", { p_club_id: id, p_request: { ...payload, operationId: randomUUID() } }).abortSignal(AbortSignal.timeout(5000));
      expect(rejected.error).toMatchObject({ code: "42501", message: "NOT_AUTHORIZED" });
      expect(rejected.status).toBe(403);
      expect(await fingerprint(id)).toEqual(untouched);
      await db.query("rollback");
    } finally { await foreign.cleanup(); }
  } finally {
    await db.query("rollback");
    for (const table of ["homepage_story_section", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [id]);
    await db.query("delete from onzio.clubs where id=$1", [id]);
    expect((await db.query("select id from onzio.clubs where id=$1", [id])).rows).toEqual([]);
    await cleanup();
  }
});
