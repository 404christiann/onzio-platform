import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

it("serializes independent authenticated saves and rejects the losing stale baseline", async () => {
  assertSafeTestEnvironment();
  const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
  const setup = new Client(config), first = new Client(config), second = new Client(config);
  const clubId = randomUUID();
  await Promise.all([setup.connect(), first.connect(), second.connect()]);
  try {
    await setup.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Concurrent save test','test','active','live')", [clubId, `homepage-${clubId}`]);
    await setup.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [clubId, USER_IDS.ownerAal2]);
    for (const client of [first, second]) {
      await client.query("begin");
      await client.query("set local statement_timeout='5s'");
      const transactionSecond = Number((await client.query(
        "select floor(extract(epoch from now()))::bigint as second",
      )).rows[0].second);
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
        sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: transactionSecond }],
      })]);
      await client.query("set local role authenticated");
    }
    const baseline = (await first.query("select onzio.load_homepage($1) as data", [clubId])).rows[0].data;
    const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0].pid;
    const request = (intro: string) => JSON.stringify({ operationId: randomUUID(), expectedRevision: baseline.revision, designRevision: baseline.designRevision, sections: { hero: { intro } } });
    const saved = await first.query("select onzio.save_homepage($1,$2) as data", [clubId, request("Winning save")]);
    let settled = false;
    const competing = second.query("select onzio.save_homepage($1,$2) as data", [clubId, request("Stale competing save")]).then(
      result => { settled = true; return { result, error: null }; },
      error => { settled = true; return { result: null, error }; },
    );
    // Observe PostgreSQL waiting on the actual transaction lock, without a
    // timing-only sleep assertion or mocks of transaction behavior.
    await expect.poll(async () => (await setup.query("select wait_event from pg_stat_activity where pid=$1", [secondPid])).rows[0]?.wait_event).toBe("advisory");
    expect(settled).toBe(false);
    await first.query("commit");
    const lost = await competing;
    expect(lost.error?.message).toBe("CONTENT_CHANGED");
    // Business conflicts must not use serialization_failure (40001): the
    // PostgREST transaction wrapper retries it instead of returning to users.
    expect(lost.error?.code).toBe("PT409");
    await second.query("rollback");
    const content = await setup.query("select intro from onzio.homepage_hero_content where club_id=$1", [clubId]);
    expect(content.rows).toEqual([{ intro: "Winning save" }]);
    const receipts = await setup.query("select response->>'revision' as revision from onzio_private.homepage_save_receipts where club_id=$1", [clubId]);
    expect(receipts.rows).toEqual([{ revision: saved.rows[0].data.revision }]);
    const { client } = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
    const httpConflict = await client.rpc("save_homepage", { p_club_id: clubId, p_request: JSON.parse(request("Stale HTTP save")) })
      .abortSignal(AbortSignal.timeout(3000));
    expect(httpConflict.status).toBe(409);
    expect(httpConflict.error).toMatchObject({ code: "PT409", message: "CONTENT_CHANGED" });
  } finally {
    await Promise.all([first.query("rollback"), second.query("rollback")]);
    for (const table of ["homepage_hero_content", "club_members", "audit_events"]) await setup.query(`delete from onzio.${table} where club_id=$1`, [clubId]);
    await setup.query("delete from onzio.clubs where id=$1", [clubId]);
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
});
