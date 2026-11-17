import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test as base, type Page } from "@playwright/test";
import { parsePresentationDocument, type PresentationDocument } from "../../packages/presentation";
import { presentationDocumentForTemplate } from "../helpers/presentation-fixture";
import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "../../lib/about-content";
import { aboutPageEditableContent } from "../../lib/about-editor/save";
import type { DBAboutPageContent, DBClubLogoPageContent } from "../../lib/db-types";
async function snapshot(page:Page,target:"about"|"logo"="about"){
 const response=await page.request.get(`/api/admin/about-editor?page=${target}`);expect(response.ok()).toBe(true);return response.json();
}
function editable(baseline:Awaited<ReturnType<typeof snapshot>>){
 return baseline.page==="about"?aboutPageEditableContent({page:"about",content:{...EMPTY_ABOUT_PAGE_CONTENT,...baseline.content} as DBAboutPageContent})
 :aboutPageEditableContent({page:"logo",content:{...EMPTY_CLUB_LOGO_PAGE_CONTENT,...baseline.content} as DBClubLogoPageContent});
}
async function write(page:Page,baseline:Awaited<ReturnType<typeof snapshot>>,content:unknown=editable(baseline)){
 const current=await snapshot(page,baseline.page);
 const response=await page.request.post("/api/admin/about-editor",{data:{page:baseline.page,content,operationId:crypto.randomUUID(),expectedRevision:current.revision,designRevision:current.designRevision}});
 expect(response.ok(),await response.text()).toBe(true);
}
const ALPHA_CLUB_ID="11111111-1111-4111-8111-111111111111";
const localDb=()=>new Client({host:"127.0.0.1",port:54322,user:"postgres",password:"postgres",database:"postgres"});
const RAW_FIXTURE_TABLES = [
 { table: "onzio.clubs", column: "id" },
 { table: "onzio.presentation_state", column: "club_id" },
 { table: "onzio.presentation_documents", column: "club_id" },
 { table: "onzio.presentation_publications", column: "club_id" },
 { table: "onzio.about_page_content", column: "club_id" },
 { table: "onzio.club_logo_page_content", column: "club_id" },
 { table: "onzio_private.about_editor_revisions", column: "club_id" },
 { table: "onzio_private.about_editor_receipts", column: "club_id" },
 { table: "onzio.audit_events", column: "club_id" },
] as const;
type RawFixture = Record<string, Record<string, unknown>[]>;

// JSONB keeps PostgreSQL timestamp microseconds; pg's Date parser does not.
async function captureRawFixture(db: Client): Promise<RawFixture> {
 const snapshot: RawFixture = {};
 for (const { table, column } of RAW_FIXTURE_TABLES) {
  snapshot[table] = (await db.query(
   `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from ${table} t where ${column}=$1`,
   [ALPHA_CLUB_ID],
  )).rows[0].rows;
 }
 return snapshot;
}

async function restoreRawFixture(db: Client, baseline: RawFixture) {
 await db.query("begin");
 try {
  await db.query("set local session_replication_role=replica");
  const current = await captureRawFixture(db);
  for (const { table, column } of RAW_FIXTURE_TABLES) {
   if (JSON.stringify(current[table]) === JSON.stringify(baseline[table])) continue;
   // Keep the tenant row itself in place; all other rows belong to this fixture.
   if (table === "onzio.clubs") {
    for (const row of baseline[table]) {
     const columns = Object.keys(row).sort().map(key => `"${key}"`).join(",");
     await db.query(
      `update ${table} set (${columns})=(select ${columns} from jsonb_populate_record(null::${table},$1::jsonb)) where id=$2`,
      [JSON.stringify(row), ALPHA_CLUB_ID],
     );
    }
   } else if (table === "onzio.audit_events") {
    // Audit IDs are GENERATED ALWAYS. Preserve original rows and delete only
    // additions owned by this serialized local fixture; never reinsert IDs.
    const originalIds = new Set(baseline[table].map(row => row.id));
    const addedIds = current[table].filter(row => !originalIds.has(row.id)).map(row => row.id);
    if (addedIds.length) await db.query("delete from onzio.audit_events where club_id=$1 and id=any($2::bigint[])", [ALPHA_CLUB_ID, addedIds]);
   } else {
    await db.query(`delete from ${table} where ${column}=$1`, [ALPHA_CLUB_ID]);
    await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(baseline[table])]);
   }
  }
  await db.query("commit");
 } catch (error) {
  await db.query("rollback");
  throw error;
 } finally {
  expect((await db.query("show session_replication_role")).rows[0].session_replication_role).toBe("origin");
 }
 // Assertions follow every safe restoration, including temporary presentation docs.
 expect(await captureRawFixture(db)).toEqual(baseline);
}

