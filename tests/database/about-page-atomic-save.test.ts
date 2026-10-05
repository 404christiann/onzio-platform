import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
let db:Client;const clubId=CLUB_IDS.alpha;
async function actor(userId:string=USER_IDS.ownerAal2){
 await db.query("reset role");const timestamp=Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:userId,role:"authenticated",aal:"aal1",amr:[{method:"otp",timestamp}]})]);await db.query("set local role authenticated");
}
async function design(template="cinematic",routes=["home","club","club-logo","schedule"]){
 await db.query("reset role");const id=randomUUID();
 await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
 values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
 [id,clubId,template,JSON.stringify({schemaVersion:1,template:{id:template,version:1},navigation:{groups:[{routes}]}}),"a".repeat(64),USER_IDS.ownerAal2]);
 await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`,[clubId,id,USER_IDS.ownerAal2]);await actor();
}
async function load(page="about",operationId?:string,target:string=clubId){return(await db.query("select onzio.load_about_editor($1,$2,$3) as data",[target,page,operationId??null])).rows[0].data;}
async function save(payload:unknown){return(await db.query("select onzio.save_about_editor($1,$2::jsonb) as data",[clubId,JSON.stringify(payload)])).rows[0].data;}
async function request(page="about",overrides:Record<string,unknown>={}){
 const baseline=await load(page);return {operationId:randomUUID(),page,expectedRevision:baseline.revision,designRevision:baseline.designRevision,
 content:page==="about"?{hero_title:"Our club",story_paragraphs:[],feature_image_url:"",values_heading:"Values",values:[],closing_text:"Join us",closing_cta_label:"Schedule",closing_cta_href:"/schedule"}:{annotated_image_url:"",map_image_url:"",features:[],color_cards:[]},...overrides};
}
async function rejects(action:()=>Promise<unknown>,message:string){await db.query("savepoint expected_failure");try{await expect(action()).rejects.toThrow(message);}finally{await db.query("rollback to savepoint expected_failure");}}
async function media(){await db.query("reset role");const id=randomUUID(),path=`${clubId}/about/${id}.png`;
 await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,created_by,published_at)
 values($1,$2,'onzio-media',$3,'about','graphic','image/png',100,50,50,$4,'published',$5,now())`,[id,clubId,path,"a".repeat(64),USER_IDS.ownerAal2]);await actor();return {id,path,url:`https://attacker.test/storage/v1/object/public/onzio-media/${path}`};}
beforeEach(async()=>{assertSafeTestEnvironment();db=new Client({host:"127.0.0.1",port:54322,user:"postgres",password:"postgres",database:"postgres"});await db.connect();await db.query("begin");await design();});
afterEach(async()=>{if(db){await db.query("rollback");await db.end();}});
describe("independent About/Logo atomic save",()=>{
 it("saves only selected page, independently advances revision and records/replays exact actor receipt",async()=>{
 const aboutBefore=await load(),logoBefore=await load("logo");const input=await request("logo");const committed=await save(input);
 expect(committed.revision).not.toBe(logoBefore.revision);expect(await load()).toEqual(aboutBefore);expect(await save(input)).toEqual(committed);
 expect((await load("logo",input.operationId)).operation).toEqual({status:"committed",receipt:committed});
 await rejects(()=>save({...input,content:{...input.content,map_image_url:"https://invalid.test/image.png"}}),"OPERATION_REUSED");
 await actor(USER_IDS.adminAal2);expect((await load("logo",input.operationId)).operation).toEqual({status:"not-committed"});
 });
 it("prevents a concurrent administrator and legacy update from replacing a newer page",async()=>{
 const stale=await request();await save(await request());await actor(USER_IDS.adminAal2);await rejects(()=>save(stale),"ABOUT_CHANGED");
 const another=await request();await db.query("reset role");await db.query("update onzio.about_page_content set hero_title='Legacy edit' where club_id=$1",[clubId]);await actor();await rejects(()=>save(another),"ABOUT_CHANGED");
 expect((await load()).content.hero_title).toBe("Legacy edit");
 });
 it.each([null,0,true,{},[],"","-1","abc","1".repeat(21)])("fails closed for malformed revision %j",async expectedRevision=>{
 const input=await request("about",{expectedRevision}),before=await load();await rejects(()=>save(input),"INVALID_ABOUT_PAYLOAD");expect(await load()).toEqual(before);expect((await load("about",input.operationId)).operation.status).toBe("not-committed");
 });
 it.each([null,{},[{title:null,description:""}],[{title:"Value",description:null}]])("rejects malformed values %j atomically",async values=>{
 const input=await request();const before=await load();await rejects(()=>save({...input,content:{...input.content,values}}),"INVALID_ABOUT_PAYLOAD");expect(await load()).toEqual(before);
 });
 it("recovers committed Logo receipt after its design becomes unavailable, and rejects fresh Logo saves",async()=>{
 const input=await request("logo"),receipt=await save(input);await design("academy");expect(await save(input)).toEqual(receipt);expect((await load("logo",input.operationId)).operation.receipt).toEqual(receipt);await rejects(()=>load("logo"),"PAGE_UNAVAILABLE");
 });
 it("rejects changed design and unpublished/unsupported closing destinations",async()=>{
 const stale=await request();await design("cinematic",["home","club"]);await rejects(()=>save(stale),"DESIGN_CHANGED");
 const current=await request();await rejects(()=>save(current),"INVALID_ABOUT_DESTINATION");await rejects(()=>save({...current,content:{...current.content,closing_cta_href:"/contact"}}),"INVALID_ABOUT_DESTINATION");
 });
 it("canonicalizes forged nested origins and durably records removed asset cleanup IDs",async()=>{
 const asset=await media(),input=await request("logo");const content={...input.content,features:[{title:"Feature",description:"",patch_url:asset.url,icon_url:asset.url,icon_size:70,icon_scale:1}],color_cards:[{label:"Color",image_url:asset.url}]};
 const committed=await save({...input,content});expect(committed.content.features[0].patch_url).toBe(`/storage/v1/object/public/onzio-media/${asset.path}`);expect(committed.content.color_cards[0].image_url).toBe(committed.content.features[0].patch_url);
 const replacement=await request("logo"),receipt=await save(replacement);expect(receipt.retiredMediaAssetIds).toContain(asset.id);expect((await load("logo",replacement.operationId)).operation.receipt.retiredMediaAssetIds).toContain(asset.id);
 });
 it("repairs legacy nonarray Logo JSON without leaking fallback rows or failing old URL extraction",async()=>{
 await save(await request("logo"));await db.query("reset role");
 await db.query("update onzio.club_logo_page_content set features='null'::jsonb,color_cards='{}'::jsonb where club_id=$1",[clubId]);await actor();
 const repaired=await save(await request("logo"));expect(repaired.content.features).toEqual([]);expect(repaired.content.color_cards).toEqual([]);
 });
 it("rolls back invalid media without a revision or receipt and denies another tenant",async()=>{
 const input=await request("logo"),before=await load("logo");await rejects(()=>save({...input,content:{...input.content,map_image_url:"https://foreign.test/image.png"}}),"INVALID_ABOUT_MEDIA");expect(await load("logo")).toEqual(before);await rejects(()=>load("about",undefined,CLUB_IDS.bravo),"NOT_AUTHORIZED");
 });
});
