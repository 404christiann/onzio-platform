import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
export function gate() { let release = () => {}; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
export const formIds = Array.from({ length: 7 }, (_, i) => "24242424-0000-4000-8000-" + String(i + 1).padStart(12, "0"));
export async function backend(page: Page, origin: string) {
 const forms: any[] = formIds.map((id, i) => ({ id, slug: "form-" + (i + 1), title: ["Fall Academy", "Winter Skills Clinic", "Special Kickers", "Summer Camp", "Futsal", "Archived Academy", "Closed Clinic"][i], description: "A registration form for our community.", participant_mode: i === 2 ? "both" : "minor_only", waiver_text: "I agree to the club waiver and release of liability.", status: i === 0 ? "open" : i === 6 ? "closed" : "draft", archived_at: i === 5 ? "2026-10-01T00:00:00Z" : null, created_at: "2026-11-" + String(20-i).padStart(2,"0") + "T00:00:00Z" }));
 const fields: any[] = forms.flatMap(form => [{ id: randomUUID(), form_id: form.id, field_key: "medical_notes", label: "Medical notes", field_type: "long_text", options: [], required: false, is_core: false, participant_scope: "all", position: 20 }]);
 const prices: any[] = forms.flatMap(form => [{ id: randomUUID(), form_id: form.id, label: "Season registration", amount_cents: 28500, active: true, position: 0 }]);
 const entries: any[] = Array.from({length: 8},(_,i)=>({id:randomUUID(),form_id:formIds[0],registrant_email:"guardian"+i+"@example.test",participant_type:"minor",answers:{player_name:["Mateo Alvarez","Priya Raman","Jordan Kim","Jo"][i%4],guardian_name:"Family Guardian",emergency_contact_name:"Emergency Contact",medical_notes:"No restrictions",consent_signature:"data:image/png;base64,signature"},price_label:"Season registration",amount_cents:28500,status:i===6?"refunded":i===7?"expired":"paid",submitted_at:"2026-11-15T12:00:00Z",payment_recovery_required:i===7,payment_recovery_reason:i===7?"Late completion":null,registrant_email_status:i===0?"failed":"sent",admin_email_status:"sent",email_error:i===0?"Delivery failed":null}));
 const state = { forms, fields, prices, entries, reads: [] as any[], writes: [] as any[], errors: [] as string[], readGate: null as ReturnType<typeof gate>|null, saveGate: null as ReturnType<typeof gate>|null, failTable: "" as string, failOperation: "insert", definiteError: true, uncertainCreate: false, connect: {connected:true,chargesEnabled:true,payoutsEnabled:true}, connectGate: null as ReturnType<typeof gate>|null, failConnect:false, failForms:false, expectedHttpErrors:0 };
 page.on("pageerror", error => state.errors.push(error.message));
 page.on("console", message => { if(message.type()!=="error")return; if(state.expectedHttpErrors>0 && /Failed to load resource:.*status of (403|503)/.test(message.text()))state.expectedHttpErrors--; else state.errors.push(message.text()); });
 await page.route("**/*",async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname==="/favicon.ico")return route.fulfill({status:204});
  if(url.pathname==="/admin/roster")return route.fulfill({contentType:"text/html",body:"<!doctype html><h1>Roster destination</h1>"});
  if(url.pathname==="/api/stripe/connect" && url.searchParams.get("action")==="status") {
   await state.connectGate?.promise;
   if(state.failConnect){state.expectedHttpErrors++;return route.fulfill({status:503,json:{error:"Account unavailable"}});}
   return route.fulfill({json:state.connect});
  }
  if(url.pathname==="/api/admin/registrations"){
   const body=request.postDataJSON();state.writes.push({table:"registration_forms",action:body.action,values:body});
   await state.saveGate?.promise;
   if(body.action==="create"){
    const id=randomUUID(),form={id,slug:"created-"+state.forms.length,title:body.title,description:body.description,participant_mode:body.participantMode,waiver_text:body.waiverText,status:"draft",archived_at:null,created_at:"2026-12-01T00:00:00Z"};
    if(state.definiteError && state.failTable==="create"){state.failTable="";state.expectedHttpErrors++;return route.fulfill({status:403,json:{error:{code:"FORBIDDEN"}}});}
    state.forms.unshift(form);
    if(state.uncertainCreate){state.uncertainCreate=false;state.expectedHttpErrors++;return route.fulfill({status:503,json:{error:{message:"Response interrupted"}}});}
    return route.fulfill({status:201,json:{form}});
   }
   const form=state.forms.find(f=>f.id===body.formId);
   if(body.action==="delete"){state.forms.splice(state.forms.indexOf(form),1);return route.fulfill({json:{success:true}});}
   if(body.action==="archive"){form.archived_at="2026-11-15T00:00:00Z";if(form.status==="open")form.status="closed";}
   else form.status=body.action==="publish"?"open":"closed";
   return route.fulfill({json:{form}});
  }
  if(url.pathname!=="/__cl24__/data")return route.continue();
  const query=request.postDataJSON();
  if(query.action==="select")state.reads.push(query);else state.writes.push(query);
  let rows=query.table==="registration_forms"?state.forms:query.table==="registration_form_fields"?state.fields:query.table==="registration_price_options"?state.prices:query.table==="registrations"?state.entries:[];
  const matched=rows.filter((row:any)=>query.filters.every(([key,value]:[string,unknown])=>row[key]===value));
  if(query.action==="select"){
   await state.readGate?.promise;
   if(state.failForms&&query.table==="registration_forms")return route.fulfill({json:{data:null,error:{message:"Form list temporarily unavailable."}}});
   let data=[...matched];
   if(query.order){const [key,asc]=query.order;data.sort((a,b)=>(typeof a[key]==="number" && typeof b[key]==="number" ? a[key]-b[key] : String(a[key]).localeCompare(String(b[key])))*(asc?1:-1));}
   if(query.range)data=data.slice(query.range[0],query.range[1]+1);
   return route.fulfill({json:{data:query.single?data[0]??null:data,error:null}});
  }
  await state.saveGate?.promise;
  if(state.failTable===query.table&&state.failOperation===query.action){
   state.failTable="";return route.fulfill({json:{data:null,error:{message:"Simulated write rejection",...(state.definiteError?{code:"42501"}:{})}}});
  }
  let affected:any[]=matched;
  if(query.action==="delete"){for(const row of matched)rows.splice(rows.indexOf(row),1);}
  if(query.action==="update"){for(const row of matched)Object.assign(row,query.values);}
  if(query.action==="insert"){affected=(Array.isArray(query.values)?query.values:[query.values]).map((v:any)=>({...v,id:randomUUID()}));rows.push(...affected);}
  return route.fulfill({json:{data:query.single?affected[0]??null:affected,error:null}});
 });
 return state;
}
