import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { backend, gate } from "./fixtures/admin-cl-25/backend";
let server:ViteDevServer|undefined,origin:string;
const repo=process.cwd(),evidence=resolve(repo,process.env.CL25_EVIDENCE_DIR??".codex-work/admin-cl-25/implementation/collection");
test.beforeAll(async()=>{
 await mkdir(evidence,{recursive:true});const {createServer}=await import("vite");const fixture=resolve(repo,"tests/browser/fixtures/admin-cl-25");
 server=await createServer({root:repo,configFile:false,envDir:false,publicDir:resolve(repo,"public"),cacheDir:resolve(evidence,"vite-cache"),resolve:{alias:[
 {find:"@/lib/queries",replacement:fixture+"/queries.ts"},{find:"@/lib/admin-client",replacement:fixture+"/client.ts"},{find:"@/lib/supabase-browser",replacement:fixture+"/client.ts"},
 {find:"next/navigation",replacement:fixture+"/navigation.tsx"},{find:"next/link",replacement:fixture+"/navigation.tsx"},{find:"next/dynamic",replacement:fixture+"/dynamic.tsx"},{find:"next/image",replacement:fixture+"/image.tsx"},{find:"@",replacement:repo}]},
 define:{"process.env.NODE_ENV":JSON.stringify("development"),"process.env.NEXT_PUBLIC_SUPABASE_URL":JSON.stringify("http://127.0.0.1:54321")},oxc:{jsx:{runtime:"automatic"}},server:{host:"127.0.0.1",port:0,watch:{ignored:["**/.codex-work/**","**/test-results/**"]}}});
 await server.listen();const address=server.httpServer!.address();if(!address||typeof address==="string")throw Error("No fixture origin");origin="http://127.0.0.1:"+address.port;
});
test.afterAll(async()=>{await server?.close();});
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus)await page.screenshot({path:info.outputPath("failure.png"),fullPage:true});});
const dialog=(page:Page)=>page.locator("[data-slot=admin-dialog]").filter({visible:true}).last();
const save=(page:Page)=>page.locator("[data-admin-page-header] [data-admin-save-button]");
async function open(page:Page,theme="light",extra="",settle=true){
 await page.context().addCookies([{name:"onzio-admin-theme",value:theme,url:origin}]);
 await page.goto(origin+"/tests/browser/fixtures/admin-cl-25/?theme="+theme+extra);
 await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme",theme);
 if(settle)await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");
}
async function settleDialog(page:Page){
 await expect(dialog(page)).toBeVisible();
 await expect.poll(()=>dialog(page).evaluate(el=>el.getAnimations().filter(a=>{const timing=a.effect?.getComputedTiming();return timing?.iterations!==Infinity&&(a.pending||!["finished","idle"].includes(a.playState));}).length)).toBe(0);
}
async function add(page:Page,name:string){
 await page.locator("[data-admin-page-header]").getByRole("button",{name:"Add a team",exact:true}).click();await settleDialog(page);
 await dialog(page).getByRole("textbox",{name:"Team name",exact:true}).fill(name);
}
for(const width of [390,1280])for(const theme of ["light","dark"] as const)for(const motion of ["no-preference","reduce"] as const){
 test.describe(width+"px "+theme+" "+motion,()=>{
  test.use({viewport:{width,height:width===390?844:900},colorScheme:theme,contextOptions:{reducedMotion:motion}});
  test("ranked read table edits one team and saves full existing payload",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);
   expect(await page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(motion==="reduce");
   await expect(page.getByRole("table").first().locator("tbody tr")).toHaveCount(6);
   await expect(page.getByRole("textbox",{name:"Team name",exact:true})).toHaveCount(0);
   await page.getByRole("button",{name:"Edit Rockford Rovers",exact:true}).click();await settleDialog(page);
   await expect(dialog(page).getByRole("textbox",{name:"Team name",exact:true})).toBeFocused();
   const points=dialog(page).getByRole("spinbutton",{name:"Points",exact:true});await points.click();await points.pressSequentially("030");await expect(points).toHaveValue("30");
   const gd=dialog(page).getByRole("spinbutton",{name:"Goal difference",exact:true});await gd.fill("-12");await gd.press("Tab");await expect(gd).toHaveValue("-12");
   const fields=await dialog(page).getByRole("spinbutton").evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));
   expect(fields[0].width).toBeGreaterThanOrEqual(width<700?120:160);
   if(width<700)expect(fields[1].y).toBeGreaterThan(fields[0].y);else expect(fields[1].y).toBe(fields[0].y);
   await page.screenshot({path:info.outputPath("team-dialog.png")});
   await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
   await expect(page.getByRole("button",{name:"Edit Rockford Rovers",exact:true})).toBeFocused();
   await expect(page.getByRole("table").first().locator("tbody tr").first()).toContainText("Rockford Rovers");
   const held=gate();state.saveGate=held;await save(page).click();await expect(save(page)).toHaveAttribute("data-state","saving");await save(page).press("Enter");
   held.release();state.saveGate=null;await expect(save(page)).toHaveAttribute("data-state","saved");
   await expect.poll(()=>save(page).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(theme==="light"?"rgb(52, 199, 89)":"rgb(48, 209, 88)");
   await expect.poll(()=>save(page).evaluate(el=>getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
   expect(state.writes.map(w=>w.table+":"+w.operation)).toEqual(["league_standings_settings:upsert","league_standings:upsert"]);
   expect(state.rows.find(r=>r.team_name==="Rockford Rovers")).toMatchObject({points:30,goal_difference:-12,sort_order:1});
   expect(state.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:info.outputPath("read-table-saved.png"),fullPage:true});
  });
  test("unknown insert confirms same identity and retains newer draft before explicit save",async({page})=>{
   const state=await backend(page,origin);await open(page,theme);await add(page,"Recovery team");await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();
   state.unknownInsert=true;await save(page).click();await expect(page.getByRole("alert")).toBeVisible();await expect(save(page)).toHaveAttribute("data-state","dirty");
   expect(state.insertAttempts).toBe(1);const id=state.rows.find(row=>row.team_name==="Recovery team").id;
   await page.getByRole("textbox",{name:"Table title",exact:true}).fill("Newer title");
   await save(page).click();await expect(save(page)).toHaveAttribute("data-state","dirty");
   expect(state.insertAttempts).toBe(1);expect(state.settings.title).toBe("League table");expect(state.rows.filter(row=>row.id===id)).toHaveLength(1);
   await save(page).click();await expect(save(page)).toHaveAttribute("data-state","saved");
   expect(state.insertAttempts).toBe(1);expect(state.settings.title).toBe("Newer title");expect(state.errors).toEqual([]);
  });
  test("saved refresh failure gates editing and retry until visible saving finishes",async({page})=>{
   const state=await backend(page,origin);await open(page,theme);await add(page,"Read recovery");await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();
   state.failRead=true;await save(page).click();const retry=page.getByRole("button",{name:"Retry loading",exact:true});await expect(page.getByRole("alert")).toContainText("were saved");
   await expect(save(page)).toHaveAttribute("data-state","saving");await expect(retry).toBeDisabled();
   await expect(retry).toBeEnabled();await expect(save(page)).toHaveAttribute("aria-disabled","true");
   await expect(page.getByRole("button",{name:"Edit Read recovery",exact:true})).toHaveCount(0);
   state.failRead=false;await retry.click();await expect(retry).toHaveCount(0);
   await expect(page.getByRole("button",{name:"Edit Read recovery",exact:true})).toBeVisible();expect(state.insertAttempts).toBe(1);
   await page.getByRole("button",{name:"Edit Read recovery",exact:true}).click();await settleDialog(page);await dialog(page).getByRole("textbox",{name:"Team name",exact:true}).fill("Recovered team");await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();await save(page).click();await expect(save(page)).toHaveAttribute("data-state","saved");expect(state.insertAttempts).toBe(1);expect(state.errors).toEqual([]);
  });
  test("loading keeps its painted geometry through dwell and page discard guards season switch",async({page},info)=>{
   const state=await backend(page,origin),hold=gate();state.readGate=hold;
   await page.addInitScript(()=>{
    if(window.top!==window || location.pathname!=="/tests/browser/fixtures/admin-cl-25/")return;
    const proof:any={samples:[],shifts:[],released:null};(window as any).__cl25Loading=proof;
    new PerformanceObserver(list=>{for(const entry of list.getEntries() as any)proof.shifts.push({value:entry.value,recent:entry.hadRecentInput,time:entry.startTime});}).observe({type:"layout-shift",buffered:true});
    function sample(){
     const region=document.querySelector("[data-admin-loading-region]"),sk=document.querySelector("[data-standings-skeleton]"),table=sk?.querySelector("table");
     if(region){const layer=document.querySelector("[data-admin-skeleton-layer]");proof.samples.push({time:performance.now(),phase:region.getAttribute("data-phase"),region:region.getBoundingClientRect().toJSON(),preview:document.querySelector("[data-admin-public-preview]")?.getBoundingClientRect().toJSON(),opacity:layer?getComputedStyle(layer).opacity:null,table:table?.getBoundingClientRect().toJSON(),rows:table?[...table.querySelectorAll("tbody tr")].map(el=>el.getBoundingClientRect().toJSON()):[]});}
     if(performance.now()<10000)requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
   });
   await open(page,theme,"",false);
   await expect.poll(()=>page.locator("[data-admin-loading-region]").getAttribute("data-phase"),{intervals:[16]}).toBe("skeleton");
   const before=await page.locator("[data-standings-skeleton]").boundingBox();const painted=await page.locator("[data-admin-shimmer]").first().evaluate(el=>getComputedStyle(el).backgroundColor);expect(painted).not.toBe("rgba(0, 0, 0, 0)");
   await writeFile(info.outputPath("loading-before.json"),JSON.stringify({before,painted}));
   const cdp=await page.context().newCDPSession(page),capture=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(info.outputPath("loading-opaque.png"),Buffer.from(capture.data,"base64"));await cdp.detach();
   await page.evaluate(()=>{(window as any).__cl25Loading.released=performance.now();});hold.release();state.readGate=null;
   await expect.poll(()=>page.locator("[data-admin-loading-region]").getAttribute("data-phase"),{intervals:[16]}).toBe("content");
   const proof=await page.evaluate(()=>(window as any).__cl25Loading);
   const opaque=proof.samples.filter((sample:any)=>sample.phase==="skeleton"&&sample.opacity==="1"&&sample.table);
   expect(opaque.length).toBeGreaterThan(1);expect(opaque.some((sample:any)=>sample.time>=proof.released)).toBe(true);
   const anchor=opaque[0].table;for(const sample of opaque)for(const key of ["x","y","width","height"])expect(Math.abs(sample.table[key]-anchor[key])).toBeLessThanOrEqual(1);
   const fade=proof.samples.find((sample:any)=>sample.phase==="crossfade");expect(fade).toBeTruthy();
   const settled=await page.getByRole("table").first().boundingBox();expect(Math.abs(settled!.y-anchor.y)).toBeLessThanOrEqual(1);
   await writeFile(info.outputPath("loading-phases.json"),JSON.stringify({proof,settled,unknownInitialExtent:"six fixed placeholder rows, actual team count unknown",scope:"visible season/table/header/row geometry through opaque dwell; actual below-fold content extent retained",rawCLS:proof.shifts.filter((entry:any)=>!entry.recent).reduce((sum:number,entry:any)=>sum+entry.value,0)}));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.getByRole("textbox",{name:"Table title",exact:true}).fill("Unsaved title");
   await page.getByRole("combobox",{name:"Season",exact:true}).selectOption(state.seasons[1].id);await settleDialog(page);
   await expect(dialog(page)).toContainText("Save your changes first?");
   await dialog(page).getByRole("button",{name:"Keep editing",exact:true}).click();await expect(page.getByRole("textbox",{name:"Table title",exact:true})).toHaveValue("Unsaved title");
   await page.getByRole("button",{name:"Discard",exact:true}).click();await settleDialog(page);await dialog(page).getByRole("button",{name:"Discard changes",exact:true}).click();await expect(page.getByRole("textbox",{name:"Table title",exact:true})).toHaveValue("League table");expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
   await page.screenshot({path:info.outputPath("read-table.png"),fullPage:true});
  });
 });
}
test.describe("bounded controls",()=>{
 test.use({viewport:{width:320,height:568},contextOptions:{reducedMotion:"reduce"}});
 test("empty long names short viewport numeric and remove confirmation remain reachable",async({page},info)=>{
  const state=await backend(page,origin);state.rows=[];await open(page);await expect(page.getByRole("heading",{name:"No teams yet",exact:true})).toBeVisible();
  await add(page,"W".repeat(60));await dialog(page).getByRole("spinbutton",{name:"Points",exact:true}).fill("999999");
  await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();await save(page).click();await expect(save(page)).toHaveAttribute("data-state","saved");
  await page.getByRole("button",{name:"Edit "+"W".repeat(60),exact:true}).click();await settleDialog(page);await dialog(page).getByRole("button",{name:"Remove team",exact:true}).click();await settleDialog(page);
  await expect(dialog(page)).toContainText("Save changes");await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();await expect(page.getByRole("dialog").filter({visible:true})).toHaveCount(1);
  await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const cells=await page.getByRole("table").first().locator("tbody td").evaluateAll(els=>els.map(el=>{const cell=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);return{left:cell.left,right:cell.right,rects:[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right}))};}));
  for(const cell of cells)for(const rect of cell.rects){expect(rect.left).toBeGreaterThanOrEqual(cell.left-1);expect(rect.right).toBeLessThanOrEqual(cell.right+1);}
  expect(state.errors).toEqual([]);await page.screenshot({path:info.outputPath("320-long.png"),fullPage:true});
 });
 test("auto numbers and own logo are read only; reimagined keeps original editor",async({page})=>{
  const state=await backend(page,origin);state.seasons[0].standings_from_scores=true;await open(page);await page.getByRole("button",{name:"Edit Alpha FC",exact:true}).click();await settleDialog(page);
  await expect(dialog(page).getByRole("spinbutton",{name:"Points",exact:true})).toHaveAttribute("readonly","");await expect(dialog(page).getByRole("button",{name:"Upload image",exact:true})).toHaveCount(0);
  await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();await open(page,"light","&legacy=1",false);await expect(page.getByRole("button",{name:"Add Team",exact:true})).toBeVisible();await expect(page.getByRole("textbox",{name:"Team name",exact:true})).toHaveCount(6);expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
 });
 test("load failure retry recovers and missing season cannot mutate",async({page})=>{
  const state=await backend(page,origin);state.failRead=true;await open(page);await expect(page.getByRole("alert")).toContainText("unavailable");state.failRead=false;await page.getByRole("button",{name:"Retry loading",exact:true}).click();await expect(page.getByRole("button",{name:"Edit Alpha FC",exact:true})).toBeVisible();
  state.seasons=[];state.rows=[];await open(page);await add(page,"No season team");await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();await save(page).click();await expect(page.getByRole("alert")).toContainText("Add a season");expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
 });
 test("partial writes resume the original command before newer settings",async({page})=>{
  const state=await backend(page,origin);await open(page);await page.getByRole("textbox",{name:"Table title",exact:true}).fill("Submitted title");
  state.failTable="league_standings";await save(page).click();await expect(page.getByRole("alert")).toContainText("Write rejected");await expect(save(page)).toHaveAttribute("data-state","dirty");
  await page.getByRole("textbox",{name:"Table title",exact:true}).fill("Newer title");await save(page).click();await expect(save(page)).toHaveAttribute("data-state","dirty");
  expect(state.writes.filter(w=>w.table==="league_standings_settings")).toHaveLength(1);expect(state.settings.title).toBe("Submitted title");
  await save(page).click();await expect(save(page)).toHaveAttribute("data-state","saved");expect(state.settings.title).toBe("Newer title");expect(state.errors).toEqual([]);
 });
 test("unknown insert with different tenant or values stays unresolved without another insert",async({page})=>{
  const state=await backend(page,origin);await open(page);await add(page,"Conflict team");await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();state.unknownInsert=true;await save(page).click();await expect(save(page)).toHaveAttribute("data-state","dirty");
  state.rows.find(row=>row.team_name==="Conflict team").club_id="different";await save(page).click();await expect(page.getByRole("alert")).toContainText("different team details");await expect(save(page)).toHaveAttribute("data-state","dirty");expect(state.insertAttempts).toBe(1);expect(state.errors).toEqual([]);
 });
 test("native image validation starts readiness before URI and keeps newer text through upload",async({page})=>{
  const state=await backend(page,origin);await open(page);await page.getByRole("button",{name:"Edit Rockford Rovers",exact:true}).click();await settleDialog(page);
  const hold=gate();state.uploadGate=hold;
  await dialog(page).getByLabel("Choose team logo",{exact:true}).setInputFiles({name:"logo.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6TcAAAAAASUVORK5CYII=","base64")});
  await expect(dialog(page).getByRole("button",{name:"Apply",exact:true})).toBeDisabled();await dialog(page).getByRole("textbox",{name:"Team name",exact:true}).fill("Newer logo team");
  await page.keyboard.press("Escape");await expect(dialog(page).getByRole("textbox",{name:"Team name",exact:true})).toHaveValue("Newer logo team");
  hold.release();state.uploadGate=null;await expect(dialog(page).getByRole("button",{name:"Apply",exact:true})).toBeEnabled();await expect(dialog(page).getByRole("button",{name:"Replace image",exact:true})).toBeVisible();
  await dialog(page).getByRole("button",{name:"Apply",exact:true}).click();await save(page).click();await expect(save(page)).toHaveAttribute("data-state","saved");expect(state.rows.find(row=>row.team_name==="Newer logo team").logo_url).toContain("/logos/teams/");expect(state.errors).toEqual([]);
 });

 test("failed season switch retries the selected season and guards save-and-switch drafts",async({page})=>{
  const state=await backend(page,origin);await open(page);const second=state.seasons[1].id;
  state.failRead=true;await page.getByRole("combobox",{name:"Season",exact:true}).selectOption(second);await expect(page.getByRole("alert")).toContainText("unavailable");
  state.failRead=false;await page.getByRole("button",{name:"Retry loading",exact:true}).click();await expect(page.getByRole("combobox",{name:"Season",exact:true})).toHaveValue(second);expect(state.requestedSeasons.at(-1)).toBe(second);
  await page.getByRole("textbox",{name:"Table title",exact:true}).fill("Latest before switch");await page.getByRole("combobox",{name:"Season",exact:true}).selectOption(state.seasons[0].id);await settleDialog(page);
  await dialog(page).getByRole("button",{name:"Save and switch",exact:true}).click();await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
  await expect(page.getByRole("combobox",{name:"Season",exact:true})).toHaveValue(state.seasons[0].id);expect(state.settings.title).toBe("Latest before switch");expect(state.requestedSeasons.at(-1)).toBe(state.seasons[0].id);expect(state.errors).toEqual([]);
 });

 for (const guardWidth of [390,1280]) test("guard retries failed header request during its remaining Saving display "+guardWidth+"px",async({page},info)=>{
  await page.setViewportSize({width:guardWidth,height:844});
  const state=await backend(page,origin);await open(page);await page.getByRole("textbox",{name:"Table title",exact:true}).fill("Guard retry title");state.failTable="league_standings";
  await save(page).evaluate(el=>{
   new MutationObserver(()=>{if(el.getAttribute("data-state")==="saving" && !(window as any).__cl25SavingAt)(window as any).__cl25SavingAt=performance.now();}).observe(el,{attributes:true,attributeFilter:["data-state"]});
   document.addEventListener("keydown",event=>{const target=event.target as HTMLElement;if(event.key==="Enter"&&target.closest("button")?.textContent?.includes("Save and leave"))(window as any).__cl25GuardEntered={at:performance.now(),sinceSaving:performance.now()-(window as any).__cl25SavingAt,headerState:el.getAttribute("data-state")};},true);
  });
  const started=await page.evaluate(()=>performance.now());await save(page).click();await expect(page.getByRole("alert")).toContainText("Write rejected");await expect(save(page)).toHaveAttribute("data-state","saving");
  await page.keyboard.press("Shift+Tab");await expect(page.getByRole("link",{name:"Roster",exact:true})).toBeFocused();await page.keyboard.press("Enter");
  const action=dialog(page).getByRole("button",{name:"Save and leave",exact:true});await expect(action).toBeFocused();
  const writesBefore=state.writes.length;await page.keyboard.press("Enter");
  const entered={...await page.evaluate(()=>(window as any).__cl25GuardEntered),writesBefore};
  expect(entered.headerState).toBe("saving");expect(entered.sinceSaving).toBeLessThan(400);
  try {await expect(page.getByLabel("Current page",{exact:true})).toHaveText("/admin/roster");}
  finally {await writeFile(info.outputPath("guard-early-retry.json"),JSON.stringify({entered,elapsed:await page.evaluate(()=>performance.now())-started,writes:state.writes.map(w=>({table:w.table,operation:w.operation})),alerts:await page.getByRole("alert").allTextContents(),destination:await page.getByLabel("Current page",{exact:true}).textContent()}));}
  expect(state.writes.filter(w=>w.table==="league_standings_settings")).toHaveLength(1);expect(state.writes.filter(w=>w.table==="league_standings")).toHaveLength(2);expect(state.writes.filter(w=>w.table==="league_standings")[1].payload).toEqual(state.writes.filter(w=>w.table==="league_standings")[0].payload);expect(state.settings.title).toBe("Guard retry title");expect(state.errors).toEqual([]);
 });

 for(const logoWidth of [390,1280])test("own persisted logo keeps Legacy rendering and locked controls "+logoWidth+"px",async({page},info)=>{
  await page.setViewportSize({width:logoWidth,height:844});
  const state=await backend(page,origin),theme=logoWidth===390?"dark":"light";
  const logo="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6TcAAAAAASUVORK5CYII=";
  state.rows[0].logo_url=logo;await open(page,theme);
  const ownRow=page.getByRole("table").first().locator("tbody tr").filter({hasText:"Alpha FC"}),crest=ownRow.locator("img");
  await expect(crest).toBeVisible();await expect.poll(()=>crest.evaluate(el=>(el as HTMLImageElement).complete&&(el as HTMLImageElement).naturalWidth>0)).toBe(true);await expect(crest).toHaveAttribute("src",logo);
  const classic=await crest.evaluate(el=>({ready:(el as HTMLImageElement).complete,naturalWidth:(el as HTMLImageElement).naturalWidth,naturalHeight:(el as HTMLImageElement).naturalHeight,rect:el.getBoundingClientRect().toJSON()}));
  await page.getByRole("button",{name:"Edit Alpha FC",exact:true}).click();await settleDialog(page);await expect(dialog(page).getByText("Uses your club crest. Logo controls are locked.",{exact:true})).toBeVisible();await expect(dialog(page).getByRole("button",{name:"Upload image",exact:true})).toHaveCount(0);await expect(dialog(page).getByRole("button",{name:"Remove",exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath("own-logo-locked.png")});await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
  await open(page,theme,"&legacy=1",false);await expect(page.getByRole("button",{name:"Add Team",exact:true})).toBeVisible();
  const legacyRow=page.getByRole("table").first().locator("tbody tr").first(),legacyCrest=legacyRow.locator("img");
  await expect(legacyCrest).toBeVisible();await expect.poll(()=>legacyCrest.evaluate(el=>(el as HTMLImageElement).complete&&(el as HTMLImageElement).naturalWidth>0)).toBe(true);await expect(legacyCrest).toHaveAttribute("src",logo);await expect(legacyRow.getByText("Logo locked",{exact:true})).toBeVisible();await expect(legacyRow.getByRole("button",{name:"Upload Logo",exact:true})).toHaveCount(0);
  const legacy=await legacyCrest.evaluate(el=>({ready:(el as HTMLImageElement).complete,naturalWidth:(el as HTMLImageElement).naturalWidth,naturalHeight:(el as HTMLImageElement).naturalHeight,rect:el.getBoundingClientRect().toJSON()}));
  expect(classic.naturalWidth).toBe(legacy.naturalWidth);expect(classic.naturalHeight).toBe(legacy.naturalHeight);expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
  await writeFile(info.outputPath("own-logo-legacy-parity.json"),JSON.stringify({classic,legacy,sameSource:true,writes:0,locked:true,scope:"existing persisted-logo display with real native image decode; not normalized upload pipeline/retirement proof"}));
 });

 for(const previewWidth of [390,1280])test("preview heading matches Legacy typography "+previewWidth+"px",async({page},info)=>{
  await page.setViewportSize({width:previewWidth,height:844});
  const state=await backend(page,origin),theme=previewWidth===390?"dark":"light";await open(page,theme);
  const heading=page.locator("[data-admin-public-preview] h2");await expect(heading).toHaveText("League table");
  const read=(el:Element)=>{const css=getComputedStyle(el);return{fontSize:css.fontSize,fontWeight:css.fontWeight,fontFamily:css.fontFamily,lineHeight:css.lineHeight,fontStyle:css.fontStyle,textTransform:css.textTransform,letterSpacing:css.letterSpacing,marginTop:css.marginTop,marginBottom:css.marginBottom,color:css.color,rect:el.getBoundingClientRect().toJSON()};};
  const classic=await heading.evaluate(read),host=await page.getByRole("heading",{name:"Homepage preview",exact:true}).evaluate(read);
  await heading.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("classic-preview-heading.png")});
  await open(page,theme,"&legacy=1",false);await expect(page.getByRole("button",{name:"Add Team",exact:true})).toBeVisible();
  const legacyHeading=page.locator("[data-admin-public-preview] h2");await expect(legacyHeading).toHaveText("League table");const legacy=await legacyHeading.evaluate(read);
  await legacyHeading.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("legacy-preview-heading.png")});
  await writeFile(info.outputPath("preview-typography-parity.json"),JSON.stringify({classic,legacy,host,theme,viewport:previewWidth,scope:"actual reused renderer in same fixture environment; wrapper geometry recorded separately; no public component modification"}));
  for(const key of ["fontSize","fontWeight","fontFamily","lineHeight","fontStyle","textTransform","letterSpacing","marginTop","marginBottom","color"] as const)expect(classic[key],key).toBe(legacy[key]);
  expect(host.fontSize).toBe("14px");expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
 });

});