const test = base.extend<{ rawAboutFixture: void }>({
 rawAboutFixture: [async ({}, use) => {
  const db = localDb();
  await db.connect();
  try {
   // Automatic fixtures run before page fixtures and presentation beforeEach.
   // The runner must also snapshot before creating its authenticated state.
   const baseline = await captureRawFixture(db);
   try { await use(); }
   finally { await restoreRawFixture(db, baseline); }
  } finally { await db.end(); }
 }, { auto: true }],
});
// Academy (Alpha's seeded design) fixes the closing button to the Schedule page.
const ACADEMY_CLOSING_CTA_HREF="/schedule";
async function closeAboutDialog(page:Page){
 const done=page.getByRole("button",{name:"Done",exact:true});
 if(await done.isVisible()){await done.click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);}
}
async function openAboutSection(page:Page,section:string){
 await closeAboutDialog(page);
 const labels: Record<string, string> = { hero: "Page heading", story: "Club story", values: "Club values", closing: "Closing invitation", features: "Crest feature", colors: "Brand colors" };
 // A public section can contain another editor target. Select its named
 // overlay; the enclosing overlay is last when empty color targets nest.
 await page.frameLocator(".aep-frame").getByRole("button", { name: `Edit ${labels[section]}`, exact: true }).last().click();
 await expect(page.getByRole(section === "features" || section === "colors" ? "complementary" : "dialog")).toBeVisible();
}
async function ensureHeading(page:Page){
 await openAboutSection(page,"hero");const field=page.getByRole("textbox",{name:"Page heading",exact:true});
 if(!(await field.inputValue()).trim())await field.fill("Our club");await closeAboutDialog(page);
}
async function saveAbout(page:Page){await closeAboutDialog(page);await page.locator("[data-admin-save-button]").click();}
async function story(page:Page){
 await page.goto("/admin/about");await ensureHeading(page);await openAboutSection(page,"story");return page.getByRole("textbox",{name:"Story Paragraphs",exact:true});
}

