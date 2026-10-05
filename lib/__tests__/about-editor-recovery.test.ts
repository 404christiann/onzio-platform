import { afterEach, describe, expect, it, vi } from "vitest";
import { aboutEditorSaveSchema } from "../about-editor/contract";
import { saveAboutEditor } from "../about-editor/recovery";
import { aboutPageEditableContent, prepareAboutPageSave } from "../about-editor/save";
import { newAboutValue, newLogoFeature, newLogoColorCard, removeCollectionItem } from "../about-editor/collections";
import { hydrateAboutEditorMedia } from "../about-editor/media";
import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "../about-content";
const request = () => aboutEditorSaveSchema.parse({ page: "about", operationId: "11111111-1111-4111-8111-111111111111", expectedRevision: "0", designRevision: "design",
  content: aboutPageEditableContent(prepareAboutPageSave({ page: "about", about: EMPTY_ABOUT_PAGE_CONTENT, logo: EMPTY_CLUB_LOGO_PAGE_CONTENT, academy: true, now: "now" })) });
const reply = (value:unknown,status=200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("About exact operation recovery", () => {
  it.each(["network", "500"])("reconciles a committed %s response against the original receipt", async failure => {
    const input=request(), receipt={ page:"about",revision:"1",designRevision:"design",content:input.content };
    const fetcher=vi.fn().mockImplementationOnce(() => failure==="network"?Promise.reject(new Error("lost")):Promise.resolve(reply({error:{code:"DATABASE_OPERATION_FAILED"}},500)))
      .mockResolvedValueOnce(reply({operation:{status:"committed",receipt}}));vi.stubGlobal("fetch",fetcher);
    expect(await saveAboutEditor(input)).toEqual({status:"committed",snapshot:receipt});
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify(input));
    expect(fetcher.mock.calls[1][0]).toContain(`operationId=${input.operationId}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["unavailable", "not-committed"])("retains the exact request when receipt is %s, then reuses it",async failure=>{
    const input=request(), receipt={page:"about",revision:"1",designRevision:"design",content:input.content};
    const fetcher=vi.fn().mockRejectedValueOnce(new Error("lost"))
      .mockImplementationOnce(()=>failure==="unavailable"?Promise.reject(new Error("offline")):Promise.resolve(reply({operation:{status:"not-committed"}})))
      .mockResolvedValueOnce(reply(receipt));vi.stubGlobal("fetch",fetcher);
    const outcome=await saveAboutEditor(input);expect(outcome.status).toBe("uncertain");
    if(outcome.status!=="uncertain")throw new Error("Missing retry request");
    expect(outcome.request).toBe(input);expect(await saveAboutEditor(outcome.request)).toEqual({status:"committed",snapshot:receipt});
    expect(fetcher.mock.calls[2][1].body).toBe(fetcher.mock.calls[0][1].body);
  });
  it("returns a definite conflict without a fresh save or receipt probe",async()=>{
    const fetcher=vi.fn().mockResolvedValue(reply({error:{code:"ABOUT_CHANGED",message:"Latest page changed"}},409));vi.stubGlobal("fetch",fetcher);
    expect(await saveAboutEditor(request())).toEqual({status:"conflict",message:"Latest page changed"});expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe("selected About/Logo payload and empty authoring",()=>{
  it.each([null,0,true,{},[],"","-1","1".repeat(21)])("rejects revision %j",expectedRevision=>expect(aboutEditorSaveSchema.safeParse({...request(),expectedRevision}).success).toBe(false));
  it("rejects tenant/legacy metadata instead of trusting it",()=>{
    expect(aboutEditorSaveSchema.safeParse({...request(),club_id:"foreign"}).success).toBe(false);
    expect(aboutEditorSaveSchema.safeParse({...request(),content:{...request().content,updated_at:"now"}}).success).toBe(false);
  });
  it("creates and removes the first value, crest feature and color without fallback rows",()=>{
    const prepared=prepareAboutPageSave({page:"about",about:{...EMPTY_ABOUT_PAGE_CONTENT,values:[newAboutValue()]},logo:EMPTY_CLUB_LOGO_PAGE_CONTENT,academy:true,now:"now"});
    expect(prepared.content).toMatchObject({values:[{title:"New value",description:""}]});
    const logo=prepareAboutPageSave({page:"logo",about:EMPTY_ABOUT_PAGE_CONTENT,logo:{...EMPTY_CLUB_LOGO_PAGE_CONTENT,features:[newLogoFeature()],color_cards:[newLogoColorCard()]},academy:false,now:"now"});
    expect(logo.content).toMatchObject({features:[newLogoFeature()],color_cards:[newLogoColorCard()]});
    expect(removeCollectionItem([newLogoFeature()],0)).toEqual([]);expect(removeCollectionItem([newLogoColorCard()],0)).toEqual([]);expect(removeCollectionItem([newAboutValue()],0)).toEqual([]);
    expect(aboutPageEditableContent(logo)).not.toHaveProperty("updated_at");expect(aboutPageEditableContent(logo)).not.toHaveProperty("id");
  });
  it("hydrates all nested canonical Logo paths from the configured origin for public rendering",()=>{
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54321");
    const path="/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/about/22222222-2222-4222-8222-222222222222.png";
    const result=hydrateAboutEditorMedia({...EMPTY_CLUB_LOGO_PAGE_CONTENT,features:[{...newLogoFeature(),patch_url:path,icon_url:path}],color_cards:[{label:"Red",image_url:path}]});
    expect(result.features[0].patch_url).toBe(`http://127.0.0.1:54321${path}`);expect(result.features[0].icon_url).toBe(result.features[0].patch_url);expect(result.color_cards[0].image_url).toBe(result.features[0].patch_url);
    expect(hydrateAboutEditorMedia({...EMPTY_ABOUT_PAGE_CONTENT,feature_image_url:"/images/legacy.png"}).feature_image_url).toBe("/images/legacy.png");
  });
});
