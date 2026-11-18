import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";

let db: Client;
const clubId = CLUB_IDS.alpha;

const content = () => ({
  category: "sponsor-partner",
  cardHeading: "Foothill Transit",
  title: "Foothill Transit becomes Official Front of Jersey Sponsor of RCFC",
  subtitle: "Official Front of Jersey Sponsor for the 2027 Season",
  coverAlt: "Six Rose City FC lockers",
  paragraphs: ["Rose City FC announce sponsorship with Foothill Transit.", "Foothill Transit will be presenting partner on select RCFC content."],
  actionLabel: "Partner with us",
  actionHref: "/community/partnership",
});

async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const timestamp = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await db.query("set local role authenticated");
}

async function anonymous() {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims','',true)");
  await db.query("set local role anon");
}

async function design(templateId = "cinematic", version = 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,$4,$5,$6,$7)", [id, clubId, templateId, version, JSON.stringify({ schemaVersion: 1, template: { id: templateId, version }, navigation: { groups: [{ routes: ["home"] }] } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}

/** A published photo on this club's News surface (or another surface/club). */
async function photo(surface = "news", owner: string = clubId) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at) values($1,$2,'onzio-media',$3,$4,'photograph','image/jpeg',1000,2287,1237,$5,'published',now())",
    [id, owner, `${owner}/${surface}/${id}.jpg`, surface, createHash("sha256").update(id).digest("hex")]);
  await actor();
  return id;
}

