import { expect, test, type Page } from "@playwright/test";
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
async function story(page:Page){
 await page.goto("/admin/about");await page.frameLocator(".aep-frame").locator('[data-about-editor-section="story"]').first().click();return page.getByRole("textbox",{name:"Story Paragraphs",exact:true});
}
for(const failure of ["committed-500","committed-network-loss","unavailable-receipt","not-committed"] as const){
 test(`About reconciles ${failure} and preserves original UUID plus payload`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});const baseline=await snapshot(page);const marker=`About recovery ${crypto.randomUUID().slice(0,8)}`;
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
   const field=await story(page);await field.fill(marker);await page.locator(".aep-inspector-save button").click();
   if(!failure.startsWith("committed")){
    await expect(field).toBeDisabled();await expect(field).toHaveValue(marker);
    await page.locator(".aep-inspector-save button").filter({hasText:"Retry exact save"}).click();expect(submitted[1]).toEqual(submitted[0]);
   }
   await expect(field).toBeEnabled();expect(probes).toContain((submitted[0] as {operationId:string}).operationId);
   await page.unrouteAll({behavior:"wait"});expect((await snapshot(page)).content.story_paragraphs).toEqual([marker]);
   await page.reload();await page.frameLocator(".aep-frame").locator('[data-about-editor-section="story"]').first().click();await expect(page.getByRole("textbox",{name:"Story Paragraphs",exact:true})).toHaveValue(marker);
  }finally{await page.unrouteAll({behavior:"wait"});await write(page,baseline);}
 });
}
test("About concurrent save preserves draft and requires reviewing/reloading latest",async({page})=>{
 await page.setViewportSize({width:1440,height:900});const baseline=await snapshot(page);
 try{
 const field=await story(page);await field.fill("Unsaved local story");
 await write(page,baseline,{...editable(baseline),story_paragraphs:["Another administrator's story"]});
 await page.locator(".aep-inspector-save button").click();await expect(field).toBeDisabled();await expect(field).toHaveValue("Unsaved local story");
 expect((await snapshot(page)).content.story_paragraphs).toEqual(["Another administrator's story"]);
 page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Reload latest page",exact:true}).click();
 await expect(field).toBeEnabled();await expect(field).toHaveValue("Another administrator's story");
 }finally{await write(page,baseline);}
});
async function saveSelected(page:Page){
 const response=page.waitForResponse(result=>result.request().method()==="POST"&&new URL(result.url()).pathname==="/api/admin/about-editor");
 await page.locator(".aep-inspector-save button").click();expect((await response).ok()).toBe(true);
}
// Run this case against a synthetic Cinematic club with empty collections. It
// intentionally asserts those prerequisites rather than skipping an absent page.
test("empty About values and Logo features/colors can be created; Logo save preserves About draft",async({page})=>{
 await page.setViewportSize({width:1440,height:900});const about=await snapshot(page),logo=await snapshot(page,"logo");
 expect(about.content?.values??[]).toEqual([]);expect(logo.content?.features??[]).toEqual([]);expect(logo.content?.color_cards??[]).toEqual([]);
 try{
 await page.goto("/admin/about");const preview=page.frameLocator(".aep-frame");
 await preview.locator('[data-about-editor-section="values"]').click();await page.getByRole("button",{name:"Add value",exact:true}).click();await page.getByLabel("Value 1 Title",{exact:true}).fill("First value");
 await page.getByRole("button",{name:/^Club Logo page/}).click();await preview.locator('[data-about-editor-section="features"]').click();
 await page.getByRole("button",{name:"Add crest feature",exact:true}).click();await page.getByLabel("Feature 1 Title",{exact:true}).fill("First feature");
 await preview.locator('[data-about-editor-section="colors"]').first().click();await page.getByRole("button",{name:"Add color card",exact:true}).click();await page.getByLabel("Color label",{exact:true}).fill("First color");
 await saveSelected(page);await expect(page.locator(".aep-inspector-save button")).toBeDisabled();
 expect((await snapshot(page,"logo")).content.features[0].title).toBe("First feature");expect((await snapshot(page)).content?.values??[]).toEqual([]);
 await page.getByRole("button",{name:/^About page/}).click();await preview.locator('[data-about-editor-section="values"]').click();await expect(page.getByLabel("Value 1 Title",{exact:true})).toHaveValue("First value");
 await saveSelected(page);expect((await snapshot(page)).content.values[0].title).toBe("First value");
 await page.getByRole("button",{name:"Remove value 1",exact:true}).click();await saveSelected(page);expect((await snapshot(page)).content.values).toEqual([]);
 await page.getByRole("button",{name:/^Club Logo page/}).click();await preview.locator('[data-about-editor-section="features"]').first().click();await page.getByRole("button",{name:"Remove crest feature",exact:true}).click();
 await preview.locator('[data-about-editor-section="colors"]').first().click();await page.getByRole("button",{name:"Remove color card",exact:true}).click();await saveSelected(page);
 expect((await snapshot(page,"logo")).content).toMatchObject({features:[],color_cards:[]});
 }finally{await write(page,about);await write(page,logo);}
});

