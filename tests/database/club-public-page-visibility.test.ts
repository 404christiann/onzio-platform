import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";

// RC-PAGE-VISIBILITY: onzio.clubs.public_page_visibility and onzio.set_public_page_visibility.
// Every test runs in one transaction that is rolled back, so nothing is left in the shared database.

const alpha = CLUB_IDS.alpha;
const bravo = CLUB_IDS.bravo;
const BRAVO_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7"; // admin of Bravo only
let db: Client;

type Caller = { userId: string; stale?: boolean } | "anon";

async function actor(caller: Caller = { userId: USER_IDS.ownerAal2 }) {
  await db.query("reset role");
  if (caller === "anon") {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: "anon" })]);
    await db.query("set local role anon");
    return;
  }
  const now = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  const timestamp = caller.stale ? now - 31 * 24 * 60 * 60 : now;
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: caller.userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] }),
  ]);
  await db.query("set local role authenticated");
}

async function setVisibility(club: string, page: string | null, visible: boolean | null) {
  return (await db.query("select onzio.set_public_page_visibility($1,$2,$3) as visibility", [club, page, visible])).rows[0].visibility;
}

async function stored(club: string = alpha) {
  await db.query("reset role");
  return (await db.query("select public_page_visibility as visibility from onzio.clubs where id=$1", [club])).rows[0].visibility;
}

async function rejects(action: () => Promise<unknown>, expected: { code: string; message: string | RegExp }) {
  await db.query("savepoint expected_failure");
  try {
    await expect(action()).rejects.toMatchObject({ code: expected.code, message: expected.message instanceof RegExp ? expect.stringMatching(expected.message) : expected.message });
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
}

// Publishes a design of the given template version for a club, as the tickets and Robinson tests do.
// Presentation documents are immutable, so each call adds a newer version and points the club at it.
async function design(club: string, template: { id: string; version: number }) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(
    "insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,$4,$5,$6,$7)",
    [id, club, template.id, template.version, JSON.stringify({ schemaVersion: 1, template, navigation: { groups: [{ routes: ["home", "schedule"] }] } }), "a".repeat(64), USER_IDS.ownerAal2],
  );
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [club, id, USER_IDS.ownerAal2]);
}

const NOT_AUTHORIZED = { code: "42501", message: "NOT_AUTHORIZED" };
const UNAVAILABLE = { code: "22023", message: "PAGE_UNAVAILABLE" };
const INVALID = { code: "22023", message: "INVALID_PUBLIC_PAGE_VISIBILITY" };

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  // Start every test from a known state, whatever another suite left on the shared Alpha club.
  await db.query("update onzio.clubs set public_page_visibility='{}'::jsonb where id in ($1,$2)", [alpha, bravo]);
  // Both clubs publish the cinematic@2 design; the tests below change that where they need to.
  await design(alpha, { id: "cinematic", version: 2 });
  await design(bravo, { id: "cinematic", version: 2 });
});
afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("public_page_visibility column", () => {
  it("defaults to an empty object, so a club with no switch set shows every page", async () => {
    const column = (await db.query("select column_default, is_nullable, data_type from information_schema.columns where table_schema='onzio' and table_name='clubs' and column_name='public_page_visibility'")).rows[0];
    expect(column).toEqual({ column_default: "'{}'::jsonb", is_nullable: "NO", data_type: "jsonb" });
    const id = randomUUID();
    await db.query("insert into onzio.clubs(id,slug,name,lifecycle,public_access,tier) values($1,$2,'Visibility Default FC','onboarding','preview','starter')", [id, `pv-${id.slice(0, 8)}`]);
    expect(await stored(id)).toEqual({});
    const all = (await db.query("select count(*)::int as total, count(*) filter (where jsonb_typeof(public_page_visibility)='object')::int as objects from onzio.clubs")).rows[0];
    expect(all.objects).toBe(all.total);
  });

  it.each([
    [{}, true],
    [{ stadium: true }, true],
    [{ stadium: false, "chick-fil-a": true, "foothill-transit": false }, true],
    [[], false],
    [null, false],
    ["stadium", false],
    [1, false],
    [{ shop: true }, false],
    [{ robinson: false }, false],
    [{ Stadium: true }, false],
    [{ stadium: "true" }, false],
    [{ stadium: 0 }, false],
    [{ stadium: null }, false],
    [{ stadium: {} }, false],
    [{ stadium: [false] }, false],
    [{ stadium: false, shop: false }, false],
  ])("validates %j as %s", async (value, valid) => {
    const result = (await db.query("select onzio_private.is_public_page_visibility($1::jsonb) as valid", [JSON.stringify(value)])).rows[0].valid;
    expect(result).toBe(valid);
  });

  it("treats SQL null as invalid", async () => {
    expect((await db.query("select onzio_private.is_public_page_visibility(null) as valid")).rows[0].valid).toBe(false);
  });

  it("rejects a direct write with a non-boolean value, an unknown key or a non-object", async () => {
    await db.query("reset role");
    for (const bad of ['{"stadium":"false"}', '{"stadium":null}', '{"chick-fil-a":0}', '{"shop":false}', '{"robinson":true}', "[]", "null", '"stadium"', "7"]) {
      await rejects(
        () => db.query("update onzio.clubs set public_page_visibility=$1::jsonb where id=$2", [bad, alpha]),
        { code: "23514", message: /clubs_public_page_visibility_shape/ },
      );
    }
    expect(await stored()).toEqual({});
    await db.query("update onzio.clubs set public_page_visibility='{\"stadium\":false}'::jsonb where id=$1", [alpha]);
    expect(await stored()).toEqual({ stadium: false });
  });

  it("is readable by tenant resolution as anon and as a signed-in non-member", async () => {
    await db.query("update onzio.clubs set public_page_visibility='{\"stadium\":false}'::jsonb where id=$1", [alpha]);
    for (const caller of ["anon", { userId: USER_IDS.unaffiliated }] as Caller[]) {
      await actor(caller);
      const read = (await db.query("select public_page_visibility as visibility from onzio.clubs where id=$1", [alpha])).rows;
      expect(read).toEqual([{ visibility: { stadium: false } }]);
    }
  });

  it("on a club that is not live yet, is hidden from anon but readable by its own signed-in owner (the preview read)", async () => {
    await db.query("update onzio.clubs set lifecycle='onboarding', public_access='preview', public_page_visibility='{\"stadium\":false}'::jsonb where id=$1", [alpha]);
    await actor("anon");
    expect((await db.query("select public_page_visibility from onzio.clubs where id=$1", [alpha])).rows).toEqual([]);
    await actor({ userId: USER_IDS.ownerAal2 });
    expect((await db.query("select public_page_visibility as visibility from onzio.clubs where id=$1", [alpha])).rows).toEqual([{ visibility: { stadium: false } }]);
  });

  it("cannot be written by a club owner, an admin or anon with a direct update", async () => {
    for (const caller of [{ userId: USER_IDS.ownerAal2 }, { userId: USER_IDS.adminAal2 }, "anon"] as Caller[]) {
      await actor(caller);
      await rejects(
        () => db.query("update onzio.clubs set public_page_visibility='{\"stadium\":false}'::jsonb where id=$1", [alpha]),
        { code: "42501", message: "permission denied for table clubs" },
      );
    }
    expect(await stored()).toEqual({});
  });
});

