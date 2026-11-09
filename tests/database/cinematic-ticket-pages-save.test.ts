import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import type { TicketPageContent, TicketPageKey } from "@/lib/cinematic-ticket-pages-content";
import { emptyTicketPageContent } from "@/lib/cinematic-ticket-pages-content";
import { knowBeforeYouGoReferenceContent, seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";

let db: Client;
const clubId = CLUB_IDS.alpha;
const FN: Record<TicketPageKey, string> = { "season-membership": "season_membership", "know-before-you-go": "know_before_you_go" };
const REFERENCE: Record<TicketPageKey, TicketPageContent> = { "season-membership": seasonMembershipReferenceContent, "know-before-you-go": knowBeforeYouGoReferenceContent };
const PAGES = Object.keys(FN) as TicketPageKey[];
const reference = <K extends TicketPageKey>(page: K) => structuredClone(REFERENCE[page]) as TicketPageContent<K>;

async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const timestamp = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await db.query("set local role authenticated");
}
async function design(version = 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)", [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version }, navigation: { groups: [{ routes: ["home", "schedule"] }] } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function load(page: TicketPageKey, operationId?: string, target: string = clubId) {
  return (await db.query(`select onzio.load_${FN[page]}_editor($1,$2) as data`, [target, operationId ?? null])).rows[0].data;
}
async function input<K extends TicketPageKey>(page: K, content: TicketPageContent<K> = reference(page)) {
  const s = await load(page);
  return { operationId: randomUUID(), expectedRevision: s.revision, designRevision: s.designRevision, content, retiredMediaAssetIds: [] as string[] };
}
async function save(page: TicketPageKey, request: unknown) {
  return (await db.query(`select onzio.save_${FN[page]}_editor($1,$2::jsonb) as data`, [clubId, JSON.stringify(request)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
async function asset(tenant: string = clubId, surface = "homepage", kind = "graphic") {
  await db.query("reset role");
  const id = randomUUID(), path = `${tenant}/${surface}/${id}.png`;
  await db.query("insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,created_by,published_at) values($1,$2,'onzio-media',$3,$4,$5,'image/png',100,100,100,$6,'published',$7,now())", [id, tenant, path, surface, kind, "a".repeat(64), USER_IDS.ownerAal2]);
  await actor();
  return id;
}
async function digest(table: string) {
  await db.query("reset role");
  const value = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as d from onzio.${table} t where club_id=$1`, [clubId])).rows[0].d;
  await actor();
  return value;
}
beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Season Ticket Membership and Know Before You Go atomic saves", () => {
  it.each(PAGES)("%s saves Sam's copy, replays the exact receipt and leaves every other page untouched", async page => {
    const others = ["homepage_revamp_content", "cinematic_tickets_content", "cinematic_robinson_content"];
    const before = await Promise.all(others.map(digest));
    const other = PAGES.find(key => key !== page)!;
    const otherBefore = await load(other);
    expect((await load(page)).content).toBeNull();
    const r = await input(page);
    const committed = await save(page, r);
    expect(committed.revision).toBe("1");
    expect(committed.content).toEqual(REFERENCE[page]);
    expect(await save(page, r)).toEqual(committed);
    expect((await load(page, r.operationId)).operation.receipt).toEqual(committed);
    expect(await Promise.all(others.map(digest))).toEqual(before);
    expect(await load(other)).toEqual(otherBefore);
    await rejects(() => save(page, { ...r, content: { ...r.content, heading: { ...r.content.heading, title: "Changed operation" } } }), "OPERATION_REUSED");
    await actor(USER_IDS.adminAal2);
    expect((await load(page, r.operationId)).operation.status).toBe("not-committed");
  });

  it.each(PAGES)("%s rejects a stale revision, a direct write in between and a changed design without losing content", async page => {
    const stale = await input(page);
    await save(page, await input(page));
    await rejects(() => save(page, stale), "VISITOR_PAGE_CHANGED");
    const another = await input(page);
    await db.query("reset role");
    await db.query("update onzio.cinematic_ticket_pages set content=jsonb_set(content,'{heading,title}','\"Direct title\"') where club_id=$1 and page=$2", [clubId, page]);
    await actor();
    await rejects(() => save(page, another), "VISITOR_PAGE_CHANGED");
    expect((await load(page)).content.heading.title).toBe("Direct title");
    const current = await input(page);
    await design();
    await rejects(() => save(page, current), "DESIGN_CHANGED");
  });

  type Change = (c: Record<string, any>) => void;
  it.each<[TicketPageKey, string, Change]>([
    ["season-membership", "an unknown field", c => { c.clubId = randomUUID(); }],
    ["season-membership", "a number where text belongs", c => { c.heading.title = 123; }],
    ["season-membership", "overlong text", c => { c.intro.text = "x".repeat(4001); }],
    ["season-membership", "two price columns", c => { c.pricing.columns.pop(); }],
    ["season-membership", "a price row with four prices", c => { c.pricing.rows[0].prices.push("$1"); }],
    ["season-membership", "seven price rows", c => { for (let n = 2; n <= 7; n += 1) { c.pricing.rows.push({ id: `seat-${n}`, name: "", prices: ["", "", ""] }); c.images[`seat-${n}`] = { assetId: null, alt: "" }; } }],
    ["season-membership", "an unsafe button link", c => { c.button.href = "javascript:alert(1)"; }],
    ["season-membership", "a plain-HTTP button link", c => { c.button.href = "http://tickets.example.com"; }],
    ["season-membership", "a stray image slot", c => { c.images["benefit-99"] = { assetId: null, alt: "" }; }],
    ["season-membership", "a benefit without an image slot", c => { delete c.images["benefit-1"]; }],
    ["season-membership", "duplicate benefit IDs", c => { c.benefits.items[1].id = c.benefits.items[0].id; delete c.images["benefit-2"]; }],
    ["season-membership", "an image URL", c => { c.images.ticket.assetId = "https://example.test/ticket.jpg"; }],
    ["know-before-you-go", "a badly named tile", c => { c.facts.tiles[0].id = "Tile One"; }],
    ["know-before-you-go", "a missing raffle slot", c => { delete c.images.raffle; }],
    ["know-before-you-go", "an unsafe donor link", c => { c.donor.buttonHref = "//evil.example.com"; }],
    ["know-before-you-go", "a localhost watch link", c => { c.match.watchHref = "https://localhost/live"; }],
    ["know-before-you-go", "a text visibility switch", c => { c.raffle.visible = "yes"; }],
  ])("%s rejects %s without writing", async (page, _, change) => {
    const r = await input(page);
    change(r.content as unknown as Record<string, unknown>);
    await rejects(() => save(page, r), "INVALID_VISITOR_PAYLOAD");
    expect((await load(page)).content).toBeNull();
  });

  it("accepts HTTPS, email and site links", async () => {
    const r = await input("know-before-you-go");
    r.content.match.watchHref = "https://www.youtube.com/@rosecityfc";
    r.content.donor.buttonHref = "mailto:partners@rosecityfutbolclub.com";
    expect((await save("know-before-you-go", r)).content.donor.buttonHref).toBe("mailto:partners@rosecityfutbolclub.com");
    const s = await input("season-membership");
    s.content.button.href = "/contact";
    expect((await save("season-membership", s)).content.button.href).toBe("/contact");
  });

  it("rejects malformed content and image identities from a direct writer without advancing the revision", async () => {
    await save("season-membership", await input("season-membership"));
    const before = await load("season-membership");
    await rejects(() => db.query("update onzio.cinematic_ticket_pages set content=jsonb_set(content,'{pricing,visible}','\"yes\"') where club_id=$1 and page='season-membership'", [clubId]), "INVALID_VISITOR_PAYLOAD");
    await rejects(() => db.query("update onzio.cinematic_ticket_pages set content=jsonb_set(content,'{images,ticket,assetId}',to_jsonb($2::text)) where club_id=$1 and page='season-membership'", [clubId, randomUUID()]), "INVALID_VISITOR_PAYLOAD");
    await rejects(() => db.query("insert into onzio.cinematic_ticket_pages(club_id,page,content) values($1,'tickets',$2::jsonb)", [clubId, JSON.stringify(emptyTicketPageContent("season-membership"))]), "INVALID_VISITOR_PAYLOAD");
    expect(await load("season-membership")).toEqual(before);
  });

  it("denies another club's admin, other templates and anonymous writes, while visitors can read the page", async () => {
    await save("know-before-you-go", await input("know-before-you-go"));
    await rejects(() => load("season-membership", undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await db.query("reset role");
    await db.query("set local role anon");
    expect((await db.query("select page from onzio.cinematic_ticket_pages where club_id=$1", [clubId])).rows).toEqual([{ page: "know-before-you-go" }]);
    await rejects(() => db.query("insert into onzio.cinematic_ticket_pages(club_id,page,content) values($1,'season-membership',$2::jsonb)", [clubId, JSON.stringify(emptyTicketPageContent("season-membership"))]), "permission denied");
    await actor();
    await design(1);
    await rejects(() => load("season-membership"), "PAGE_UNAVAILABLE");
  });

  it("accepts only this club's published homepage graphics and retires an image only when nothing uses it", async () => {
    const id = await asset(), foreign = await asset(CLUB_IDS.bravo), shop = await asset(clubId, "shop");
    const r = await input("know-before-you-go");
    for (const wrong of [foreign, shop, randomUUID()]) {
      r.content.images["tile-1"].assetId = wrong;
      await rejects(() => save("know-before-you-go", r), "INVALID_VISITOR_MEDIA");
    }
    r.content.images["tile-1"].assetId = id;
    r.content.images["tile-14"].assetId = id;
    const committed = await save("know-before-you-go", r);
    expect(committed.content.images["tile-1"]).toEqual({ assetId: id, alt: "" });
    expect(committed.content.images.raffle).toEqual({ assetId: null, alt: knowBeforeYouGoReferenceContent.images.raffle.alt });
    expect(committed.media.map((m: { id: string }) => m.id)).toEqual([id]);
    await db.query("reset role");
    expect((await db.query("select slot, media_asset_id from onzio.cinematic_ticket_page_images where club_id=$1 order by slot", [clubId])).rows)
      .toEqual([{ slot: "tile-1", media_asset_id: id }, { slot: "tile-14", media_asset_id: id }]);
    expect((await db.query("select content#>'{images,tile-1}' as stored from onzio.cinematic_ticket_pages where club_id=$1", [clubId])).rows[0].stored).toEqual({ alt: "" });
    expect((await db.query("select onzio_private.media_asset_has_references($1,$2,$3) as linked", [clubId, id, `${clubId}/homepage/${id}.png`])).rows[0].linked).toBe(true);
    await actor();
    const clearOne = await input("know-before-you-go", (await load("know-before-you-go")).content);
    clearOne.content.images["tile-1"].assetId = null;
    expect((await save("know-before-you-go", clearOne)).retiredMediaAssetIds).toEqual([]);
    // Removing the tile itself drops its image too.
    const removeTile = await input("know-before-you-go", (await load("know-before-you-go")).content);
    removeTile.content.facts.tiles = removeTile.content.facts.tiles.filter(tile => tile.id !== "tile-14");
    delete removeTile.content.images["tile-14"];
    expect((await save("know-before-you-go", removeTile)).retiredMediaAssetIds).toEqual([id]);
    await db.query("reset role");
    await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [id]);
    await actor();
    const retired = await input("season-membership");
    retired.content.images.ticket.assetId = id;
    await rejects(() => save("season-membership", retired), "INVALID_VISITOR_MEDIA");
  });

  it("refuses a direct image row pointing at another club's file or a shop photo", async () => {
    await save("season-membership", await input("season-membership"));
    const foreign = await asset(CLUB_IDS.bravo), shop = await asset(clubId, "shop", "photograph");
    for (const wrong of [foreign, shop]) {
      await db.query("savepoint direct");
      await expect(db.query("insert into onzio.cinematic_ticket_page_images(club_id,page,slot,media_asset_id) values($1,'season-membership','ticket',$2)", [clubId, wrong])).rejects.toThrow();
      await db.query("rollback to savepoint direct");
    }
  });
});
