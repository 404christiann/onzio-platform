import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { aboutEditorSaveSchema, type AboutEditorSaveRequest, type AboutEditorSnapshot } from "@/lib/about-editor/contract";
import { loadAboutDestinationOptions } from "@/lib/about-editor/destinations";
import { retirePublishedMedia } from "@/lib/media-processing";
import { hydrateAboutEditorMedia } from "@/lib/about-editor/media";
import { resolveMediaReferences } from "@/lib/media-assets";
import { onzioMediaStoragePathFromPublicUrl } from "@/lib/media-url";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const messages: Record<string,string> = {
  INVALID_ABOUT_PAYLOAD: "Review the page fields and try again.", INVALID_ABOUT_MEDIA: "Choose an available image for this club.",
  INVALID_ABOUT_DESTINATION: "Choose a page available to this club for the closing button.",
  ABOUT_CHANGED: "Someone changed this page. Your draft is still here. Review the latest page before saving again.",
  DESIGN_CHANGED: "The website design changed. Your draft is still here. Review the latest page before saving again.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  PAGE_UNAVAILABLE: "This website design does not publish a Club Logo page.", NOT_AUTHORIZED: "You no longer have permission to edit this page.",
  DATABASE_OPERATION_FAILED: "We could not confirm the save. Your draft is still here.",
};
function failure(code:string,status:number) {
 return NextResponse.json({error:{code,message:messages[code]??messages.DATABASE_OPERATION_FAILED}},{status,headers:{"Cache-Control":"no-store"}});
}
function databaseFailure(error:{code?:string;message?:string}) {
 const code=[error.message,error.code].find(value=>value&&Object.hasOwn(messages,value))??"DATABASE_OPERATION_FAILED";
 return failure(code,["ABOUT_CHANGED","DESIGN_CHANGED","OPERATION_REUSED"].includes(code)?409:code==="NOT_AUTHORIZED"?403:code==="PAGE_UNAVAILABLE"?404:code==="DATABASE_OPERATION_FAILED"?500:400);
}
function contentUrls(payload:AboutEditorSaveRequest) {
 return payload.page==="about"?[payload.content.feature_image_url]:[payload.content.annotated_image_url,payload.content.map_image_url,
 ...payload.content.features.flatMap(feature=>[feature.patch_url,feature.icon_url]),...payload.content.color_cards.map(card=>card.image_url)];
}
async function handle(request:Request,mutation:boolean) {
 if(mutation) {
  const origin=request.headers.get("origin"), external=new URL(request.url);external.host=request.headers.get("host")??external.host;
  if((origin&&origin!==external.origin)||request.headers.get("sec-fetch-site")==="cross-site") return failure("NOT_AUTHORIZED",403);
 }
 let payload:AboutEditorSaveRequest|undefined;
 const params=new URL(request.url).searchParams;
 let page=params.get("page"); const operationId=params.get("operationId");
 if(mutation) {
  let body:unknown;try{body=await request.json();}catch{return failure("INVALID_ABOUT_PAYLOAD",400);}
  const parsed=aboutEditorSaveSchema.safeParse(body);if(!parsed.success)return failure("INVALID_ABOUT_PAYLOAD",400);
  payload=parsed.data;page=payload.page;
 } else if(!["about","logo"].includes(page??"")||(operationId!==null&&!z.string().uuid().safeParse(operationId).success)) return failure("INVALID_ABOUT_PAYLOAD",400);
 const supabase=await createClient();let userId:string;
 try{({userId}=await requireFreshClubSession(supabase));}catch(error){return failure(error instanceof ContractError?error.code:"AUTHENTICATION_REQUIRED",403);}
 let club;try{club=await getClubContext({hostname:request.headers.get("host")??"",userId});}catch{return failure("UNKNOWN_TENANT",404);}
 if(!club)return failure("UNKNOWN_TENANT",404);

 const memberships=club.role?[{userId,clubId:club.id,role:club.role,status:"active"}]:[];
 try{
  if(mutation)await authorizeMutation({club,userId,memberships,aal:"aal1",feature:"about",payload:payload!});
  else await authorizeAdminAccess({club,userId,memberships,aal:"aal1",capability:"content"});
 }catch(error){return failure(error instanceof ContractError?error.code:"NOT_AUTHORIZED",403);}
 try{
  const onzio=supabase.schema("onzio");
  const rpc=onzio.rpc.bind(onzio) as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string;message?:string}|null}>;
  if(payload){
   // Receipt retries must survive a later navigation/design change. SQL still
   // compares the exact original payload before returning the actor's receipt.
   const lookup=await rpc("load_about_editor",{p_club_id:club.id,p_page:page,p_operation_id:payload.operationId});
   if(lookup.error)return databaseFailure(lookup.error);
   const committed=(lookup.data as AboutEditorSnapshot)?.operation?.status==="committed";
   if(!committed){
    const base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    for(const url of contentUrls(payload)){
     const path=onzioMediaStoragePathFromPublicUrl(url,"about");
     if(path&&(new URL(url).origin!==base.origin||!path.startsWith(`${club.id}/`)))return failure("INVALID_ABOUT_MEDIA",400);
    }
    if(payload.page==="about"){
     const options=await loadAboutDestinationOptions(supabase,club);
     if(club.presentationTemplateKey==="academy@1"?payload.content.closing_cta_href!=="/schedule":!options.some(option=>option.href===payload!.content.closing_cta_href))return failure("INVALID_ABOUT_DESTINATION",400);
    }
   }
  }
  const response=mutation?await rpc("save_about_editor",{p_club_id:club.id,p_request:payload}):await rpc("load_about_editor",{p_club_id:club.id,p_page:page,p_operation_id:operationId});
  if(response.error)return databaseFailure(response.error);if(!response.data)return failure("DATABASE_OPERATION_FAILED",500);
  const data=response.data as AboutEditorSnapshot;
  const committed=mutation?data:data.operation?.status==="committed"?data.operation.receipt:null;
  if(committed){
   const retired=committed.retiredMediaAssetIds??[];let pending=false;
   await Promise.all(retired.map(assetId=>retirePublishedMedia({clubId:club.id,actorId:userId,assetId}).then(result=>{if(result.cleanupQueued)pending=true;}).catch(()=>{pending=true;})));
   delete committed.retiredMediaAssetIds;committed.cleanupPending=pending;
  }
  // Hydrate the exact snapshot/receipt, never a second content read that could
  // associate a newer row with an older revision.
  for(const snapshot of [data,...(committed&&committed!==data?[committed]:[])]){
   if(!snapshot.content)continue;
   const refs=snapshot.page==="about"?[{assetId:"feature_image_asset_id",url:"feature_image_url"}]:[{assetId:"annotated_image_asset_id",url:"annotated_image_url"},{assetId:"map_image_asset_id",url:"map_image_url"}];
   snapshot.content=hydrateAboutEditorMedia((await resolveMediaReferences([snapshot.content as unknown as Record<string,unknown>],club.id,refs,onzio as unknown as Parameters<typeof resolveMediaReferences>[3]))[0] as unknown as typeof snapshot.content);
  }
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
 }catch{return failure("DATABASE_OPERATION_FAILED",500);}
}
export async function GET(request:Request){return handle(request,false);}
export async function POST(request:Request){return handle(request,true);}