describe("onzio.set_public_page_visibility", () => {
  it("lets an owner hide a page, then show it again, and returns the whole map each time", async () => {
    await actor({ userId: USER_IDS.ownerAal2 });
    expect(await setVisibility(alpha, "stadium", false)).toEqual({ stadium: false });
    expect(await stored()).toEqual({ stadium: false });
    expect(await setVisibility(alpha, "stadium", true)).toEqual({ stadium: true });
    expect(await stored()).toEqual({ stadium: true });
  });

  it("keeps the other pages' switches when one changes", async () => {
    await actor({ userId: USER_IDS.ownerAal2 });
    await setVisibility(alpha, "stadium", false);
    await setVisibility(alpha, "chick-fil-a", false);
    expect(await setVisibility(alpha, "foothill-transit", true)).toEqual({ stadium: false, "chick-fil-a": false, "foothill-transit": true });
    expect(await setVisibility(alpha, "stadium", true)).toEqual({ stadium: true, "chick-fil-a": false, "foothill-transit": true });
    expect(await setVisibility(alpha, "stadium", true)).toEqual({ stadium: true, "chick-fil-a": false, "foothill-transit": true });
  });

  it("lets an admin set it", async () => {
    await actor({ userId: USER_IDS.adminAal2 });
    expect(await setVisibility(alpha, "chick-fil-a", false)).toEqual({ "chick-fil-a": false });
    expect(await stored()).toEqual({ "chick-fil-a": false });
  });

  it("lets a member of two clubs change only the club it names", async () => {
    await actor({ userId: USER_IDS.multiClub });
    expect(await setVisibility(alpha, "stadium", false)).toEqual({ stadium: false });
    expect(await stored(bravo)).toEqual({});
    await actor({ userId: USER_IDS.multiClub });
    expect(await setVisibility(bravo, "foothill-transit", false)).toEqual({ "foothill-transit": false });
    expect(await stored(alpha)).toEqual({ stadium: false });
    expect(await stored(bravo)).toEqual({ "foothill-transit": false });
  });

  it("records who changed it, what it was and what it became", async () => {
    await actor({ userId: USER_IDS.adminAal2 });
    await setVisibility(alpha, "stadium", false);
    await setVisibility(alpha, "stadium", true);
    await db.query("reset role");
    const rows = (await db.query("select actor_user_id, actor_type, resource_type, resource_id, payload from onzio.audit_events where club_id=$1 and operation='public_page_visibility_set' and created_at=now() order by id", [alpha])).rows;
    expect(rows).toEqual([
      { actor_user_id: USER_IDS.adminAal2, actor_type: "user", resource_type: "club", resource_id: alpha, payload: { page: "stadium", previous_value: null, new_value: false } },
      { actor_user_id: USER_IDS.adminAal2, actor_type: "user", resource_type: "club", resource_id: alpha, payload: { page: "stadium", previous_value: false, new_value: true } },
    ]);
  });

  it.each(["shop", "robinson", "Stadium", "stadium ", "", "__proto__", "club_id"])("rejects the unknown page key %j", async key => {
    await actor({ userId: USER_IDS.ownerAal2 });
    await rejects(() => setVisibility(alpha, key, false), INVALID);
    expect(await stored()).toEqual({});
  });

  it("rejects a null key or a null value", async () => {
    await actor({ userId: USER_IDS.ownerAal2 });
    await rejects(() => setVisibility(alpha, null, false), INVALID);
    await rejects(() => setVisibility(alpha, "stadium", null), INVALID);
    expect(await stored()).toEqual({});
  });

  it("denies anon, with no change", async () => {
    await actor("anon");
    await rejects(() => setVisibility(alpha, "stadium", false), { code: "42501", message: /permission denied for function/ });
    expect(await stored()).toEqual({});
  });

  it("denies a signed-in caller who is not a member of any club", async () => {
    await actor({ userId: USER_IDS.unaffiliated });
    await rejects(() => setVisibility(alpha, "stadium", false), NOT_AUTHORIZED);
    expect(await stored()).toEqual({});
  });

  it("denies a member of another club, with no change to either club", async () => {
    await actor({ userId: BRAVO_ADMIN });
    await rejects(() => setVisibility(alpha, "stadium", false), NOT_AUTHORIZED);
    expect(await stored(alpha)).toEqual({});
    expect(await stored(bravo)).toEqual({});
  });

  it("denies an admin whose membership was removed", async () => {
    await actor({ userId: USER_IDS.removed });
    await rejects(() => setVisibility(alpha, "stadium", false), NOT_AUTHORIZED);
    expect(await stored()).toEqual({});
  });

  it("denies an owner whose club session is older than 30 days", async () => {
    await actor({ userId: USER_IDS.ownerAal2, stale: true });
    await rejects(() => setVisibility(alpha, "stadium", false), NOT_AUTHORIZED);
    expect(await stored()).toEqual({});
  });

  it("denies an owner of an archived club", async () => {
    await db.query("reset role");
    await db.query("update onzio.clubs set lifecycle='archived', public_access='suspended', archived_at=now() where id=$1", [alpha]);
    await actor({ userId: USER_IDS.ownerAal2 });
    await rejects(() => setVisibility(alpha, "stadium", false), NOT_AUTHORIZED);
    expect(await stored()).toEqual({});
  });

  it.each([
    ["cinematic@1", { id: "cinematic", version: 1 }],
    ["academy@1", { id: "academy", version: 1 }],
  ])("answers PAGE_UNAVAILABLE for a club on %s, with no change", async (_label, template) => {
    await design(alpha, template);
    await actor({ userId: USER_IDS.ownerAal2 });
    await rejects(() => setVisibility(alpha, "stadium", false), UNAVAILABLE);
    expect(await stored()).toEqual({});
  });

  it("answers PAGE_UNAVAILABLE for a club with no published design", async () => {
    const id = randomUUID();
    await db.query("reset role");
    await db.query("insert into onzio.clubs(id,slug,name,lifecycle,public_access,tier) values($1,$2,'No Design FC','onboarding','preview','starter')", [id, `pv-${id.slice(0, 8)}`]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
    await actor({ userId: USER_IDS.ownerAal2 });
    await rejects(() => setVisibility(id, "stadium", false), UNAVAILABLE);
    expect(await stored(id)).toEqual({});
  });

  it("checks the caller before the design, so an outsider learns nothing about a club's template", async () => {
    await design(alpha, { id: "academy", version: 1 });
    await actor({ userId: BRAVO_ADMIN });
    await rejects(() => setVisibility(alpha, "stadium", false), NOT_AUTHORIZED);
  });

  it("checks the caller before the key, so an outsider learns nothing about valid keys", async () => {
    await actor({ userId: USER_IDS.unaffiliated });
    await rejects(() => setVisibility(alpha, "shop", false), NOT_AUTHORIZED);
  });

  it("is not executable by anon and is not exposed beyond authenticated", async () => {
    const grants = (await db.query(
      `select p.oid::regprocedure::text as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon_can,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can,
              has_function_privilege('public', p.oid, 'execute') as public_can
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname = 'onzio' and p.proname = 'set_public_page_visibility')
          or (n.nspname = 'onzio_private' and p.proname in ('set_public_page_visibility', 'is_public_page_visibility'))
       `,
    )).rows.sort((a, b) => (a.fn < b.fn ? -1 : a.fn > b.fn ? 1 : 0));
    expect(grants).toEqual([
      { fn: "onzio.set_public_page_visibility(uuid,text,boolean)", anon_can: false, authenticated_can: true, public_can: false },
      { fn: "onzio_private.is_public_page_visibility(jsonb)", anon_can: false, authenticated_can: true, public_can: false },
      { fn: "onzio_private.set_public_page_visibility(uuid,text,boolean)", anon_can: false, authenticated_can: true, public_can: false },
    ]);
  });
});
