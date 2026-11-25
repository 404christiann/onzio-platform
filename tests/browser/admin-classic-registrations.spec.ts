import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { backend, gate, formIds } from "./fixtures/admin-cl-24/backend";
import { checkAdminDialog } from "./helpers/admin-design-checks";
const repo = process.cwd();
const evidence = resolve(repo, process.env.CL24_EVIDENCE_DIR ?? ".codex-work/admin-cl-24/implementation/collection");
let server: ViteDevServer | undefined;
let origin: string;
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  const fixture = resolve(repo, "tests/browser/fixtures/admin-cl-24");
  server = await createServer({ root: repo, configFile: false, envDir: false, publicDir: resolve(repo, "public"), cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: [
      { find: "@/lib/admin-client", replacement: fixture + "/client.ts" },
      { find: "@/lib/supabase-browser", replacement: fixture + "/client.ts" },
      { find: "@/lib/supabase", replacement: fixture + "/client.ts" },
      { find: "next/navigation", replacement: fixture + "/navigation.tsx" },
      { find: "next/link", replacement: fixture + "/navigation.tsx" },
      { find: "next/dynamic", replacement: fixture + "/dynamic.tsx" },
      { find: "next/image", replacement: fixture + "/image.tsx" },
      { find: "@", replacement: repo },
    ] }, define: { "process.env.NODE_ENV": JSON.stringify("development"), "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321") },
    oxc: { jsx: { runtime: "automatic" } }, server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.codex-work/**", "**/test-results/**"] } } });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw Error("No fixture address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });
test.afterEach(async ({ page }, info) => { if (info.status !== info.expectedStatus) await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true }); });

const dialog = (page: Page) => page.getByRole("dialog").filter({ visible: true }).last();
const save = (page: Page) => dialog(page).locator("[data-admin-save-button]");
async function open(page: Page, theme = "light", extra = "", wait = true) {
 await page.context().addCookies([{name:"onzio-admin-theme",value:theme,url:origin}]);
 await page.goto(origin + "/tests/browser/fixtures/admin-cl-24/?theme=" + theme + extra);
 await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme",theme);
 await expect(page.getByRole("heading",{level:1,name:"Registrations",exact:true})).toBeVisible();
 if(wait) await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");
}
async function pick(page: Page, name: string) {
 await page.getByRole("region",{name:"Registration forms"}).getByRole("button",{name:new RegExp("^"+name)}).click();
 await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");
}
async function edit(page: Page) {
 await page.locator("[data-admin-page-header]").getByRole("button",{name:"Edit form",exact:true}).click();
 await expect(dialog(page).getByLabel("Form name",{exact:true})).toBeVisible();
}
async function section(page: Page, label: string) {
 await dialog(page).getByRole("navigation",{name:"Form editor sections"}).getByRole("button",{name:label,exact:true}).click();
}
async function saved(page: Page) {
 await save(page).click();
 await expect(save(page)).toHaveAttribute("data-state","saved");
}
async function dismiss(page: Page) {
 await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();
 await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
}
for(const width of [390,1280]) for(const theme of ["light","dark"] as const) for(const motion of ["no-preference","reduce"] as const) {
 test.describe(width+"px "+theme+" "+motion,()=>{
  test.use({viewport:{width,height:width===390?844:900},colorScheme:theme,contextOptions:{reducedMotion:motion}});
  test("cards keep four recent forms and selected outside card with searchable archived access",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);
   await expect(page.getByRole("tab",{name:/Registrants/})).toHaveAttribute("aria-selected","true");
   await expect(page.locator(".registration-form-card:not(.registration-all-card)")).toHaveCount(4);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.getByRole("button",{name:/^All forms/}).click();
   await dialog(page).getByLabel("Search forms").fill("Futsal");
   await expect(dialog(page).locator(".registration-form-row")).toHaveCount(1);
   await dialog(page).getByRole("button",{name:/^Futsal/}).click();
   await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
   await expect(page.locator(".registration-form-card[aria-pressed=true]")).toContainText("Futsal");
   await expect(page.getByRole("heading",{level:2,name:"Futsal",exact:true})).toBeVisible();
   await page.getByRole("button",{name:/^All forms/}).click();
   await dialog(page).getByRole("button",{name:/^Archived/}).click();
   await expect(dialog(page).locator(".registration-form-row")).toHaveCount(1);
   await dialog(page).getByRole("button",{name:/^Archived Academy/}).click();
   await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
   await expect(page.getByText("Archived forms are read-only. Registrant data and CSV export remain available below.",{exact:true})).toBeVisible();
   await expect(page.locator("[data-admin-page-header]").getByRole("button",{name:"Edit form",exact:true})).toBeDisabled();
   await expect(page.getByRole("link",{name:"Download list",exact:true})).toHaveAttribute("href","/api/admin/registrations/export?formId="+formIds[5]);
   expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
   await page.screenshot({path:info.outputPath("archived-selected.png"),fullPage:true});
  });
  test("registrants filters search details signatures and export preserve review isolation",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);
   await page.getByRole("button",{name:"Refunded 1",exact:true}).click();
   await expect(page.getByText("Mateo Alvarez",{exact:true}).filter({visible:true})).toHaveCount(0);
   await page.getByRole("button",{name:"Review 1",exact:true}).click();
   const reviewRows = width < 700 ? page.locator("details:visible") : page.getByRole("table").locator("tbody tr");await expect(reviewRows).toHaveCount(1);await expect(reviewRows.first()).toContainText("Jo");
   await page.getByRole("button",{name:"All 8",exact:true}).click();
   await page.getByLabel("Search registrants by name or email").fill("guardian0@");
   if(width<700) {
    await page.locator("details:visible summary").click();
    await expect(page.locator("details:visible").getByText("Signature captured",{exact:true})).toBeVisible();
    await expect(page.locator("details:visible").getByText("Medical notes",{exact:true})).toBeVisible();
   } else {
    await page.getByRole("button",{name:"View Mateo Alvarez",exact:true}).click();
    await expect(dialog(page).getByText("Signature captured",{exact:true})).toBeVisible();
    await expect(dialog(page).getByText("Registrant failed · Admin sent · Delivery failed",{exact:true})).toBeVisible();
    await dialog(page).getByRole("button",{name:"Close",exact:true}).last().click();
   }
   await expect(page.getByRole("link",{name:"Export CSV",exact:true})).toHaveAttribute("href","/api/admin/registrations/export?formId="+formIds[0]);
   expect(state.entries.filter(e=>e.payment_recovery_required)).toHaveLength(1);expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
   await page.screenshot({path:info.outputPath("registrants-filtered.png"),fullPage:true});
  });
  test("form summary stays read first and new builder saves existing participant and price contract",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);
   await page.getByRole("tab",{name:"Form",exact:true}).click();
   await expect(page.getByLabel("Form name",{exact:true})).toHaveCount(0);
   await expect(page.getByRole("heading",{name:"Questions",exact:true})).toBeVisible();
   await page.getByRole("button",{name:"New form",exact:true}).click();
   const basicFields = dialog(page).locator("input:not([type=radio]):visible, textarea:visible");
   for (const field of await basicFields.all()) expect((await field.boundingBox())!.width).toBeGreaterThanOrEqual(width < 700 ? 120 : 160);
   await writeFile(info.outputPath("basic-dialog-metrics.json"),JSON.stringify(await dialog(page).evaluate(el=>({popup:el.getBoundingClientRect().toJSON(),buttons:[...el.querySelectorAll("[data-slot=admin-dialog-footer] button")].map(b=>{const c=getComputedStyle(b);return {text:b.textContent,height:b.getBoundingClientRect().height,lineHeight:c.lineHeight,fontSize:c.fontSize,paddingTop:c.paddingTop,paddingBottom:c.paddingBottom,heightCSS:c.height,blockSize:c.blockSize,minHeight:c.minHeight,minBlockSize:c.minBlockSize,boxSizing:c.boxSizing};})}))));
   expect(await checkAdminDialog(page)).toEqual([]);
   const minor = dialog(page).getByRole("radio",{name:/^Minor only/}); await minor.focus();await minor.press("ArrowDown");await expect(dialog(page).getByRole("radio",{name:/^Adult only/})).toBeChecked();await dialog(page).getByRole("radio",{name:/^Adult only/}).press("ArrowDown");await expect(dialog(page).getByRole("radio",{name:/^Minor or adult/})).toBeChecked();
   for(const radio of await dialog(page).getByRole("radio").all()) expect(await radio.evaluate(el=>el.closest("label")!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
   await dialog(page).getByLabel("Form name",{exact:true}).fill("Community registration");
   await dialog(page).getByRole("textbox",{name:"Description",exact:true}).fill("A place for every participant.");
   await expect(dialog(page).getByRole("radio",{name:/Minor or adult/})).toBeChecked();
   await section(page,"Price options");
   await dialog(page).getByLabel("Registration amount in dollars",{exact:true}).fill("25.75");
   await saved(page);
   expect(state.writes.filter(w=>w.action==="create")).toHaveLength(1);
   expect(state.writes.find(w=>w.action==="create").values).toMatchObject({action:"create",title:"Community registration",participantMode:"both",description:"A place for every participant."});
   const created=state.forms.find(f=>f.title==="Community registration")!;
   expect(state.fields.filter(f=>f.form_id===created.id).map(f=>[f.field_key,f.participant_scope])).toEqual([["player_name","minor"],["guardian_name","minor"],["guardian_email","minor"],["guardian_phone","minor"],["registrant_name","adult"],["registrant_email","adult"],["registrant_phone","adult"],["emergency_contact_name","all"],["emergency_contact_phone","all"]]);
   expect(state.prices.find(p=>p.form_id===created.id).amount_cents).toBe(2575);
   await dismiss(page);await expect(page.getByRole("button",{name:"New form",exact:true})).toBeFocused();await expect(page.getByRole("tab",{name:/Registrants/})).toBeVisible();
   expect(state.errors).toEqual([]);await page.screenshot({path:info.outputPath("created-form.png"),fullPage:true});
  });
  test("questions retain types choices required branch keys and core definitions",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);await pick(page,"Special Kickers");await edit(page);await section(page,"Questions");
   await dialog(page).getByRole("button",{name:"Add question",exact:true}).click();
   await dialog(page).getByLabel("Question",{exact:true}).last().fill("Jersey size");
   await dialog(page).getByLabel("Question key",{exact:true}).last().fill("JERSEY_SIZE");
   await dialog(page).getByRole("combobox",{name:"Answer type",exact:true}).last().selectOption("dropdown");
   await dialog(page).getByLabel("Choices, separated by commas",{exact:true}).fill("Small, Medium, Large");
   await dialog(page).getByLabel("Participant branch",{exact:true}).last().selectOption("minor");
   await dialog(page).getByLabel("Required",{exact:true}).last().check();
   await saved(page);
   expect(state.fields.filter(f=>f.form_id===formIds[2])).toEqual(expect.arrayContaining([expect.objectContaining({field_key:"jersey_size",label:"Jersey size",field_type:"dropdown",options:["Small","Medium","Large"],required:true,participant_scope:"minor"})]));
   expect(state.fields.filter(f=>f.form_id===formIds[2]&&f.is_core).length).toBeGreaterThan(5);
   await section(page,"Questions");await expect(dialog(page).getByLabel("Question",{exact:true}).last()).toHaveValue("Jersey size");
   await page.screenshot({path:info.outputPath("questions.png")});expect(state.errors).toEqual([]);
  });
  test("price dollar parsing and removal keep historical options inactive",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);await pick(page,"Winter Skills Clinic");const old=state.prices.find(p=>p.form_id===formIds[1]).id;
   await edit(page);await section(page,"Price options");
   await dialog(page).getByRole("button",{name:"Add price",exact:true}).click();
   await dialog(page).getByLabel("Price name",{exact:true}).last().fill("Discount");
   await dialog(page).getByLabel("Discount amount in dollars",{exact:true}).fill("10.01");
   await dialog(page).getByRole("button",{name:"Remove",exact:true}).first().click();
   await saved(page);
   expect(state.prices.find(p=>p.id===old)).toMatchObject({active:false});
   expect(state.prices.find(p=>p.form_id===formIds[1]&&p.label==="Discount")).toMatchObject({amount_cents:1001,position:0,active:true});
   expect(state.writes.filter(w=>w.table==="registration_price_options"&&w.action==="update").length).toBeGreaterThanOrEqual(2);
   await page.screenshot({path:info.outputPath("prices.png")});expect(state.errors).toEqual([]);
  });
  test("waiver and lifecycle keep live locking confirmations and archived records",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);await pick(page,"Summer Camp");await edit(page);await section(page,"Waiver");
   await dialog(page).getByLabel("Waiver and consent",{exact:true}).fill("Reviewed community consent wording.");
   await saved(page);expect(state.forms.find(f=>f.id===formIds[3]).waiver_text).toBe("Reviewed community consent wording.");await dismiss(page);await expect(page.locator("[data-admin-page-header]").getByRole("button",{name:"Edit form",exact:true})).toBeFocused();
   await page.getByRole("button",{name:"Publish",exact:true}).click();
   await expect(page.locator(".registration-form-card[aria-pressed=true]")).toContainText("Live");
   await edit(page);await section(page,"Questions");await expect(dialog(page).getByRole("button",{name:"Add question",exact:true})).toBeDisabled();await dismiss(page);
   await page.getByRole("button",{name:"Stop registrations",exact:true}).click();
   await expect(page.locator(".registration-form-card[aria-pressed=true]")).toContainText("Not published");
   await page.getByRole("button",{name:"Archive",exact:true}).click();
   await expect(dialog(page).getByRole("heading",{name:"Archive this form?",exact:true})).toBeVisible();
   expect(state.forms.find(f=>f.id===formIds[3]).archived_at).toBeNull();
   await dialog(page).getByRole("button",{name:"Archive form",exact:true}).click();
   await expect(page.getByText("Archived forms are read-only. Registrant data and CSV export remain available below.",{exact:true})).toBeVisible();
   expect(state.forms.find(f=>f.id===formIds[3]).archived_at).not.toBeNull();
   await page.screenshot({path:info.outputPath("archived.png"),fullPage:true});expect(state.errors).toEqual([]);
  });
  test("guard keeps failed save open and uses newer edited draft on the next attempt",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);await pick(page,"Winter Skills Clinic");await edit(page);
   await dialog(page).getByLabel("Form name",{exact:true}).fill("First draft");
   state.failTable="registration_forms";state.failOperation="update";
   await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();
   await dialog(page).getByRole("button",{name:"Save and switch",exact:true}).click();
   await expect(dialog(page).getByRole("alert")).toContainText("could not be saved");
   await dialog(page).getByRole("button",{name:"Keep editing",exact:true}).click();
   await expect(page.getByRole("dialog",{name:"First draft",exact:true})).toBeVisible();
   await dialog(page).getByLabel("Form name",{exact:true}).fill("Newer draft");
   await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();
   await dialog(page).getByRole("button",{name:"Save and switch",exact:true}).click();
   await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
   await expect(page.locator("[data-admin-page-header]").getByRole("button",{name:"Edit form",exact:true})).toBeFocused();
   expect(state.forms.find(f=>f.id===formIds[1]).title).toBe("Newer draft");
   const updates=state.writes.filter(w=>w.table==="registration_forms"&&w.action==="update");expect(updates.map(w=>w.values.title)).toEqual(["First draft","Newer draft"]);
   await page.getByRole("link",{name:"Roster",exact:true}).click();
   await expect(page).toHaveURL(origin + "/admin/roster");await expect(page.getByRole("heading",{name:"Roster destination",exact:true})).toBeVisible();
   expect(state.errors).toEqual([]);await page.screenshot({path:info.outputPath("guard-saved.png"),fullPage:true});
  });
  test("delayed painted loading waits for all reads and records actual phases",async({page},info)=>{
   const state=await backend(page,origin);state.readGate=gate();
   await page.addInitScript(()=>{(window as any).__phases=[];const sample=()=>{const el=document.querySelector("[data-admin-loading-region]");if(el){const sk=el.querySelector("[data-admin-skeleton-layer]");(window as any).__phases.push({time:performance.now(),phase:el.getAttribute("data-phase"),top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height,skeleton:sk?getComputedStyle(sk).visibility:null});}requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   try{
    await open(page,theme,"",false);
    await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","skeleton");
    await expect(page.getByRole("status",{name:"Loading registrations",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"New form",exact:true})).toBeDisabled();
    await expect(page.getByLabel("Form name",{exact:true})).toHaveCount(0);
    state.readGate.release();state.readGate=null;
    await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");
    const samples=await page.evaluate(()=>(window as any).__phases);expect(samples.some((s:any)=>s.phase==="skeleton")).toBe(true);expect(samples.some((s:any)=>s.phase==="crossfade")).toBe(true);
    await writeFile(info.outputPath("loading-phases.json"),JSON.stringify({samples,unknownInitialExtent:true}));
    await page.screenshot({path:info.outputPath("loaded.png"),fullPage:true});expect(state.errors).toEqual([]);
   }finally{state.readGate?.release();}
  });
  test("later form selection keeps visible cards and old identity locked until new data settles",async({page},info)=>{
   const state=await backend(page,origin);await open(page,theme);state.readGate=gate();
   await page.evaluate(()=>{(window as any).__cardFrames=[];(window as any).__observeCards=true;const observe=()=>{if(!(window as any).__observeCards)return;const card=document.querySelector("button.registration-form-card");const host=document.querySelector("[data-admin-loading-region]");let opacity=1;let el=card;while(el instanceof Element){opacity*=Number(getComputedStyle(el).opacity);el=el.parentElement;}(window as any).__cardFrames.push({time:performance.now(),phase:host?.getAttribute("data-phase"),present:Boolean(card),opacity});requestAnimationFrame(observe);};requestAnimationFrame(observe);});
   try {
    await page.getByRole("region",{name:"Registration forms"}).getByRole("button",{name:/^Winter Skills Clinic/}).click();
    await expect.poll(()=>state.reads.some(q=>q.table==="registration_form_fields"&&q.filters.some(([k,v]:[string,unknown])=>k==="form_id"&&v===formIds[1]))).toBe(true);
    const pending=await page.locator("[data-admin-loading-region]").evaluate(el=>({phase:el.getAttribute("data-phase"),cards:el.querySelectorAll("button.registration-form-card").length,heading:el.querySelector(".registration-workspace-heading h2")?.textContent??null}));
    await writeFile(info.outputPath("selection-pending.json"),JSON.stringify(pending));
    await expect(page.getByRole("button",{name:/^All forms/})).toBeVisible();await expect(page.getByRole("button",{name:/^All forms/})).toBeDisabled();await expect(page.locator(".registration-workspace-heading h2")).toHaveText("Fall Academy");
    await expect(page.getByRole("button",{name:"Stop registrations",exact:true})).toBeDisabled();
    await expect(page.locator("[data-admin-page-header]").getByRole("button",{name:"Edit form",exact:true})).toBeDisabled();await expect(page.getByLabel("Form name",{exact:true})).toHaveCount(0);
    state.readGate.release();state.readGate=null;await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");
    await expect(page.locator(".registration-workspace-heading h2")).toHaveText("Winter Skills Clinic");await expect(page.locator(".registration-form-card[aria-pressed=true]")).toContainText("Winter Skills Clinic");
    await expect(page.getByText("Mateo Alvarez",{exact:true})).toHaveCount(0);
    const frames=await page.evaluate(()=>{(window as any).__observeCards=false;return (window as any).__cardFrames;});await writeFile(info.outputPath("selection-painted-frames.json"),JSON.stringify(frames));
    expect(frames.filter((f:any)=>f.phase==="refresh-reveal").length).toBeGreaterThan(0);expect(Math.min(...frames.map((f:any)=>f.present?f.opacity:0))).toBeGreaterThanOrEqual(.99);expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
   }finally{state.readGate?.release();await page.evaluate(()=>{(window as any).__observeCards=false;});}
  });
  test("pending form selection blocks summary editing until the latest form is ready",async({page},info)=>{
   const state=await backend(page,origin);state.forms[0].status="draft";await page.context().grantPermissions(["clipboard-read","clipboard-write"],{origin});await open(page,theme);state.readGate=gate();
   const registrantsPanel=page.locator("#registration-form-panel-registrants"),formPanel=page.locator("#registration-form-panel-build");
   const panels:unknown[]=[];
   async function recordPanels(label:string){panels.push({label,states:await page.locator("#registration-form-panel-registrants,#registration-form-panel-build").evaluateAll(elements=>elements.map(el=>({id:el.id,hidden:el.hasAttribute("hidden"),display:getComputedStyle(el).display,rect:el.getBoundingClientRect().toJSON()})))});}
   await expect(registrantsPanel).toBeVisible();await expect(formPanel).toBeHidden();await recordPanels("registrants-initial");
   try{
    await page.getByRole("region",{name:"Registration forms"}).getByRole("button",{name:/^Winter Skills Clinic/}).click();
    await expect.poll(()=>state.reads.filter(q=>q.filters.some(([key,value]:[string,unknown])=>key==="form_id"&&value===formIds[1])).length).toBeGreaterThanOrEqual(3);
    const registrants=page.getByRole("tab",{name:/^Registrants/});await registrants.focus();await registrants.press("ArrowRight");
    await expect(page.getByRole("tab",{name:"Form",exact:true})).toHaveAttribute("aria-selected","true");
    await expect(formPanel).toBeVisible();await expect(registrantsPanel).toBeHidden();await recordPanels("form-pending");
    await page.getByRole("tab",{name:"Form",exact:true}).press("ArrowLeft");await expect(registrantsPanel).toBeVisible();await expect(formPanel).toBeHidden();await recordPanels("registrants-pending");
    await registrants.press("ArrowRight");await expect(formPanel).toBeVisible();await expect(registrantsPanel).toBeHidden();
    const summary=page.locator(".registration-form-summary");
    await expect(summary.getByRole("heading",{level:3,name:"Fall Academy",exact:true})).toBeVisible();
    await expect(summary.getByRole("button",{name:"Edit form",exact:true})).toBeDisabled();
    await expect(page.locator("[data-admin-page-header]").getByRole("button",{name:"Edit form",exact:true})).toBeDisabled();
    await expect(page.getByRole("button",{name:"New form",exact:true})).toBeDisabled();
    await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Download list",exact:true})).toHaveAttribute("href","/api/admin/registrations/export?formId="+formIds[0]);
    await expect(summary.getByRole("button",{name:"Copy link",exact:true})).toBeEnabled();await summary.getByRole("button",{name:"Copy link",exact:true}).click();
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain("/register/form-1");
    await page.screenshot({path:info.outputPath("pending-summary-locked.png"),fullPage:true});
    state.readGate.release();state.readGate=null;
    await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");
    await expect(summary.getByRole("heading",{level:3,name:"Winter Skills Clinic",exact:true})).toBeVisible();
    await expect(formPanel).toBeVisible();await expect(registrantsPanel).toBeHidden();await recordPanels("form-ready");await writeFile(info.outputPath("panel-visibility.json"),JSON.stringify(panels,null,2));
    await expect(summary.getByRole("button",{name:"Edit form",exact:true})).toBeEnabled();
    await summary.getByRole("button",{name:"Edit form",exact:true}).click();
    const title=dialog(page).getByLabel("Form name",{exact:true});await expect(title).toHaveValue("Winter Skills Clinic");await expect(title).toBeEnabled();
    await title.fill("Ready Winter draft");await section(page,"Questions");await section(page,"Basics");await expect(title).toHaveValue("Ready Winter draft");
    await expect(save(page)).toHaveAttribute("data-state","dirty");expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
    await page.screenshot({path:info.outputPath("latest-form-editable.png")});
    await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();await dialog(page).getByRole("button",{name:"Discard changes",exact:true}).click();
    await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);await expect(summary.getByRole("button",{name:"Edit form",exact:true})).toBeFocused();
    expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
   }finally{state.readGate?.release();}
  });
  test("live form stays read only with public link and Close then Stop unlocks editing and tall price geometry",async({page},info)=>{
   const state=await backend(page,origin);await page.context().grantPermissions(["clipboard-read","clipboard-write"],{origin});await open(page,theme);await edit(page);
   await expect(dialog(page).getByText("Stop registrations before editing this form.",{exact:true})).toBeVisible();
   await expect(dialog(page).getByLabel("Form name",{exact:true})).toBeDisabled();await expect(dialog(page).getByRole("textbox",{name:"Description",exact:true})).toBeDisabled();await expect(save(page)).toHaveAttribute("aria-disabled","true");
   await expect(dialog(page).getByRole("button",{name:"Copy",exact:true})).toBeEnabled();await dialog(page).getByRole("button",{name:"Copy",exact:true}).click();
   expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain("/register/form-1");expect(state.writes).toHaveLength(0);
   await section(page,"Waiver");await expect(dialog(page).getByLabel("Waiver and consent",{exact:true})).toBeDisabled();
   await dialog(page).getByRole("button",{name:"Close",exact:true}).click();await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(0);
   await expect(page.getByRole("link",{name:"Download list",exact:true})).toHaveAttribute("href","/api/admin/registrations/export?formId="+formIds[0]);
   await page.getByRole("button",{name:"Stop registrations",exact:true}).click();await expect(page.locator(".registration-form-card[aria-pressed=true]")).toContainText("Not published");
   await edit(page);await expect(dialog(page).getByLabel("Form name",{exact:true})).toBeEnabled();await expect(dialog(page).getByRole("textbox",{name:"Description",exact:true})).toBeEnabled();
   await dialog(page).getByLabel("Form name",{exact:true}).fill("Editable after Stop");await section(page,"Price options");await dialog(page).getByRole("button",{name:"Add price",exact:true}).click();await dialog(page).getByLabel("Price name",{exact:true}).last().fill("Trial pass");await dialog(page).getByLabel("Trial pass amount in dollars",{exact:true}).fill("5.00");
   await saved(page);await expect(dialog(page).getByLabel("Trial pass amount in dollars",{exact:true})).toHaveAccessibleName("Trial pass amount in dollars");expect(state.forms.find(f=>f.id===formIds[0]).title).toBe("Editable after Stop");await expect(dialog(page).getByLabel("Price name",{exact:true})).toHaveCount(2);
   const geometry=await dialog(page).evaluate(el=>({popup:el.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight},footer:[...el.querySelectorAll("[data-slot=admin-dialog-footer] button")].map(b=>({text:b.textContent,box:b.getBoundingClientRect().toJSON(),lineHeight:getComputedStyle(b).lineHeight}))}));
   await writeFile(info.outputPath("tall-prices-dialog-geometry.json"),JSON.stringify(geometry));expect(await checkAdminDialog(page)).toEqual([]);
   await page.screenshot({path:info.outputPath("live-to-editable-prices.png")});expect(state.errors).toEqual([]);
  });
 });
}
test.describe("bounded controls",()=>{
 test.use({viewport:{width:320,height:640}});
 test("320 long names remain contained and selected archived data stays readable",async({page},info)=>{
  const state=await backend(page,origin);state.forms[0].title="A very long registration form for players and families from every part of our community ".repeat(3);state.entries[0].registrant_email="longunbroken".repeat(12)+"@example.test";state.entries[0].answers.player_name="Bartholomew-Maximilian Featherstonehaugh-Wolstenholme III";
  await open(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator("details:visible summary").first().click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("320-long.png"),fullPage:true});expect(state.errors).toEqual([]);
 });
 test("empty forms expose new creation and archived chip without invented pins",async({page})=>{
  const state=await backend(page,origin);state.forms.splice(0);state.entries.splice(0);await open(page);
  await expect(page.getByText("No registration forms yet. Create a form, add its fields and pricing, then publish it.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/^All forms/}).click();await dialog(page).getByRole("button",{name:/^Archived/}).click();
  await expect(dialog(page).getByText("No forms match. Try a different name or status.",{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);expect(state.errors).toEqual([]);
 });
 test("known rejected create remains safely retryable with latest draft",async({page})=>{
  const state=await backend(page,origin);await open(page);await page.getByRole("button",{name:"New form",exact:true}).click();await dialog(page).getByLabel("Form name",{exact:true}).fill("Rejected new form");await section(page,"Price options");await dialog(page).getByLabel("Registration amount in dollars",{exact:true}).fill("0");
  state.failTable="create";await save(page).click();await expect(save(page)).toHaveAttribute("data-state","dirty");await expect(page.getByText("Some changes may already be saved.",{exact:false})).toHaveCount(0);
  await section(page,"Basics");await dialog(page).getByLabel("Form name",{exact:true}).fill("Accepted new form");await saved(page);expect(state.forms.filter(f=>f.title==="Accepted new form")).toHaveLength(1);expect(state.writes.filter(w=>w.action==="create")).toHaveLength(2);expect(state.errors).toEqual([]);
 });
 test("ambiguous create retains draft and prevents duplicate unknown insert",async({page})=>{
  const state=await backend(page,origin);await open(page);await page.getByRole("button",{name:"New form",exact:true}).click();await dialog(page).getByLabel("Form name",{exact:true}).fill("Unconfirmed form");await section(page,"Price options");await dialog(page).getByLabel("Registration amount in dollars",{exact:true}).fill("0");state.uncertainCreate=true;
  await save(page).click();await expect(dialog(page).getByText("Reload and review before saving again. Your draft is retained.",{exact:true})).toBeVisible();
  await expect(save(page)).toHaveAttribute("data-state","clean");await expect(save(page)).toHaveAttribute("aria-disabled","true");await save(page).focus();await save(page).press("Enter");expect(state.writes.filter(w=>w.action==="create")).toHaveLength(1);
  await section(page,"Basics");await expect(dialog(page).getByLabel("Form name",{exact:true})).toHaveValue("Unconfirmed form");
  await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();await dialog(page).getByRole("button",{name:"Discard changes",exact:true}).click();
  await expect(dialog(page).getByRole("alert")).toContainText("could not be discarded");await dialog(page).getByRole("button",{name:"Keep editing",exact:true}).click();await expect(page.locator("[data-slot=admin-dialog]")).toHaveCount(1);
  await expect(dialog(page).getByLabel("Form name",{exact:true})).toHaveValue("Unconfirmed form");expect(state.forms.filter(f=>f.title==="Unconfirmed form")).toHaveLength(1);expect(state.writes.filter(w=>w.action==="create")).toHaveLength(1);expect(state.errors).toEqual([]);
 });
 test("partial create keeps confirmed identity and blocks further field or price inserts",async({page})=>{
  const state=await backend(page,origin);await open(page);await page.getByRole("button",{name:"New form",exact:true}).click();await dialog(page).getByLabel("Form name",{exact:true}).fill("Partial form");await section(page,"Price options");await dialog(page).getByLabel("Registration amount in dollars",{exact:true}).fill("0");state.failTable="registration_form_fields";state.failOperation="insert";
  await save(page).click();await expect(dialog(page).getByText("Reload and review before saving again. Your draft is retained.",{exact:true})).toBeVisible();await expect(save(page)).toHaveAttribute("data-state","clean");await save(page).focus();await save(page).press("Enter");
  expect(state.writes.filter(w=>w.action==="create")).toHaveLength(1);expect(state.writes.filter(w=>w.table==="registration_form_fields"&&w.action==="insert")).toHaveLength(1);expect(state.writes.filter(w=>w.table==="registration_price_options")).toHaveLength(0);
  await section(page,"Basics");await expect(dialog(page).getByLabel("Form name",{exact:true})).toHaveValue("Partial form");const created=state.forms.find(f=>f.title==="Partial form")!;expect(state.writes.find(w=>w.table==="registration_form_fields"&&w.action==="insert").values.every((f:any)=>f.form_id===created.id)).toBe(true);expect(state.errors).toEqual([]);
 });
 test("delete remains confirmed and uses existing lifecycle endpoint",async({page})=>{
  const state=await backend(page,origin);await open(page);await pick(page,"Summer Camp");await page.getByRole("button",{name:"Delete",exact:true}).click();
  await expect(dialog(page).getByText("Permanently delete this empty form? This cannot be undone.",{exact:true})).toBeVisible();expect(state.forms.some(f=>f.id===formIds[3])).toBe(true);
  await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();expect(state.forms.some(f=>f.id===formIds[3])).toBe(true);
  await page.getByRole("button",{name:"Delete",exact:true}).click();await dialog(page).getByRole("button",{name:"Delete form",exact:true}).click();await expect(page.locator(".registration-workspace-heading")).toHaveCount(0);
  expect(state.forms.some(f=>f.id===formIds[3])).toBe(false);expect(state.writes.at(-1).values).toEqual({action:"delete",formId:formIds[3]});expect(state.errors).toEqual([]);
 });
 test("payment account failure does not expose data before pending form list settles",async({page})=>{
  const state=await backend(page,origin);state.failConnect=true;state.readGate=gate();
  try {await open(page,"light","",false);await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","skeleton");await expect(page.getByRole("button",{name:"New form",exact:true})).toBeDisabled();await expect(page.locator(".registration-form-card-title")).toHaveCount(0);state.readGate.release();state.readGate=null;await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");await expect(page.getByText("Could not load Stripe Connect status.",{exact:true})).toBeVisible();expect(state.errors).toEqual([]);}finally{state.readGate?.release();}
 });
 test("form list failure does not reveal partial workspace before pending payment status settles",async({page})=>{
  const state=await backend(page,origin);state.failForms=true;state.connectGate=gate();
  try {
   await open(page,"light","",false);await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","skeleton");
   await expect(page.getByRole("button",{name:"New form",exact:true})).toBeDisabled();await expect(page.locator(".registration-form-card-title")).toHaveCount(0);await expect(page.getByLabel("Form name",{exact:true})).toHaveCount(0);
   state.connectGate.release();state.connectGate=null;
   await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase","content");await expect(page.getByText("Form list temporarily unavailable.",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"New form",exact:true})).toBeEnabled();expect(state.errors).toEqual([]);
  } finally {state.connectGate?.release();}
 });
 test("quiet save refresh preserves cards draft values and write sequence",async({page})=>{
  const state=await backend(page,origin);await open(page);await pick(page,"Winter Skills Clinic");await edit(page);
  await dialog(page).getByLabel("Form name",{exact:true}).fill("Updated browser fixture form");state.saveGate=gate();
  await save(page).click();await expect.poll(()=>state.writes.length).toBe(1);state.readGate=gate();state.saveGate.release();state.saveGate=null;
  try {
   await expect.poll(()=>state.writes.some(w=>w.table==="registration_form_fields"&&w.action==="insert")).toBe(true);
   await expect(page.locator(".registration-form-card").filter({hasText:"Winter Skills Clinic"})).toBeVisible();await expect(page.locator("[data-admin-skeleton-layer]")).toHaveCount(0);
   await expect(dialog(page).getByLabel("Form name",{exact:true})).toHaveValue("Updated browser fixture form");await expect(dialog(page).getByLabel("Form name",{exact:true})).toBeDisabled();await expect(save(page)).toHaveAttribute("aria-busy","true");
   state.readGate.release();state.readGate=null;await expect(save(page)).toHaveAttribute("data-state","saved");
   await expect(dialog(page).getByLabel("Form name",{exact:true})).toBeEnabled();expect(state.writes.map(w=>w.action+":"+w.table)).toEqual(expect.arrayContaining(["update:registration_forms","insert:registration_form_fields"]));expect(state.errors).toEqual([]);
  } finally {state.readGate?.release();}
 });

});
