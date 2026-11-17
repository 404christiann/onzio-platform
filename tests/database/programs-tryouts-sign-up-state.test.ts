import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-RE-12b (20261110180000_programs_tryouts_sign_up_state.sql): a sign-up
// form takes sign-ups only while a program or tryout using it does; a tryout
// closes the day after its date in club time; at most 500 tryouts per club on
// every write path; the reimagined page's RPCs. Every test runs in one
// transaction that is rolled back.

let db: Client;
const clubId = CLUB_IDS.alpha;

async function asOwner(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}
async function asPostgres() {
  await db.query("reset role");
}
async function one<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T> {
  return (await db.query(text, values)).rows[0] as T;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

/** An open-shaped form with one price option, owned by Alpha. Inserted as postgres. */
async function form(slug = `re12-${randomUUID().slice(0, 8)}`) {
  const id = randomUUID();
  await db.query("insert into onzio.registration_forms(id,club_id,slug,title,status) values($1,$2,$3,'RE-12 form','draft')", [id, clubId, slug]);
  const price = randomUUID();
  await db.query("insert into onzio.registration_price_options(id,club_id,form_id,label,amount_cents) values($1,$2,$3,'Player',2500)", [price, clubId, id]);
  return { id, price };
}
async function program(overrides: Record<string, unknown> = {}) {
  const values = { slug: `re12-${randomUUID().slice(0, 8)}`, display_title: "RE-12 camp", status: "active", ...overrides };
  const keys = Object.keys(values);
  return one<{ id: string; stamp: string; slug: string; sort_order: number }>(
    `insert into onzio.programs(club_id,${keys.join(",")}) values($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) returning *, updated_at::text as stamp`,
    [clubId, ...Object.values(values)],
  );
}
async function tryout(overrides: Record<string, unknown> = {}) {
  const values = { headline: "RE-12 tryout", status: "open", ...overrides };
  const keys = Object.keys(values);
  return one<{ id: string; stamp: string; sort_order: number }>(
    `insert into onzio.tryouts(club_id,${keys.join(",")}) values($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) returning *, updated_at::text as stamp`,
    [clubId, ...Object.values(values)],
  );
}
async function accepting(formId: string) {
  return (await one<{ ok: boolean }>("select onzio_private.registration_form_accepting($1,$2) as ok", [clubId, formId])).ok;
}
async function clubToday() {
  return (await one<{ d: string }>("select onzio_private.club_today($1)::text as d", [clubId])).d;
}
async function daysFromToday(days: number) {
  return (await one<{ d: string }>("select (onzio_private.club_today($1) + $2::int)::text as d", [clubId, days])).d;
}
async function pendingSignUp(formId: string, priceId: string, status = "pending") {
  await db.query(
    `insert into onzio.registrations(club_id,form_id,status,answers,registrant_email,participant_type,price_option_id,
       price_label,amount_cents,waiver_accepted_at,status_token_hash,paid_at)
     values($1,$2,$3,'{}'::jsonb,'parent@example.test','adult',$4,'Player',2500,now(),$5,
       case when $3 = 'paid' then now() end)`,
    [clubId, formId, status, priceId, randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64)],
  );
}
async function rpc(name: string, request: Record<string, unknown>, target: string = clubId) {
  return (await one<{ data: Record<string, unknown> }>(`select onzio.${name}($1,$2::jsonb) as data`, [target, JSON.stringify(request)])).data;
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("new columns", () => {
  it("start at the values that keep today's behavior, without rewriting rows", async () => {
    const t = await tryout();
    const p = await program();
    expect(await one("select hidden,sign_up_by_contact,stays_open_after_date from onzio.tryouts where id=$1", [t.id]))
      .toEqual({ hidden: false, sign_up_by_contact: false, stays_open_after_date: false });
    expect(await one("select sign_ups_closed,sign_up_by_contact from onzio.programs where id=$1", [p.id]))
      .toEqual({ sign_ups_closed: false, sign_up_by_contact: false });
  });

  it("clears a reopen when the date changes, and keeps it when something else does", async () => {
    const t = await tryout({ event_date: "2026-03-07", stays_open_after_date: true });
    await db.query("update onzio.tryouts set location='Riverside' where id=$1", [t.id]);
    expect((await one("select stays_open_after_date as v from onzio.tryouts where id=$1", [t.id])).v).toBe(true);
    await db.query("update onzio.tryouts set event_date='2026-03-14' where id=$1", [t.id]);
    expect((await one("select stays_open_after_date as v from onzio.tryouts where id=$1", [t.id])).v).toBe(false);
  });
});

describe("club_today", () => {
  it("reads the club's own time zone and falls back to Los Angeles for one Postgres doesn't know", async () => {
    await db.query("update onzio.clubs set time_zone='America/Chicago' where id=$1", [clubId]);
    const chicago = (await one<{ d: string }>("select (now() at time zone 'America/Chicago')::date::text as d")).d;
    expect(await clubToday()).toBe(chicago);
    await db.query("update onzio.clubs set time_zone='Mars/Phobos' where id=$1", [clubId]);
    const la = (await one<{ d: string }>("select (now() at time zone 'America/Los_Angeles')::date::text as d")).d;
    expect(await clubToday()).toBe(la);
  });
});

describe("a sign-up form takes sign-ups only while something using it does", () => {
  it("leaves a form nobody uses alone", async () => {
    const f = await form();
    expect(await accepting(f.id)).toBe(true);
  });

  it("follows a program: shown takes sign-ups, hidden or closed does not", async () => {
    const f = await form();
    const p = await program({ registration_form_id: f.id });
    expect(await accepting(f.id)).toBe(true);
    await db.query("update onzio.programs set status='hidden' where id=$1", [p.id]);
    expect(await accepting(f.id)).toBe(false);
    await db.query("update onzio.programs set status='active', sign_ups_closed=true where id=$1", [p.id]);
    expect(await accepting(f.id)).toBe(false);
  });

  it("follows a tryout: open on its date, closed the day after, open again once reopened", async () => {
    const f = await form();
    const t = await tryout({ registration_form_id: f.id, event_date: await clubToday() });
    expect(await accepting(f.id)).toBe(true);
    await db.query("update onzio.tryouts set event_date=$2 where id=$1", [t.id, await daysFromToday(-1)]);
    expect(await accepting(f.id)).toBe(false);
    await db.query("update onzio.tryouts set stays_open_after_date=true where id=$1", [t.id]);
    expect(await accepting(f.id)).toBe(true);
  });

  it("refuses for a tryout its owner closed or hid, even with no date", async () => {
    const f = await form();
    const t = await tryout({ registration_form_id: f.id, status: "closed" });
    expect(await accepting(f.id)).toBe(false);
    await db.query("update onzio.tryouts set status='upcoming', hidden=true where id=$1", [t.id]);
    expect(await accepting(f.id)).toBe(false);
    await db.query("update onzio.tryouts set hidden=false where id=$1", [t.id]);
    expect(await accepting(f.id)).toBe(true);
  });

  it("takes sign-ups while any one of several users still does", async () => {
    const f = await form();
    await program({ registration_form_id: f.id, status: "hidden" });
    await tryout({ registration_form_id: f.id });
    expect(await accepting(f.id)).toBe(true);
  });

  it("refuses a new pending sign-up at the database, and still records a paid one an import writes", async () => {
    const f = await form();
    await program({ registration_form_id: f.id, status: "hidden" });
    await rejects(() => pendingSignUp(f.id, f.price), "REGISTRATION_FORM_CLOSED");
    await pendingSignUp(f.id, f.price, "paid");
    expect((await one("select count(*)::int as n from onzio.registrations where form_id=$1", [f.id])).n).toBe(1);
  });

  it("is callable by the service role only", async () => {
    const f = await form();
    await asOwner();
    await rejects(() => db.query("select onzio.registration_form_accepting($1,$2)", [clubId, f.id]), "permission denied");
    await db.query("reset role");
    await db.query("set local role service_role");
    expect((await one("select onzio.registration_form_accepting($1,$2) as ok", [clubId, f.id])).ok).toBe(true);
  });
});

describe("at most 500 tryouts per club", () => {
  it("refuses the 501st on a direct write and still lets every existing row be saved", async () => {
    const existing = (await one<{ n: number }>("select count(*)::int as n from onzio.tryouts where club_id=$1", [clubId])).n;
    await db.query(
      "insert into onzio.tryouts(club_id,headline,sort_order) select $1,'Bulk '||g,1000+g from generate_series(1,$2) g",
      [clubId, 500 - existing],
    );
    await rejects(() => tryout({ headline: "One too many" }), "TRYOUT_LIMIT");
    await db.query(`insert into onzio.tryouts(id,club_id,headline) select id,club_id,headline||'!' from onzio.tryouts where club_id=$1
      on conflict(id) do update set headline=excluded.headline`, [clubId]);
    expect((await one("select count(*)::int as n from onzio.tryouts where club_id=$1", [clubId])).n).toBe(500);
    // Another club is counted on its own.
    await db.query("insert into onzio.tryouts(club_id,headline) values($1,'Bravo tryout')", [CLUB_IDS.bravo]);
  });
});

describe("save_tryout", () => {
  const blank = {
    headline: "Spring tryouts", event_date: "2027-03-07", location: "Riverside Fields", cost_text: "",
    cta_label: "", registration_href: "", registration_form_id: null, sign_up_by_contact: false,
    closed: false, hidden: false, stays_open_after_date: false,
  };

  it("adds one after the others, then changes it, keeping the columns the new page never shows", async () => {
    const f = await form();
    await asOwner();
    const added = (await rpc("save_tryout", { operationId: randomUUID(), id: null, expectedUpdatedAt: null, tryout: { ...blank, registration_form_id: f.id } })).tryout as Record<string, unknown>;
    expect(added).toMatchObject({ headline: "Spring tryouts", status: "open", registration_form_id: f.id, hidden: false });
    await asPostgres();
    await db.query("update onzio.tryouts set intro='Kept', closed_message='Kept too' where id=$1", [added.id]);
    const baseline = await one<{ stamp: string }>("select updated_at::text as stamp from onzio.tryouts where id=$1", [added.id]);
    await asOwner();
    const changed = (await rpc("save_tryout", {
      operationId: randomUUID(), id: added.id, expectedUpdatedAt: baseline.stamp,
      tryout: { ...blank, closed: true, sign_up_by_contact: true, cost_text: "$25 at the field" },
    })).tryout as Record<string, unknown>;
    expect(changed).toMatchObject({ status: "closed", sign_up_by_contact: true, registration_form_id: null, intro: "Kept", closed_message: "Kept too" });
  });

  it("reopens a closed tryout as open, and refuses a stale save", async () => {
    await asPostgres();
    const t = await tryout({ status: "closed" });
    await asOwner();
    const reopened = (await rpc("save_tryout", { operationId: randomUUID(), id: t.id, expectedUpdatedAt: t.stamp, tryout: blank })).tryout as Record<string, unknown>;
    expect(reopened.status).toBe("open");
    await rejects(() => rpc("save_tryout", { operationId: randomUUID(), id: t.id, expectedUpdatedAt: t.stamp, tryout: blank }), "CONTENT_CHANGED");
  });

  it("returns the same answer for a retried request and refuses a reused id with other content", async () => {
    await asOwner();
    const request = { operationId: randomUUID(), id: null, expectedUpdatedAt: null, tryout: blank };
    const first = await rpc("save_tryout", request);
    expect(await rpc("save_tryout", request)).toEqual(first);
    await asPostgres();
    expect((await one("select count(*)::int as n from onzio.tryouts where headline='Spring tryouts' and club_id=$1", [clubId])).n).toBe(1);
    await asOwner();
    await rejects(() => rpc("save_tryout", { ...request, tryout: { ...blank, headline: "Other" } }), "OPERATION_REUSED");
  });

  it("refuses a form another program or tryout already uses, a bad link, a blank name, and another club", async () => {
    const f = await form();
    await program({ registration_form_id: f.id });
    await asOwner();
    const add = (tryout: Record<string, unknown>) => () => rpc("save_tryout", { operationId: randomUUID(), id: null, expectedUpdatedAt: null, tryout: { ...blank, ...tryout } });
    await rejects(add({ registration_form_id: f.id }), "SIGN_UP_FORM_IN_USE");
    await rejects(add({ registration_href: "javascript:alert(1)", cta_label: "Go" }), "INVALID_SIGN_UP_PAYLOAD");
    await rejects(add({ headline: "   " }), "INVALID_SIGN_UP_PAYLOAD");
    await rejects(() => rpc("save_tryout", { operationId: randomUUID(), id: null, expectedUpdatedAt: null, tryout: blank }, CLUB_IDS.bravo), "NOT_AUTHORIZED");
  });
});

describe("save_program_sign_up", () => {
  it("sets the way, closes, hides and shows a program, and nothing else", async () => {
    const f = await form();
    const p = await program({ summary: "Kept summary" });
    await asOwner();
    let saved = (await rpc("save_program_sign_up", {
      operationId: randomUUID(), id: p.id, expectedUpdatedAt: p.stamp,
      program: { external_cta_label: "", external_cta_href: "", registration_form_id: f.id, sign_up_by_contact: false, sign_ups_closed: false, hidden: true },
    })).program as Record<string, unknown>;
    expect(saved).toMatchObject({ status: "hidden", registration_form_id: f.id, summary: "Kept summary" });
    saved = (await rpc("save_program_sign_up", {
      operationId: randomUUID(), id: p.id, expectedUpdatedAt: saved.updated_at,
      program: { external_cta_label: "Sign up", external_cta_href: "https://example.test", registration_form_id: null, sign_up_by_contact: false, sign_ups_closed: true, hidden: false },
    })).program as Record<string, unknown>;
    expect(saved).toMatchObject({ status: "active", sign_ups_closed: true, registration_form_id: null, external_cta_href: "https://example.test" });
  });
});

describe("Make a copy", () => {
  it("copies a program after the original, hidden, with no sign-up way and its photos shared", async () => {
    const f = await form();
    const p = await program({ slug: "summer-camp", display_title: "Summer Camp", registration_form_id: f.id, external_cta_label: "Go", external_cta_href: "https://example.test", sign_up_by_contact: true });
    await db.query("insert into onzio.program_media(club_id,program_id,url,alt,sort_order) values($1,$2,'/one.webp','One',0)", [clubId, p.id]);
    await asOwner();
    const copy = (await rpc("copy_program", { operationId: randomUUID(), id: p.id })).program as Record<string, unknown>;
    expect(copy).toMatchObject({
      slug: "summer-camp-copy", display_title: "Summer Camp (copy)", status: "hidden", registration_form_id: null,
      external_cta_href: "", sign_up_by_contact: false, sign_ups_closed: false, sort_order: p.sort_order + 1,
    });
    const second = (await rpc("copy_program", { operationId: randomUUID(), id: copy.id })).program as Record<string, unknown>;
    expect(second.slug).toBe("summer-camp-copy-2");
    await asPostgres();
    expect((await one("select count(*)::int as n from onzio.program_media where program_id=$1 and url='/one.webp'", [copy.id])).n).toBe(1);
  });

  it("copies a tryout after the original, hidden, without its date or form", async () => {
    const f = await form();
    const t = await tryout({ headline: "Fall tryouts", event_date: "2026-10-04", location: "Lincoln Park", registration_form_id: f.id, cta_label: "Go", registration_href: "https://example.test" });
    await asOwner();
    const copy = (await rpc("copy_tryout", { operationId: randomUUID(), id: t.id })).tryout as Record<string, unknown>;
    expect(copy).toMatchObject({
      headline: "Fall tryouts (copy)", event_date: null, location: "Lincoln Park", registration_form_id: null,
      registration_href: "", hidden: true, status: "open", sort_order: t.sort_order + 1,
    });
  });
});

describe("delete_tryout", () => {
  it("deletes one tryout and leaves its form", async () => {
    const f = await form();
    const t = await tryout({ registration_form_id: f.id });
    await asOwner();
    const result = await rpc("delete_tryout", { operationId: randomUUID(), id: t.id, expectedUpdatedAt: t.stamp });
    expect(result).toMatchObject({ deletedId: t.id, retiredMediaAssetIds: [] });
    await asPostgres();
    expect((await one("select count(*)::int as n from onzio.tryouts where id=$1", [t.id])).n).toBe(0);
    expect((await one("select count(*)::int as n from onzio.registration_forms where id=$1", [f.id])).n).toBe(1);
  });
});
