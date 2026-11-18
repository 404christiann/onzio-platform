import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { MAX_INJURY_ENTRIES, starterCinematicInjuryReportContent, type CinematicInjuryReportContent } from "@/lib/cinematic-injury-report-content";

let db: Client;
const clubId = CLUB_IDS.alpha;

async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function design(version = 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)`,
  [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function asset(kind: "graphic" | "photograph", owner: string = clubId, status = "published") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at)
    values($1,$2,'onzio-media',$3,'news',$4,'image/webp',100,1200,670,$5,$6,now(),case when $6='orphaned' then now() else null end)`,
  [id, owner, `${owner}/news/${id}.webp`, kind, "c".repeat(64), status]);
  await actor();
  return id;
}
async function player(name: string, number: number, position = "Defender", options: { owner?: string; active?: boolean } = {}) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.players(id,club_id,number,name,position,age,active) values($1,$2,$3,$4,$5,24,$6)",
    [id, options.owner ?? clubId, number, name, position, options.active ?? true]);
  await actor();
  return id;
}
async function slideshowPhoto(assetId: string) {
  await db.query("reset role");
  await db.query("insert into onzio.homepage_slideshow_photos(club_id,url,media_asset_id,alt,sort_order) values($1,$2,$3,'Match photo',99)",
    [clubId, `http://127.0.0.1:55321/storage/v1/object/public/onzio-media/${clubId}/news/${assetId}.webp`, assetId]);
  await actor();
}
async function retire(id: string) {
  await db.query("reset role");
  await db.query("set local role service_role");
  const status = (await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data", [clubId, id, USER_IDS.ownerAal2])).rows[0].data.status;
  await actor();
  return status;
}
async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_cinematic_injury_report_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data;
}
async function request(content: CinematicInjuryReportContent) {
  const snapshot = await load();
  return { operationId: randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content };
}
async function save(body: unknown) {
  return (await db.query("select onzio.save_cinematic_injury_report_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(body)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string | RegExp) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
const entry = (playerId: string, injury = "Hamstring strain", timeline = "2–3 weeks", note = "") => ({ id: randomUUID(), playerId, injury, timeline, note });
function content(entries: CinematicInjuryReportContent["entries"], media: Partial<Pick<CinematicInjuryReportContent, "presenterLogoAssetId" | "bandAssetId">> = {}): CinematicInjuryReportContent {
  const value = starterCinematicInjuryReportContent();
  value.page.quote = "Our goal is to get every athlete back on the field.";
  value.page.quoteAttribution = "MVMNT CULTR rehab team";
  return { ...value, ...media, entries };
}

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic Injury Report atomic save", () => {
  it("saves the page, logo, photo band and ordered entries together, and replays only the same actor's receipt", async () => {
    const homepage = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows;
    const [a, b] = [await player("Sample Defender", 4), await player("Sample Forward", 9, "Forward")];
    const [logo, band] = [await asset("graphic"), await asset("photograph")];
    const body = await request(content([entry(b, "Ankle sprain", "Day-to-day", "Assessed before the next match."), entry(a)], { presenterLogoAssetId: logo, bandAssetId: band }));
    body.content.page.videoUrl = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";
    const committed = await save(body);
    expect(committed.content.entries.map((row: { playerId: string }) => row.playerId)).toEqual([b, a]);
    expect(committed.content.entries[0]).toMatchObject({ injury: "Ankle sprain", timeline: "Day-to-day", note: "Assessed before the next match." });
    expect(committed.content).toMatchObject({ presenterLogoAssetId: logo, bandAssetId: band });
    expect(committed.content.page.videoUrl).toBe("https://www.youtube.com/embed/fJf_A4LdKDw?rel=0");
    expect(committed.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: logo, width: 1200, height: 670 }), expect.objectContaining({ id: band }),
    ]));
    expect((await load()).content).toEqual(committed.content);
    expect(await save(body)).toEqual(committed);
    expect((await load(body.operationId)).operation.receipt).toEqual(committed);
    await rejects(() => save({ ...body, content: { ...body.content, entries: [] } }), "OPERATION_REUSED");
    expect((await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows).toEqual(homepage);
    await actor(USER_IDS.adminAal2);
    expect((await load(body.operationId)).operation.status).toBe("not-committed");
  });

  it("offers the club's active Roster players for the picker, not inactive or other clubs' players", async () => {
    const active = await player("Sample Midfielder", 7, "Midfielder");
    await player("Former Player", 99, "Forward", { active: false });
    await player("Bravo Player", 5, "Defender", { owner: CLUB_IDS.bravo });
    const players = (await load()).players as { id: string; name: string; number: number; position: string }[];
    expect(players).toContainEqual({ id: active, name: "Sample Midfielder", number: 7, position: "Midfielder" });
    expect(players.map(row => row.name)).not.toContain("Former Player");
    expect(players.map(row => row.name)).not.toContain("Bravo Player");
  });

  it("rejects another club's player, an inactive player and an unknown player", async () => {
    const others = [await player("Bravo Player", 5, "Defender", { owner: CLUB_IDS.bravo }), await player("Former Player", 99, "Forward", { active: false }), randomUUID()];
    for (const id of others) await rejects(async () => save(await request(content([entry(id)]))), "INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD");
    expect((await load()).content).toBeNull();
  });

  it("needs this club's published graphic for the logo and published photograph for the band", async () => {
    const bad = [
      { presenterLogoAssetId: await asset("photograph") },
      { presenterLogoAssetId: await asset("graphic", CLUB_IDS.bravo) },
      { presenterLogoAssetId: await asset("graphic", clubId, "orphaned") },
      { bandAssetId: await asset("graphic") },
      { bandAssetId: await asset("photograph", CLUB_IDS.bravo) },
    ];
    for (const media of bad) await rejects(async () => save(await request(content([], media))), "INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD");
  });

  it("returns a replaced logo or band for retirement, and keeps a band the Home slideshow still uses", async () => {
    const [logo, band] = [await asset("graphic"), await asset("photograph")];
    await slideshowPhoto(band);
    await save(await request(content([], { presenterLogoAssetId: logo, bandAssetId: band })));
    const newLogo = await asset("graphic");
    const replaced = await save(await request(content([], { presenterLogoAssetId: newLogo, bandAssetId: null })));
    expect(replaced.retiredMediaAssetIds).toEqual([logo, band].sort());
    expect(await retire(logo)).toBe("retired");
    expect(await retire(band)).toBe("referenced");
    expect(await retire(newLogo)).toBe("referenced");
  });

  it("rejects invalid content inside the database too", async () => {
    const p = await player("Sample Defender", 4);
    const tooMany = Array.from({ length: MAX_INJURY_ENTRIES + 1 }, () => entry(p));
    const blankHeading = content([]); blankHeading.page.rehabHeading = " ";
    const badVideo = content([]); badVideo.page.videoUrl = "https://youtu.be/fJf_A4LdKDw";
    const longQuote = content([]); longQuote.page.quote = "x".repeat(601);
    for (const bad of [content(tooMany), content([entry(p), entry(p)]), content([entry(p, " ")]), content([entry(p, "Sprain", "")]), blankHeading, badVideo, longQuote]) {
      await rejects(async () => save(await request(bad)), "INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD");
    }
    await rejects(async () => save({ ...(await request(content([]))), content: { ...content([]), extra: true } }), "INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD");
    await rejects(async () => save({ ...(await request(content([]))), content: { ...content([]), entries: "none" } }), "INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD");
  });

  it("rejects stale saves and a changed design", async () => {
    const p = await player("Sample Defender", 4);
    const stale = await request(content([entry(p)]));
    await save(await request(content([])));
    await rejects(() => save(stale), "CINEMATIC_INJURY_REPORT_CHANGED");
    const current = await request(content([]));
    await design();
    await rejects(() => save(current), "DESIGN_CHANGED");
  });

  it("denies another tenant and other website designs", async () => {
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await design(1);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
  });

  it("lets visitors read the report but not write it directly", async () => {
    const p = await player("Sample Defender", 4);
    await save(await request(content([entry(p, "Groin tightness", "1 week")])));
    await db.query("reset role");
    await db.query("set local role anon");
    expect((await db.query("select injury, timeline from onzio.cinematic_injury_entries where club_id=$1", [clubId])).rows).toEqual([{ injury: "Groin tightness", timeline: "1 week" }]);
    expect((await db.query("select content->>'rehabHeading' as heading from onzio.cinematic_injury_report_content where club_id=$1", [clubId])).rows).toEqual([{ heading: "Rehab with MVMNT CULTR" }]);
    await rejects(() => db.query("insert into onzio.cinematic_injury_entries(club_id,id,sort_order,player_id,injury,timeline) values($1,$2,5,$3,'Anon','1 week')", [clubId, randomUUID(), p]), "permission denied");
    await actor(USER_IDS.unaffiliated);
    await rejects(() => db.query("insert into onzio.cinematic_injury_entries(club_id,id,sort_order,player_id,injury,timeline) values($1,$2,5,$3,'Stranger','1 week')", [clubId, randomUUID(), p]), /row-level security|NOT_AUTHORIZED/);
  });
});
