import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createLocalClients } from "../helpers/supabase";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

it("keeps shared FK and URL media, serializes direct links, and rejects relinks after retirement", async () => {
  assertSafeTestEnvironment();
  const setup = new Client(config), linker = new Client(config), cleaner = new Client(config);
  await Promise.all([setup.connect(), linker.connect(), cleaner.connect()]);
  const assetId = randomUUID(), programId = randomUUID();
  const path = `${CLUB_IDS.alpha}/homepage/${assetId}.webp`;
  const localUrl = `/storage/v1/object/public/onzio-media/${path}`;
  const retire = async () => (await cleaner.query(
    "select onzio.retire_unreferenced_media_asset($1,$2,$3) as data",
    [CLUB_IDS.alpha, assetId, USER_IDS.ownerAal2],
  )).rows[0].data;
  try {
    await setup.query(`insert into onzio.media_assets
      (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
      values($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,100,100,$4,'published',now())`,
    [assetId, CLUB_IDS.alpha, path, "c".repeat(64)]);
    await setup.query("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,$3,'Media retirement regression')",
      [programId, CLUB_IDS.alpha, `retire-${programId}`]);

    const fkRow = randomUUID();
    await setup.query("insert into onzio.program_media(id,club_id,program_id,url,media_asset_id) values($1,$2,$3,$4,$5)",
      [fkRow, CLUB_IDS.alpha, programId, localUrl, assetId]);
    await cleaner.query("begin");
    await cleaner.query("set local role service_role");
    expect(await retire()).toEqual({ status: "referenced" });
    await cleaner.query("rollback");
    const viaApi = await createLocalClients().service.rpc("retire_unreferenced_media_asset", {
      p_club_id: CLUB_IDS.alpha, p_asset_id: assetId, p_actor_id: USER_IDS.ownerAal2,
    });
    expect(viaApi.error).toBeNull();
    expect(viaApi.data).toEqual({ status: "referenced" });
    await setup.query("delete from onzio.program_media where id=$1", [fkRow]);

    const urlRow = randomUUID();
    await setup.query("insert into onzio.program_media(id,club_id,program_id,url) values($1,$2,$3,$4)",
      [urlRow, CLUB_IDS.alpha, programId, `https://media.example/storage/v1/object/public/onzio-media/${path}`]);
    expect(await retire()).toEqual({ status: "referenced" });
    await setup.query("delete from onzio.program_media where id=$1", [urlRow]);

    await linker.query("begin");
    const linkedRow = randomUUID();
    await linker.query("insert into onzio.program_media(id,club_id,program_id,url,media_asset_id) values($1,$2,$3,$4,$5)",
      [linkedRow, CLUB_IDS.alpha, programId, localUrl, assetId]);
    await cleaner.query("begin");
    await cleaner.query("set local statement_timeout='5s'");
    const pid = (await cleaner.query("select pg_backend_pid() as pid")).rows[0].pid;
    let settled = false;
    const cleanup = retire().then((result) => { settled = true; return result; });
    await expect.poll(async () => (await setup.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event)
      .toBeTruthy();
    expect(settled).toBe(false);
    await linker.query("commit");
    expect(await cleanup).toEqual({ status: "referenced" });
    await cleaner.query("commit");
    await setup.query("delete from onzio.program_media where id=$1", [linkedRow]);

    await linker.query("begin");
    const urlLinkedRow = randomUUID();
    await linker.query("insert into onzio.program_media(id,club_id,program_id,url) values($1,$2,$3,$4)",
      [urlLinkedRow, CLUB_IDS.alpha, programId, localUrl]);
    await cleaner.query("begin");
    await cleaner.query("set local statement_timeout='5s'");
    let urlSettled = false;
    const urlCleanup = retire().then((result) => { urlSettled = true; return result; });
    await expect.poll(async () => (await setup.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event)
      .toBeTruthy();
    expect(urlSettled).toBe(false);
    await linker.query("commit");
    expect(await urlCleanup).toEqual({ status: "referenced" });
    await cleaner.query("commit");
    await setup.query("delete from onzio.program_media where id=$1", [urlLinkedRow]);

    const retired = await retire();
    expect(retired).toEqual({ status: "retired", storagePath: path, idempotent: false });
    expect((await setup.query("select status from onzio.media_assets where id=$1", [assetId])).rows[0].status).toBe("orphaned");
    await expect(setup.query("insert into onzio.program_media(club_id,program_id,url,media_asset_id) values($1,$2,$3,$4)",
      [CLUB_IDS.alpha, programId, localUrl, assetId])).rejects.toThrow("MEDIA_NOT_PUBLISHED");
    await expect(setup.query("insert into onzio.program_media(club_id,program_id,url) values($1,$2,$3)",
      [CLUB_IDS.alpha, programId, localUrl])).rejects.toThrow("MEDIA_NOT_PUBLISHED");
    expect(await retire()).toEqual({ status: "retired", storagePath: path, idempotent: true });
  } finally {
    await Promise.allSettled([linker.query("rollback"), cleaner.query("rollback")]);
    await setup.query("delete from onzio.programs where id=$1", [programId]);
    await setup.query("delete from onzio.audit_events where resource_id=$1", [assetId]);
    await setup.query("delete from onzio.media_assets where id=$1", [assetId]);
    await Promise.all([setup.end(), linker.end(), cleaner.end()]);
  }
});

it("accepts the unsaved Homepage retry reason and denies browser execution of service retirement", async () => {
  assertSafeTestEnvironment();
  const db = new Client(config);
  await db.connect();
  const assetId = randomUUID(), path = `${CLUB_IDS.alpha}/homepage/${assetId}.webp`;
  try {
    await db.query("begin");
    await db.query("insert into onzio.media_cleanup_queue(club_id,storage_bucket,storage_path,reason) values($1,'onzio-media',$2,'unsaved-homepage-upload')",
      [CLUB_IDS.alpha, path]);
    expect((await db.query("select reason from onzio.media_cleanup_queue where storage_path=$1", [path])).rows[0].reason)
      .toBe("unsaved-homepage-upload");
    expect((await db.query("select has_function_privilege('authenticated','onzio.retire_unreferenced_media_asset(uuid,uuid,uuid)','execute') as permitted")).rows[0].permitted)
      .toBe(false);
  } finally {
    await db.query("rollback");
    await db.end();
  }
});

it("keeps Club Logo JSONB images and serializes concurrent card updates", async () => {
  assertSafeTestEnvironment();
  const setup = new Client(config), linker = new Client(config), cleaner = new Client(config);
  await Promise.all([setup.connect(), linker.connect(), cleaner.connect()]);
  const clubId = randomUUID(), assetId = randomUUID();
  const path = `${clubId}/homepage/${assetId}.webp`;
  const url = `https://media.example/storage/v1/object/public/onzio-media/${path}`;
  const retire = async () => (await cleaner.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data",
    [clubId, assetId, USER_IDS.ownerAal2])).rows[0].data;
  try {
    await setup.query("insert into onzio.clubs(id,slug,name) values($1,$2,'JSON media fixture')", [clubId, `media-json-${clubId}`]);
    await setup.query(`insert into onzio.media_assets
      (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
      values($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,100,100,$4,'published',now())`,
    [assetId, clubId, path, "d".repeat(64)]);
    await setup.query("insert into onzio.club_logo_page_content(club_id,features,color_cards) values($1,$2::jsonb,'[]'::jsonb)",
      [clubId, JSON.stringify([{ patch_url: url, icon_url: "" }])]);
    expect(await retire()).toEqual({ status: "referenced" });

    await setup.query("update onzio.club_logo_page_content set features='[]'::jsonb,color_cards=$2::jsonb where club_id=$1",
      [clubId, JSON.stringify([{ image_url: url }])]);
    expect(await retire()).toEqual({ status: "referenced" });
    await setup.query("update onzio.club_logo_page_content set color_cards='[]'::jsonb where club_id=$1", [clubId]);

    await linker.query("begin");
    await linker.query("update onzio.club_logo_page_content set features=$2::jsonb where club_id=$1",
      [clubId, JSON.stringify([{ icon_url: url }])]);
    await cleaner.query("begin");
    await cleaner.query("set local statement_timeout='5s'");
    const pid = (await cleaner.query("select pg_backend_pid() as pid")).rows[0].pid;
    let settled = false;
    const cleanup = retire().then((result) => { settled = true; return result; });
    await expect.poll(async () => (await setup.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event)
      .toBeTruthy();
    expect(settled).toBe(false);
    await linker.query("commit");
    expect(await cleanup).toEqual({ status: "referenced" });
    await cleaner.query("commit");
    await setup.query("update onzio.club_logo_page_content set features='[]'::jsonb where club_id=$1", [clubId]);

    await setup.query("insert into onzio.site_social_links(club_id,id,label,href,icon) values($1,'media-link','Media','/',$2)",
      [clubId, url]);
    expect(await retire()).toEqual({ status: "referenced" });
    await setup.query("delete from onzio.site_social_links where club_id=$1", [clubId]);

    expect(await retire()).toEqual({ status: "retired", storagePath: path, idempotent: false });
    await expect(setup.query("update onzio.club_logo_page_content set color_cards=$2::jsonb where club_id=$1",
      [clubId, JSON.stringify([{ image_url: url }])])).rejects.toThrow("MEDIA_NOT_PUBLISHED");
    await expect(setup.query("update onzio.club_logo_page_content set features=$2::jsonb where club_id=$1",
      [clubId, JSON.stringify([{ patch_url: url }])])).rejects.toThrow("MEDIA_NOT_PUBLISHED");
    await expect(setup.query("insert into onzio.site_social_links(club_id,id,label,href,icon) values($1,'media-link','Media','/',$2)",
      [clubId, url])).rejects.toThrow("MEDIA_NOT_PUBLISHED");
  } finally {
    await Promise.allSettled([linker.query("rollback"), cleaner.query("rollback")]);
    await setup.query("delete from onzio.site_social_links where club_id=$1", [clubId]);
    await setup.query("delete from onzio.club_logo_page_content where club_id=$1", [clubId]);
    await setup.query("delete from onzio.audit_events where resource_id=$1", [assetId]);
    await setup.query("delete from onzio.media_assets where id=$1", [assetId]);
    await setup.query("delete from onzio.clubs where id=$1", [clubId]);
    await Promise.all([setup.end(), linker.end(), cleaner.end()]);
  }
});