// Parent runs this case against the Editorial fixture separately from the
// Cinematic empty-Logo case. Empty editor data is isolated at the HTTP boundary;
// the real preview, selection handlers, controls and Save request remain active.
for (const width of [1440, 390]) {
 test(`Editorial empty About exposes Values and Closing authoring at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const baseline=await snapshot(page);const submitted:unknown[]=[];
  await page.route("**/api/admin/about-editor**",async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==="GET"&&url.searchParams.get("page")==="about"&&!url.searchParams.has("operationId")){
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({...baseline,content:{...EMPTY_ABOUT_PAGE_CONTENT}})});
   }
   if(request.method()==="POST"){
    const input=request.postDataJSON();submitted.push(input);
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({...baseline,revision:String(BigInt(baseline.revision)+BigInt(1)),content:input.content})});
   }
   return route.continue();
  });
  try{
   await page.goto("/admin/about");const preview=page.frameLocator(".aep-frame");
   await expect(preview.locator('[data-site-template="editorial"]')).toBeVisible();
   const emptyValues=preview.locator('.aep-empty-section[data-about-editor-section="values"]');
   const emptyClosing=preview.locator('.aep-empty-section[data-about-editor-section="closing"]');
   await expect(emptyValues).toHaveCount(1);await expect(emptyClosing).toHaveCount(1);
   await emptyValues.click();await page.getByRole("button",{name:"Add value",exact:true}).click();
   await page.getByLabel("Value 1 Title",{exact:true}).fill("Our first Editorial value");
   // The placeholder becomes the real public section as soon as content exists.
   await expect(preview.locator('.aep-empty-section[data-about-editor-section="values"]')).toHaveCount(0);
   await expect(preview.locator('.value-section')).toContainText("Our first Editorial value");
   await expect(page.locator(".aep-inspector-save button")).toBeDisabled();
   await page.getByRole("button",{name:"Done",exact:true}).click();
   await expect(preview.locator(".value-section")).toBeFocused();await emptyClosing.click();
   await page.getByRole("combobox",{name:"Button goes to",exact:true}).selectOption("/schedule");
   await page.getByLabel("Button Text",{exact:true}).fill("View our schedule");
   await page.getByLabel("Closing Text",{exact:true}).fill("Join us for our next match.");
   await expect(page.locator(".aep-inspector-save button")).toBeEnabled();await saveSelected(page);
   expect(submitted).toHaveLength(1);expect(submitted[0]).toMatchObject({page:"about",content:{values:[{title:"Our first Editorial value",description:""}],closing_cta_href:"/schedule",closing_cta_label:"View our schedule",closing_text:"Join us for our next match."}});
   await expect(preview.locator('.aep-empty-section')).toHaveCount(0);
   await expect(preview.locator('.about-closing')).toContainText("Join us for our next match.");
  }finally{await page.unrouteAll({behavior:"wait"});}
 });
}

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
   const content=target==="logo"?{...EMPTY_CLUB_LOGO_PAGE_CONTENT}:{...EMPTY_ABOUT_PAGE_CONTENT,closing_cta_href:"/schedule"};
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
  await page.getByRole("button",{name:/^Club Logo page/}).click();await preview.locator('[data-about-editor-section="features"]').click();
  await page.getByRole("button",{name:"Add crest feature",exact:true}).click();await upload(0);await upload(1);
  await expect.poll(()=>uploaded.length).toBe(2);await page.getByRole("button",{name:"Remove crest feature",exact:true}).click();
  await preview.locator('[data-about-editor-section="colors"]').first().click();await page.getByRole("button",{name:"Add color card",exact:true}).click();await upload(0);
  await expect.poll(()=>uploaded.length).toBe(3);await page.getByRole("button",{name:"Remove color card",exact:true}).click();
  await page.getByRole("button",{name:/^About page/}).click();await preview.locator('[data-about-editor-section="story"]').click();await page.getByRole("textbox",{name:"Story Paragraphs",exact:true}).fill("Independent About change");
  await saveSelected(page);expect(submitted[0]).toMatchObject({page:"about",retiredMediaUrls:[]});
  await page.getByRole("button",{name:/^Club Logo page/}).click();await preview.locator('[data-about-editor-section="features"]').click();await saveSelected(page);
  expect(submitted).toHaveLength(2);expect(submitted[1]).toMatchObject({page:"logo",content:{features:[],color_cards:[]}});
  expect(submitted[1].retiredMediaUrls.map(url=>url.split("?")[0])).toEqual(uploaded);
 }finally{await page.unrouteAll({behavior:"wait"});}
});