async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_cinematic_news_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data;
}
async function save(request: unknown, target: string = clubId) {
  return (await db.query("select onzio.save_cinematic_news_article($1,$2::jsonb) as data", [target, JSON.stringify(request)])).rows[0].data;
}
function create(patch: Record<string, unknown> = {}) {
  return { operationId: randomUUID(), action: "save", articleId: null, expectedRevision: "0", slug: "foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc", publishedAt: "2026-11-20T20:00:00.000Z", coverAssetId: null, content: content(), ...patch };
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("RC2027-NEWS articles: database and save", () => {
  it("creates an article with its cover, reloads it, and replays only the same request's receipt", async () => {
    const cover = await photo();
    const request = create({ coverAssetId: cover });
    const committed = await save(request);
    expect(committed.operationId).toBe(request.operationId);
    expect(committed.retiredMediaAssetIds).toEqual([]);
    expect(committed.article).toMatchObject({ slug: request.slug, revision: "1", publishedAt: "2026-11-20T20:00:00.000Z", removedAt: null, content: content() });
    expect(committed.article.cover).toMatchObject({ assetId: cover, storage_bucket: "onzio-media", storage_path: `${clubId}/news/${cover}.jpg`, width: 2287, height: 1237 });
    const loaded = await load();
    expect(loaded.articles).toEqual([committed.article]);
    expect(await save(request)).toEqual(committed);
    expect((await load(request.operationId)).operation.receipt).toEqual(committed);
    await rejects(() => save({ ...request, content: { ...content(), title: "Reused operation" } }), "OPERATION_REUSED");
    await actor(USER_IDS.adminAal2);
    expect((await load(request.operationId)).operation.status).toBe("not-committed");
  });

  it("keeps the web address unique and fixed after the first save", async () => {
    const first = (await save(create())).article;
    const second = (await save(create())).article;
    expect(second.slug).toBe("foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc-2");
    const edited = await save({ ...create(), articleId: first.id, expectedRevision: first.revision, slug: "something-else", content: { ...content(), title: "A new title" } });
    expect(edited.article).toMatchObject({ id: first.id, slug: first.slug, revision: "2" });
    expect(edited.article.content.title).toBe("A new title");
    for (const slug of ["injury-report", "Not-A-Slug", "", "x".repeat(81)]) await rejects(() => save(create({ slug })), "INVALID_CINEMATIC_NEWS_PAYLOAD");
  });

  it("rejects a stale edit, invalid content and a direct invalid write", async () => {
    const article = (await save(create())).article;
    const stale = { ...create(), articleId: article.id, expectedRevision: article.revision };
    await save({ ...stale, operationId: randomUUID(), content: { ...content(), subtitle: "First editor" } });
    await rejects(() => save(stale), "CINEMATIC_NEWS_CHANGED");
    await rejects(() => save(create({ content: { ...content(), category: "transfers" } })), "INVALID_CINEMATIC_NEWS_PAYLOAD");
    await rejects(() => save(create({ content: { ...content(), actionHref: "javascript:alert(1)" } })), "INVALID_CINEMATIC_NEWS_PAYLOAD");
    await rejects(() => save(create({ content: { ...content(), paragraphs: [] } })), "INVALID_CINEMATIC_NEWS_PAYLOAD");
    await rejects(() => save(create({ publishedAt: "next friday" })), "INVALID_CINEMATIC_NEWS_PAYLOAD");
    await rejects(() => save({ ...create(), articleId: randomUUID(), expectedRevision: "1" }), "NEWS_ARTICLE_NOT_FOUND");
    await rejects(() => db.query("update onzio.cinematic_news_articles set content=jsonb_set(content,'{actionHref}','\"http://example.com\"') where id=$1", [article.id]), "INVALID_CINEMATIC_NEWS_PAYLOAD");
  });

  it("accepts only this club's published News photos as covers and returns a replaced cover for retirement", async () => {
    const first = await photo();
    const second = await photo();
    const shopPhoto = await photo("shop");
    const otherClubPhoto = await photo("news", CLUB_IDS.bravo);
    await rejects(() => save(create({ coverAssetId: shopPhoto })), "NEWS_COVER_INVALID");
    await rejects(() => save(create({ coverAssetId: otherClubPhoto })), "NEWS_COVER_INVALID");
    await rejects(() => save(create({ coverAssetId: randomUUID() })), "NEWS_COVER_INVALID");
    const article = (await save(create({ coverAssetId: first }))).article;
    const replaced = await save({ ...create(), articleId: article.id, expectedRevision: article.revision, coverAssetId: second });
    expect(replaced.retiredMediaAssetIds).toEqual([first]);
    expect(replaced.article.cover.assetId).toBe(second);
    const cleared = await save({ ...create(), articleId: article.id, expectedRevision: replaced.article.revision, coverAssetId: null });
    expect(cleared.retiredMediaAssetIds).toEqual([second]);
    expect(cleared.article.cover).toBeNull();
  });

  it("hides a removed article from visitors, keeps it in the editor and restores it", async () => {
    const article = (await save(create())).article;
    await anonymous();
    expect((await db.query("select slug from onzio.cinematic_news_articles where club_id=$1", [clubId])).rows).toEqual([{ slug: article.slug }]);
    await actor();
    const removed = (await save({ operationId: randomUUID(), action: "remove", articleId: article.id, expectedRevision: article.revision })).article;
    expect(removed.removedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await load()).articles.map((item: { id: string; removedAt: string | null }) => [item.id, item.removedAt !== null])).toEqual([[article.id, true]]);
    await anonymous();
    expect((await db.query("select slug from onzio.cinematic_news_articles where club_id=$1", [clubId])).rowCount).toBe(0);
    await actor();
    const restored = (await save({ operationId: randomUUID(), action: "restore", articleId: article.id, expectedRevision: removed.revision })).article;
    expect(restored).toMatchObject({ removedAt: null, revision: "3" });
    await anonymous();
    expect((await db.query("select slug from onzio.cinematic_news_articles where club_id=$1", [clubId])).rowCount).toBe(1);
  });

  it("lets only this club's owners and admins load or save, and only on cinematic@2", async () => {
    await actor(USER_IDS.adminAal2);
    expect((await save(create())).article.slug).toBeTruthy();
    for (const user of [USER_IDS.unaffiliated, USER_IDS.removed]) {
      await actor(user);
      await rejects(() => load(), "NOT_AUTHORIZED");
      await rejects(() => save(create()), "NOT_AUTHORIZED");
    }
    await actor();
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await rejects(() => save(create(), CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await rejects(() => db.query("insert into onzio.cinematic_news_articles(club_id,slug,content,published_at) values($1,'direct',$2,now())", [CLUB_IDS.bravo, JSON.stringify(content())]), "row-level security");
    await anonymous();
    await rejects(() => save(create()), "permission denied");
    await rejects(() => db.query("insert into onzio.cinematic_news_articles(club_id,slug,content,published_at) values($1,'direct',$2,now())", [clubId, JSON.stringify(content())]), "permission denied");
    await design("editorial", 1);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
    await rejects(() => save(create()), "PAGE_UNAVAILABLE");
  });
});
