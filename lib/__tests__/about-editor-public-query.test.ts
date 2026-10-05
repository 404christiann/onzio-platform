import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase",()=>({supabase:{from:vi.fn()}}));
import { fetchAboutClubContent } from "../queries";
import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "../about-content";
import { newLogoFeature } from "../about-editor/collections";
it("actual public About query preserves normalized nested Logo storage URLs with trusted origin",async()=>{
 const clubId="11111111-1111-4111-8111-111111111111";
 const path=`/storage/v1/object/public/onzio-media/${clubId}/about/22222222-2222-4222-8222-222222222222.png`;
 vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54321");
 const rows={about_page_content:{...EMPTY_ABOUT_PAGE_CONTENT,feature_image_url:path},club_logo_page_content:{...EMPTY_CLUB_LOGO_PAGE_CONTENT,
 features:[{...newLogoFeature(),patch_url:path,icon_url:path}],color_cards:[{label:"Red",image_url:path}]}};
 const from=vi.fn((table:keyof typeof rows)=>({select:()=>({eq:(_key:string,id:string)=>{
  expect(id).toBe(clubId);return {limit:()=>Promise.resolve({data:[rows[table]],error:null})};
 }})}));
 try{
 const content=await fetchAboutClubContent(clubId,{from} as unknown as Parameters<typeof fetchAboutClubContent>[1]);
 expect(content.logo.features[0].patch_url).toBe(`http://127.0.0.1:54321${path}`);
 expect(content.logo.features[0].icon_url).toBe(`http://127.0.0.1:54321${path}`);
 expect(content.logo.color_cards[0].image_url).toBe(`http://127.0.0.1:54321${path}`);
 expect(content.about.feature_image_url).toBe(`http://127.0.0.1:54321${path}`);
 }finally{vi.unstubAllEnvs();}
});

it("public Logo query repairs legacy null and nonarray JSON before hydration",async()=>{
 const from=vi.fn((table:string)=>({select:()=>({eq:()=>({limit:()=>Promise.resolve({data:table==="about_page_content"?[]:[{...EMPTY_CLUB_LOGO_PAGE_CONTENT,features:[null,{title:"Legacy",description:""}],color_cards:null}],error:null})})})}));
 const content=await fetchAboutClubContent("11111111-1111-4111-8111-111111111111",{from} as unknown as Parameters<typeof fetchAboutClubContent>[1]);
 expect(content.logo.features).toEqual([{title:"Legacy",description:"",patch_url:"",icon_url:"",icon_size:70,icon_scale:1}]);expect(content.logo.color_cards).toEqual([]);
});
