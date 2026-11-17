import type { Page } from "@playwright/test";
export const clubId="11111111-1111-4111-8111-111111111111";
export const seasonId="25252525-2525-4525-8525-252525252525";
export function gate(){let release=()=>{};const promise=new Promise<void>(resolve=>release=resolve);return{promise,release};}
export async function backend(page:Page,origin:string){
 const state={rows:Array.from({length:6},(_,i)=>({id:"25252525-0000-4000-8000-"+String(i+1).padStart(12,"0"),club_id:clubId,season_id:seasonId,team_name:["Alpha FC","Rockford Rovers","Wheaton Wanderers","Elgin United","Joliet Juniors","Aurora Athletic"][i],team_abbreviation:["AF","RR","WW","EU","JJ","AA"][i],logo_url:null,played:10,wins:8-i,draws:1,losses:1+i,goal_difference:14-i*3,points:25-i*3,is_club:i===0,sort_order:i,created_at:"2026-11-15T00:00:00Z",updated_at:"2026-11-15T00:00:00Z"})) as any[],settings:{id:1,eyebrow:"League standings",title:"League table",intro:"Our season.",updated_at:"2026-11-15T00:00:00Z"},seasons:[{id:seasonId,label:"2026",active:true,standings_from_scores:false},{id:"25252525-2525-4525-8525-252525252526",label:"2025",active:false,standings_from_scores:false}],writes:[] as any[],reads:[] as string[],requestedSeasons:[] as string[],errors:[] as string[],readGate:null as ReturnType<typeof gate>|null,saveGate:null as ReturnType<typeof gate>|null,uploadGate:null as ReturnType<typeof gate>|null,failRead:false,failTable:"",unknownInsert:false,insertAttempts:0,cleanup:[] as string[]};
 page.on("pageerror",e=>state.errors.push(e.message));
 await page.route("**/*",async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(url.pathname==="/favicon.ico")return route.fulfill({status:204});
  if(url.pathname==="/__cl25__/read"){
   const kind=url.searchParams.get("kind")!;state.reads.push(kind);if(kind==="standings")state.requestedSeasons.push(url.searchParams.get("season")??"");await state.readGate?.promise;
   if(state.failRead&&kind==="standings")return route.fulfill({json:{error:"Standings read unavailable"}});
   return route.fulfill({json:{data:kind==="seasons"?state.seasons:{settings:state.settings,rows:state.rows.filter(row=>!url.searchParams.get("season")||row.season_id===url.searchParams.get("season"))}}});
  }
  if(url.pathname==="/__cl25__/upload"){await state.uploadGate?.promise;return route.fulfill({json:{data:{path:req.postDataJSON().path},error:null}});}
  if(url.pathname==="/__cl25__/cleanup"){state.cleanup.push(...req.postDataJSON());return route.fulfill({json:{data:[],error:null}});}
  if(url.pathname!=="/__cl25__/data")return route.continue();
  const input=req.postDataJSON();
  const matches=(row:any)=>input.filters.every((filter:any)=>filter.kind==="in"?filter.value.includes(row[filter.column]):row[filter.column]===filter.value);
  if(input.operation==="select")return route.fulfill({json:{data:state.rows.filter(matches),error:null}});
  state.writes.push(input);await state.saveGate?.promise;
  if(state.failTable===input.table){state.failTable="";return route.fulfill({json:{data:null,error:{message:"Write rejected"}}});}
  if(input.table==="league_standings_settings"){state.settings=input.payload[0];return route.fulfill({json:{data:[state.settings],error:null}});}
  let affected:any[]=[];
  if(input.operation==="delete"){affected=state.rows.filter(matches);state.rows=state.rows.filter(row=>!matches(row));}
  else if(input.operation==="insert"){
   state.insertAttempts++;
   if(input.payload.some((row:any)=>state.rows.some(existing=>existing.id===row.id)))return route.fulfill({json:{data:null,error:{code:"23505",message:"Duplicate key"}}});
   affected=input.payload.map((row:any)=>({...row,club_id:clubId,created_at:"2026-11-15T00:00:00Z"}));state.rows.push(...affected);
   if(state.unknownInsert){state.unknownInsert=false;return route.abort("failed");}
  }else{affected=input.payload.map((row:any)=>({...state.rows.find(existing=>existing.id===row.id),...row}));for(const row of affected){const i=state.rows.findIndex(item=>item.id===row.id);if(i<0)throw Error("Lost persisted ID");state.rows[i]=row;}}
  return route.fulfill({json:{data:affected,error:null}});
 });
 return state;
}