for(const failure of ["committed-500","committed-network-loss","unavailable-receipt","not-committed"] as const){
 test(`About reconciles ${failure} and preserves original UUID plus payload`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});const marker=`About recovery ${crypto.randomUUID().slice(0,8)}`;
  const submitted:unknown[]=[],probes:string[]=[];
  await page.route("**/api/admin/about-editor**",async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==="GET"&&url.searchParams.has("operationId")){
    probes.push(url.searchParams.get("operationId")!);if(failure==="unavailable-receipt"&&probes.length===1)return route.abort();return route.continue();
   }
   if(request.method()!=="POST")return route.continue();submitted.push(request.postDataJSON());if(submitted.length>1)return route.continue();
   if(failure.startsWith("committed")){const response=await route.fetch();expect(response.ok()).toBe(true);}
   if(failure==="committed-network-loss")return route.abort();
   return route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:{code:"DATABASE_OPERATION_FAILED",message:"Unconfirmed save"}})});
  });
  try{
   const field=await story(page);await field.fill(marker);await saveAbout(page);await openAboutSection(page,"story");
   if(!failure.startsWith("committed")){
    await expect(field).toBeDisabled();await expect(field).toHaveValue(marker);
    await closeAboutDialog(page);await page.getByRole("button",{name:"Retry exact save",exact:true}).click();await openAboutSection(page,"story");expect(submitted[1]).toEqual(submitted[0]);
   }
   await expect(field).toBeEnabled();expect(probes).toContain((submitted[0] as {operationId:string}).operationId);
   await page.unrouteAll({behavior:"wait"});expect((await snapshot(page)).content.story_paragraphs).toEqual([marker]);
   await page.reload();await openAboutSection(page,"story");await expect(page.getByRole("textbox",{name:"Story Paragraphs",exact:true})).toHaveValue(marker);
  }finally{await page.unrouteAll({behavior:"wait"});}
 });
}
test("About concurrent save preserves draft and requires reviewing/reloading latest",async({page})=>{
 await page.setViewportSize({width:1440,height:900});const baseline=await snapshot(page);
 const field=await story(page);await field.fill("Unsaved local story");
 await write(page,baseline,{...editable(baseline),closing_cta_href:ACADEMY_CLOSING_CTA_HREF,story_paragraphs:["Another administrator's story"]});
 await saveAbout(page);await openAboutSection(page,"story");await expect(field).toBeDisabled();await expect(field).toHaveValue("Unsaved local story");
 expect((await snapshot(page)).content.story_paragraphs).toEqual(["Another administrator's story"]);
 await closeAboutDialog(page);await page.getByRole("button",{name:"Reload latest page",exact:true}).click();const reloaded=page.waitForResponse(response=>response.request().method()==="GET"&&new URL(response.url()).pathname==="/api/admin/about-editor");
 await page.getByRole("dialog",{name:"Another editor saved this page",exact:true}).getByRole("button",{name:"Reload latest page",exact:true}).click();
 expect((await reloaded).ok()).toBe(true);
 await expect(page.frameLocator(".aep-frame").getByText("Another administrator's story",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Reload latest page",exact:true})).toHaveCount(0);
 await openAboutSection(page,"story");
 await expect(field).toBeEnabled();await expect(field).toHaveValue("Another administrator's story");
});
async function saveSelected(page:Page){
 const response=page.waitForResponse(result=>result.request().method()==="POST"&&new URL(result.url()).pathname==="/api/admin/about-editor");
 await saveAbout(page);expect((await response).ok()).toBe(true);
}
// The Club Logo cases need a design that publishes the Club Logo page. They
// were written for Cinematic, retired in PR #55, and Academy (local Alpha's
// seeded design) deliberately has no Logo page. So each case temporarily
// publishes Clubhouse for Alpha; the automatic raw fixture restores it after.
// The first case still asserts its empty-collection prerequisites.
async function publishClubhouseForAlpha(){
 const db=localDb();await db.connect();
 try{
  const original=(await db.query<{updated_by:string;configuration:PresentationDocument}>(
   "select s.draft_document_id,s.published_document_id,s.updated_by,d.configuration from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id where s.club_id=$1",[ALPHA_CLUB_ID])).rows[0];
  if(!original)throw new Error("Local Alpha has no published presentation to switch from.");
  const configuration=parsePresentationDocument(presentationDocumentForTemplate(original.configuration,"clubhouse"),{surface:"production"});
  const id=randomUUID(),digest=createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
  const version=Number((await db.query("select coalesce(max(version),0)+1 as version from onzio.presentation_documents where club_id=$1",[ALPHA_CLUB_ID])).rows[0].version);
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
   values($1,$2,$3,1,'clubhouse',1,$4::jsonb,$5,$6)`,[id,ALPHA_CLUB_ID,version,JSON.stringify(configuration),digest,original.updated_by]);
  await db.query("update onzio.presentation_state set published_document_id=$1 where club_id=$2",[id,ALPHA_CLUB_ID]);
 }finally{await db.end();}
}
test.describe("Club Logo page cases (Alpha temporarily on Clubhouse)",()=>{
test.beforeEach(async()=>{await publishClubhouseForAlpha();});
test("empty About values and Logo features/colors can be created; Logo save preserves About draft",async({page})=>{
 await page.setViewportSize({width:1440,height:900});const about=await snapshot(page),logo=await snapshot(page,"logo");
 expect(about.content?.values??[]).toEqual([]);expect(logo.content?.features??[]).toEqual([]);expect(logo.content?.color_cards??[]).toEqual([]);
 await page.goto("/admin/about");await ensureHeading(page);const preview=page.frameLocator(".aep-frame");
 await openAboutSection(page,"values");await page.getByRole("button",{name:"Add value",exact:true}).click();await page.getByLabel("Value 1 Title",{exact:true}).fill("First value");
 await closeAboutDialog(page);await page.getByRole("button",{name:/Club Logo page/}).click();await openAboutSection(page,"features");
 await page.getByRole("button",{name:"Add crest feature",exact:true}).click();await page.getByLabel("Feature 1 Title",{exact:true}).fill("First feature");
 await openAboutSection(page,"colors");await page.getByRole("button",{name:"Add color card",exact:true}).click();await page.getByLabel("Color label",{exact:true}).fill("First color");
 await saveSelected(page);await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state","saved");
 expect((await snapshot(page,"logo")).content.features[0].title).toBe("First feature");expect((await snapshot(page)).content?.values??[]).toEqual([]);
 await page.getByRole("button",{name:/^About page/}).click();
 // Clubhouse has no fixed closing button, so with no About row Save stays off
 // until the admin picks where it goes, as the editor tells them to.
 if(!about.content){await openAboutSection(page,"closing");await page.getByLabel("Button goes to",{exact:true}).selectOption("/schedule");}
 await openAboutSection(page,"values");await expect(page.getByLabel("Value 1 Title",{exact:true})).toHaveValue("First value");
 await saveSelected(page);expect((await snapshot(page)).content.values[0].title).toBe("First value");
 await openAboutSection(page,"values");await page.getByRole("button",{name:"Remove value 1",exact:true}).click();await saveSelected(page);expect((await snapshot(page)).content.values).toEqual([]);
 await page.getByRole("button",{name:/Club Logo page/}).click();await openAboutSection(page,"features");await page.getByRole("button",{name:"Remove crest feature",exact:true}).click();
 await openAboutSection(page,"colors");await page.getByRole("button",{name:"Remove color card",exact:true}).click();await saveSelected(page);
 expect((await snapshot(page,"logo")).content).toMatchObject({features:[],color_cards:[]});
});

test("removing newly uploaded Logo items queues their images only for the Logo Save",async({page})=>{
 await page.setViewportSize({width:1440,height:900});const about=await snapshot(page),logo=await snapshot(page,"logo");
 const submitted:Array<{page:string;content:Record<string,unknown>;retiredMediaUrls:string[]}>=[];
 const uploaded:string[]=[];let assetId="";
 const clubId="11111111-1111-4111-8111-111111111111";
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/EkAAAAASUVORK5CYII=","base64");
 await page.route("**/api/admin/about-editor**",async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==="GET"&&!url.searchParams.has("operationId")){
   const target=url.searchParams.get("page"),baseline=target==="logo"?logo:about;
   const content=target==="logo"?{...EMPTY_CLUB_LOGO_PAGE_CONTENT}:{...EMPTY_ABOUT_PAGE_CONTENT,hero_title:"Our club",closing_cta_href:"/schedule"};
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({...baseline,content})});
  }
  if(request.method()==="POST"){
   const input=request.postDataJSON();submitted.push(input);const baseline=input.page==="logo"?logo:about;
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({...baseline,revision:String(BigInt(baseline.revision)+BigInt(1)),content:input.content})});
  }
  return route.continue();
 });
 await page.route("**/api/admin/media/authorize",async route=>{
  assetId=crypto.randomUUID();return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({path:`${clubId}/about/${assetId}.png`,token:"isolated-test",authorization:"isolated-test"})});
 });
 await page.route("**/storage/v1/object/upload/sign/**",route=>route.fulfill({status:200,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST,PUT,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type,x-client-info,x-upsert"},contentType:"application/json",body:JSON.stringify({Key:`onzio-upload-staging/${clubId}/about/${assetId}.png`})}));
 await page.route("**/api/admin/media/finalize",async route=>{
  const storagePath=`${clubId}/about/${assetId}.png`,publicUrl=`http://127.0.0.1:54321/storage/v1/object/public/onzio-media/${storagePath}`;uploaded.push(publicUrl);
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{assetId,storagePath,publicUrl}})});
 });
 await page.route("**/storage/v1/object/public/onzio-media/**",route=>route.fulfill({status:200,contentType:"image/png",body:png}));
 async function upload(index:number){
  const replace=page.locator(".aep-fields").getByRole("button",{name:"Replace",exact:true}).nth(index);
  const chooser=page.waitForEvent("filechooser");await replace.click();await(await chooser).setFiles({name:"unsaved.png",mimeType:"image/png",buffer:png});
  await expect(replace).toBeEnabled();
 }
 try{
  await page.goto("/admin/about");const preview=page.frameLocator(".aep-frame");
  await page.getByRole("button",{name:/Club Logo page/}).click();await openAboutSection(page,"features");
  await page.getByRole("button",{name:"Add crest feature",exact:true}).click();await upload(0);await upload(1);
  await expect.poll(()=>uploaded.length).toBe(2);await page.getByRole("button",{name:"Remove crest feature",exact:true}).click();
  await openAboutSection(page,"colors");await page.getByRole("button",{name:"Add color card",exact:true}).click();await upload(0);
  await expect.poll(()=>uploaded.length).toBe(3);await page.getByRole("button",{name:"Remove color card",exact:true}).click();
  await page.getByRole("button",{name:/^About page/}).click();await openAboutSection(page,"story");await page.getByRole("textbox",{name:"Story Paragraphs",exact:true}).fill("Independent About change");
  await saveSelected(page);expect(submitted[0]).toMatchObject({page:"about",retiredMediaUrls:[]});
  await closeAboutDialog(page);await page.getByRole("button",{name:/Club Logo page/}).click();await openAboutSection(page,"features");await saveSelected(page);
  expect(submitted).toHaveLength(2);expect(submitted[1]).toMatchObject({page:"logo",content:{features:[],color_cards:[]}});
  expect(submitted[1].retiredMediaUrls.map(url=>url.split("?")[0])).toEqual(uploaded);
 }finally{await page.unrouteAll({behavior:"wait"});}
});
});
