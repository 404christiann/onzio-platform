import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-RE-01: the columns the reimagined admin reads. Additive, operator-only on
// onzio.clubs, and a member can read only their own display_name.

let db: Client;

async function asMember(userId: string) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}

async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("ADMIN-RE-01 club columns", () => {
  it("gives every club the classic admin, no flags and the default time zone", async () => {
    const rows = (await db.query(
      "select slug, admin_portal, admin_flags, time_zone, time_zone_set_at from onzio.clubs where slug in ('alpha','bravo') order by slug",
    )).rows;
    expect(rows).toEqual([
      { slug: "alpha", admin_portal: "classic", admin_flags: {}, time_zone: "America/Los_Angeles", time_zone_set_at: null },
      { slug: "bravo", admin_portal: "classic", admin_flags: {}, time_zone: "America/Los_Angeles", time_zone_set_at: null },
    ]);
  });

  it("accepts the values the admin will write", async () => {
    await db.query(
      `update onzio.clubs set admin_portal='reimagined', admin_flags='{"season":true}'::jsonb,
       time_zone='America/Argentina/Buenos_Aires', time_zone_set_at=now() where id=$1`,
      [CLUB_IDS.alpha],
    );
    for (const zone of ["UTC", "America/Chicago", "Etc/GMT+5", "America/Port-au-Prince"]) {
      await db.query("update onzio.clubs set time_zone=$2 where id=$1", [CLUB_IDS.alpha, zone]);
    }
  });

  it.each([
    ["admin_portal", "'beta'", "clubs_admin_portal_check"],
    ["admin_flags", "'[]'::jsonb", "clubs_admin_flags_object"],
    ["time_zone", "'Chicago time'", "clubs_time_zone_shape"],
    ["time_zone", "''", "clubs_time_zone_shape"],
    ["time_zone", `'America/${"A".repeat(70)}'`, "clubs_time_zone_shape"],
  ])("rejects a bad %s value (%s)", async (column, value, constraint) => {
    await rejects(() => db.query(`update onzio.clubs set ${column}=${value} where id=$1`, [CLUB_IDS.alpha]), constraint);
  });

  it("keeps the new club columns operator-only", async () => {
    await asMember(USER_IDS.ownerAal2);
    for (const assignment of ["admin_portal='reimagined'", "admin_flags='{}'::jsonb", "time_zone='UTC'", "time_zone_set_at=now()"]) {
      await rejects(() => db.query(`update onzio.clubs set ${assignment} where id=$1`, [CLUB_IDS.alpha]), "permission denied");
    }
    const read = (await db.query("select admin_portal, time_zone from onzio.clubs where id=$1", [CLUB_IDS.alpha])).rows;
    expect(read).toEqual([{ admin_portal: "classic", time_zone: "America/Los_Angeles" }]);
  });
});

describe("ADMIN-RE-01 member display names", () => {
  it("is optional and limited to 1-120 characters after trimming", async () => {
    const where = "where user_id=$1 and club_id=$2";
    const ids = [USER_IDS.ownerAal2, CLUB_IDS.alpha];
    await db.query(`update onzio.club_members set display_name=null ${where}`, ids);
    await db.query(`update onzio.club_members set display_name='Andrea' ${where}`, ids);
    await db.query(`update onzio.club_members set display_name=$3 ${where}`, [...ids, "A".repeat(120)]);
    await rejects(() => db.query(`update onzio.club_members set display_name=$3 ${where}`, [...ids, "A".repeat(121)]), "club_members_display_name_length");
    await rejects(() => db.query(`update onzio.club_members set display_name='   ' ${where}`, ids), "club_members_display_name_length");
  });

  it("lets a member read their own name, not anyone else's, and not write it directly", async () => {
    await db.query("update onzio.club_members set display_name='Andrea' where user_id=$1 and club_id=$2", [USER_IDS.ownerAal2, CLUB_IDS.alpha]);
    await db.query("update onzio.club_members set display_name='Marco' where user_id=$1 and club_id=$2", [USER_IDS.adminAal2, CLUB_IDS.alpha]);
    await asMember(USER_IDS.ownerAal2);
    const rows = (await db.query("select user_id, display_name from onzio.club_members where club_id=$1", [CLUB_IDS.alpha])).rows;
    expect(rows).toEqual([{ user_id: USER_IDS.ownerAal2, display_name: "Andrea" }]);
    await rejects(
      () => db.query("update onzio.club_members set display_name='Someone else' where user_id=$1", [USER_IDS.ownerAal2]),
      "permission denied",
    );
  });
});
