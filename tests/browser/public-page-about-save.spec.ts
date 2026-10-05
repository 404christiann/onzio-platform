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
 await page.goto("/admin/about");await page.frameLocator(".aep-frame").locator('[data-about-editor-section="story"]').first().click();return page.getByLabel("Story Paragraphs",{exact:true});
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
   await page.reload();await page.frameLocator(".aep-frame").locator('[data-about-editor-section="story"]').first().click();await expect(page.getByLabel("Story Paragraphs",{exact:true})).toHaveValue(marker);
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
