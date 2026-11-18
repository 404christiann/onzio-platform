/** Reviewed Schedule-only rehearsal. No season creation/activation or roster mutation. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "55321" || connection.hostname !== "127.0.0.1" || connection.port !== "55322" || ["host","hostaddr","service","servicefile"].some(key => connection.searchParams.has(key))) throw new Error("Isolated local55321/55322 only.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const sourceBytes = await readFile("../../design-explorations/schedule-2027/source.json");
  const source = JSON.parse(sourceBytes.toString());
  const reviewed = [...source.fixtures.slice(0, 3), source.fixtures.find((row: { rose_city_score: number | null; date: string }) => row.rose_city_score === null && row.date === "2027-03-13")];
  if (reviewed.length !== 4 || reviewed.some(row => !row)) throw new Error("Reviewed four fixtures unavailable.");
  const db = new Client({ connectionString: connection.href }); await db.connect();
  const local = createClient(api.origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    if (club?.slug !== "rose-city" || club.kind !== "test") throw new Error("Expected Rose City test tenant.");
    const season = (await db.query("select id,label from onzio.seasons where club_id=$1 and active", [clubId])).rows[0];
    if (season?.label !== "2027") throw new Error("The roster-owned2027 season must already exist; this script never changes seasons.");
    async function assertEmpty() { if ((await db.query("select 1 from onzio.matches where club_id=$1 limit 1", [clubId])).rowCount) throw new Error("Schedule is populated; refusing overwrite."); }
    await assertEmpty();
    const tables = ["players","player_photos","seasons","player_season_stats","goalkeeper_season_stats","site_branding","homepage_revamp_content","cinematic_shop_content","cinematic_tickets_content","cinematic_stadium_content","cinematic_chick_fil_a_content"];
    async function capture() { const result: Record<string,string> = {}; for (const table of tables) result[table] = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from onzio.${table} t`)).rows[0].digest; return result; }
    const before = await capture();
    const published: Record<string,{assetId:string;url:string;checksum:string}> = {};
    async function publish(slot:string, bytes:Buffer, fileName:string, mimeType:string) {
      const validated = await validateMediaUpload({ bytes, metadata: { fileName, mimeType, size: bytes.length, kind: "graphic" } });
      const hex=hash(`schedule-2027:${slot}:${hash(bytes)}`), uploadId=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
      const stagingPath=buildStoragePath({clubId,surface:"schedule",assetId:uploadId,extension:validated.extension});
      const staging=await local.storage.from("onzio-upload-staging").upload(stagingPath,bytes,{contentType:validated.mimeType,upsert:true});
      if(staging.error)throw new Error(`Cannot stage ${slot}`);
      const result=await publishAuthorizedMedia({version:1,uploadId,clubId,actorId,surface:"schedule",kind:"graphic",fileName,mimeType:validated.mimeType,claimedSize:bytes.length,stagingPath,expiresAt:Date.now()+60000});
      if(result.idempotent)await local.storage.from("onzio-upload-staging").remove([stagingPath]);
      const response=await fetch(result.publicUrl);if(!response.ok)throw new Error(`Cannot deliver ${slot}`);
      const delivered=hash(Buffer.from(await response.arrayBuffer()));
      const asset=(await db.query("select checksum_sha256 from onzio.media_assets where id=$1 and club_id=$2",[result.assetId,clubId])).rows[0];
      if(delivered!==asset.checksum_sha256)throw new Error(`Delivered checksum mismatch ${slot}`);
      published[slot]={assetId:result.assetId,url:result.publicUrl,checksum:delivered};
    }
    for (let index=0;index<4;index++) {
      const url=new URL(reviewed[index].opponent_logo_url);
      if(url.origin!=="https://ioalthwsdrlzrubomrow.supabase.co"||!url.pathname.startsWith(`/storage/v1/object/public/onzio-media/${clubId}/schedule/`))throw new Error("Unexpected public opponent source.");
      const response=await fetch(url,{redirect:"error"});if(!response.ok)throw new Error("Public opponent source unavailable.");
      await publish(`opponent${index}`,Buffer.from(await response.arrayBuffer()),`opponent-${index}.webp`,"image/webp");
    }
    const inputs=[["foothill","foothill.png","image/png"],["nikys","nikys.png","image/png"],["chickfila","chickfila.webp","image/webp"],["tepito","tepito.webp","image/webp"],["league","upsl.png","image/png"]];
    for(const [slot,file,mime] of inputs)await publish(slot,await readFile(`../../design-explorations/schedule-2027/${file}`),basename(file),mime);
    const sponsorNames=["Foothill Transit","Niky’s Sports","Chick-fil-A · E. Colorado Blvd, Lake & Boylston","Tepito Coffee"];
    const sponsorSlots=["foothill","nikys","chickfila","tepito"];
    const inserted:string[]=[];
    await db.query("begin isolation level serializable");
    try {
      await db.query("select pg_advisory_xact_lock(hashtext($1))",[`schedule-2027:${clubId}`]);
      await assertEmpty();
      if((await db.query("select id from onzio.seasons where club_id=$1 and active",[clubId])).rows[0]?.id!==season.id)throw new Error("Active season changed; refusing stale import.");
      for(let index=0;index<4;index++){
        const row=reviewed[index],opponent=published[`opponent${index}`],sponsor=published[sponsorSlots[index]],league=published.league;
        const result=await db.query(`insert into onzio.matches(club_id,season_id,date,time,opponent,opponent_short_name,opponent_logo_url,opponent_logo_asset_id,competition,league_logo_url,league_logo_asset_id,home,venue,address,city,state,rose_city_score,opponent_score,sponsor_name,sponsor_logo_url,sponsor_logo_asset_id,sponsor_link)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning id`,
        [clubId,season.id,row.date,row.time,row.opponent.trim(),row.opponent_short_name,opponent.url,opponent.assetId,row.competition||"UPSL",league.url,league.assetId,row.home,row.venue,row.address,row.city,row.state,row.rose_city_score,row.opponent_score,sponsorNames[index],sponsor.url,sponsor.assetId,row.sponsor_link]);
        inserted.push(result.rows[0].id);
      }
      if(JSON.stringify(await capture())!==JSON.stringify(before))throw new Error("Protected content changed.");
      await db.query("commit");
    } catch(error){await db.query("rollback");throw error}
    if(JSON.stringify(await capture())!==JSON.stringify(before))throw new Error("Protected content changed after import.");
    await mkdir("../../review-notes/schedule-2027/implemented",{recursive:true});
    await writeFile("../../review-notes/schedule-2027/implemented/local-import-receipt.json",JSON.stringify({localOnly:true,clubId,seasonId:season.id,sourceHash:hash(sourceBytes),temporaryCopiedFixtures:true,fixtureIds:inserted,media:published,rosterAndProtectedContentPreserved:true},null,2)+"\n");
    console.log(JSON.stringify({localOnly:true,fixtures:inserted.length,publishedMedia:Object.keys(published).length,deliveredChecksums:Object.keys(published).length,rosterAndProtectedContentPreserved:true}));
  } finally {await db.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Schedule import failed.");process.exitCode=1});
