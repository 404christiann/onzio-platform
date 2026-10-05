import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

let db: Client;
const clubId = CLUB_IDS.alpha;

async function actor(userId = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}
async function design(template = "academy") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
  [id, clubId, template, JSON.stringify({ schemaVersion: 1, template: { id: template, version: 1 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`, [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_contact_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data as {
    revision: string; profile: Record<string, unknown> | null; page: Record<string, unknown> | null;
    operation?: { status: string; receipt?: unknown };
  };
}
async function save(payload: unknown, target: string = clubId) {
  return (await db.query("select onzio.save_contact_editor($1,$2::jsonb) as data", [target, JSON.stringify(payload)])).rows[0].data;
}
async function request(overrides: Record<string, unknown> = {}) {
  const baseline = await load();
  return {
    operationId: randomUUID(), expectedRevision: baseline.revision,
    profile: { public_email: "hello@example.test", public_phone: "(312) 731-9479", service_area: "Chicago", hours: "Weekdays" },
    page: { eyebrow: "CONTACT", headline: "Talk to the club", intro: "We would love to hear from you.", hero_media_asset_id: null },
    ...overrides,
  };
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect(); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("atomic Contact editor save", () => {
  it("commits shared details and page copy together and reconciles a lost response", async () => {
    const original = await load();
    const payload = await request();
    const committed = await save(payload);
    expect(committed.profile.public_email).toBe("hello@example.test");
    expect(committed.page.headline).toBe("Talk to the club");
    expect(committed.revision).not.toBe(original.revision);
    expect(await save(payload)).toEqual(committed);
    expect((await load(payload.operationId)).operation).toEqual({ status: "committed", receipt: committed });
    await rejects(() => save({ ...payload, page: { ...payload.page, headline: "Changed" } }), "OPERATION_REUSED");
  });

  it("rolls back profile, page, revision, and receipt if media validation fails", async () => {
    const original = await load();
    const payload = await request({ page: { eyebrow: "A", headline: "B", intro: "C", hero_media_asset_id: randomUUID() } });
    await rejects(() => save(payload), "INVALID_CONTACT_MEDIA");
    expect(await load()).toEqual(original);
    expect((await load(payload.operationId)).operation).toEqual({ status: "not-committed" });
  });

  it("rejects a stale editor without overwriting either Contact record", async () => {
    const stale = await request();
    const first = await request({ profile: { ...stale.profile, public_email: "first@example.test" } });
    await save(first);
    await rejects(() => save(stale), "CONTACT_CHANGED");
    const latest = await load();
    expect(latest.profile?.public_email).toBe("first@example.test");
    expect(latest.page?.headline).toBe("Talk to the club");
  });

  it.each([null, 0, true, {}, [], "", "-1", "abc", "1".repeat(21)])(
    "rejects malformed expectedRevision %j without overwriting a newer save",
    async (expectedRevision) => {
      const malformed = await request({ expectedRevision });
      await save(await request({ page: { ...malformed.page, headline: "A newer Contact save" } }));
      const latest = await load();
      await rejects(() => save(malformed), "INVALID_CONTACT_PAYLOAD");
      expect(await load()).toEqual(latest);
      expect((await load(malformed.operationId)).operation).toEqual({ status: "not-committed" });
    },
  );

  it("advances revision for direct legacy updates and blocks a stale save", async () => {
    const payload = await request();
    await db.query("reset role");
    await db.query("update onzio.contact_profile set public_email='legacy@example.test' where club_id=$1", [clubId]);
    await actor();
    await rejects(() => save(payload), "CONTACT_CHANGED");
  });

  it("does not expose another club's Contact snapshot or accept invalid page data", async () => {
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    const payload = await request();
    await rejects(() => save({ ...payload, page: { ...payload.page, headline: "x".repeat(81) } }), "INVALID_CONTACT_PAYLOAD");
  });
});
