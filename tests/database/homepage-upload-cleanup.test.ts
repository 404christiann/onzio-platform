import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

async function authenticate(client: Client, userId: string = USER_IDS.ownerAal2) {
  await client.query("begin");
  const second = Number((await client.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await client.query("set local role authenticated");
}

it("retires only the actor's unreferenced Homepage upload and waits for a concurrent save", async () => {
  assertSafeTestEnvironment();
  const setup = new Client(config), saver = new Client(config), cleaner = new Client(config);
  await Promise.all([setup.connect(), saver.connect(), cleaner.connect()]);
  const assetId = randomUUID();
  const storagePath = `${CLUB_IDS.alpha}/homepage/${assetId}.webp`;
  const rowId = randomUUID();
  try {
    await setup.query(`insert into onzio.media_assets
      (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,created_by)
      values($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,100,100,$4,'published',now(),$5)`,
    [assetId, CLUB_IDS.alpha, storagePath, "b".repeat(64), USER_IDS.ownerAal2]);

    await authenticate(cleaner, USER_IDS.unaffiliated);
    await expect(cleaner.query("select onzio.retire_unreferenced_homepage_upload($1,$2) as data", [CLUB_IDS.alpha, assetId]))
      .rejects.toThrow("NOT_AUTHORIZED");
    await cleaner.query("rollback");

    await authenticate(saver);
    await saver.query("insert into onzio.homepage_slideshow_photos(id,club_id,media_asset_id,url,alt,sort_order) values($1,$2,$3,$4,'Linked by another tab',0)",
      [rowId, CLUB_IDS.alpha, assetId, storagePath]);
    await authenticate(cleaner);
    await cleaner.query("set local statement_timeout='5s'");
    const cleanerPid = (await cleaner.query("select pg_backend_pid() as pid")).rows[0].pid;
    let settled = false;
    const cleanup = cleaner.query("select onzio.retire_unreferenced_homepage_upload($1,$2) as data", [CLUB_IDS.alpha, assetId])
      .then(result => { settled = true; return result.rows[0].data; });
    await expect.poll(async () => (await setup.query("select wait_event from pg_stat_activity where pid=$1", [cleanerPid])).rows[0]?.wait_event).toBe("advisory");
    expect(settled).toBe(false);
    await saver.query("commit");
    expect(await cleanup).toEqual({ status: "referenced" });
    await cleaner.query("commit");
    expect((await setup.query("select status from onzio.media_assets where id=$1", [assetId])).rows[0].status).toBe("published");

    await setup.query("delete from onzio.homepage_slideshow_photos where id=$1", [rowId]);
    await authenticate(cleaner);
    const retired = (await cleaner.query("select onzio.retire_unreferenced_homepage_upload($1,$2) as data", [CLUB_IDS.alpha, assetId])).rows[0].data;
    expect(retired).toEqual({ status: "retired", storagePath });
    await cleaner.query("commit");
    expect((await setup.query("select status from onzio.media_assets where id=$1", [assetId])).rows[0].status).toBe("orphaned");
  } finally {
    await Promise.allSettled([saver.query("rollback"), cleaner.query("rollback")]);
    await setup.query("delete from onzio.homepage_slideshow_photos where id=$1", [rowId]);
    await setup.query("delete from onzio.audit_events where resource_id=$1", [assetId]);
    await setup.query("delete from onzio.media_assets where id=$1", [assetId]);
    await Promise.all([setup.end(), saver.end(), cleaner.end()]);
  }
});
