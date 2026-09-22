import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";
import { saveRequest } from "../fixtures/homepage-editor";

type SaveSchema = { safeParse: (value: unknown) => { success: boolean } };

async function schema() {
  return loadContract<SaveSchema>("@/lib/homepage-editor/contract", "homepageSaveRequestSchema");
}

describe("combined homepage save payload", () => {
  it("accepts all changed sections in one request with a stable operation and baseline", async () => {
    expect((await schema()).safeParse(saveRequest()).success).toBe(true);
  });

  it.each(["operationId", "expectedRevision", "designRevision"] as const)("rejects a request without %s", async (field) => {
    const request: Record<string, unknown> = saveRequest();
    delete request[field];
    expect((await schema()).safeParse(request).success).toBe(false);
  });

  it.each(["club_id", "clubId", "role", "tier", "host"])("rejects client authority supplied as %s", async (field) => {
    expect((await schema()).safeParse({ ...saveRequest(), [field]: "forged" }).success).toBe(false);
  });

  it("rejects a video source edit instead of silently accepting or stripping it", async () => {
    const request = saveRequest();
    request.sections.video = { ...request.sections.video, video_url: "https://video.example.test/forged" } as typeof request.sections.video;
    expect((await schema()).safeParse(request).success).toBe(false);
  });

  it("rejects arbitrary photo URLs instead of trusting recovered browser data", async () => {
    const request = saveRequest();
    Object.assign(request.sections.photos.items[0], { url: "https://foreign.example.test/photo.webp" });
    expect((await schema()).safeParse(request).success).toBe(false);
  });

  it("accepts six photos with explicit unique identities and contiguous order", async () => {
    const request = saveRequest();
    request.sections.photos.items = Array.from({ length: 6 }, (_, order) => ({
      clientId: `new-${order}`,
      rowId: null,
      assetId: `77777777-7777-4777-8777-${String(order + 1).padStart(12, "0")}`,
      alt: `Photo ${order + 1}`,
      order,
    }));
    expect((await schema()).safeParse(request).success).toBe(true);
  });

  it("rejects seven photos", async () => {
    const request = saveRequest();
    request.sections.photos.items = Array.from({ length: 7 }, (_, order) => ({
      clientId: `new-${order}`, rowId: null,
      assetId: `77777777-7777-4777-8777-${String(order + 1).padStart(12, "0")}`,
      alt: `Photo ${order + 1}`, order,
    }));
    expect((await schema()).safeParse(request).success).toBe(false);
  });

  it("rejects duplicated photo identity", async () => {
    const request = saveRequest();
    request.sections.photos.items[1] = { ...request.sections.photos.items[0], order: 1 };
    expect((await schema()).safeParse(request).success).toBe(false);
  });

  it("rejects noncontiguous order rather than relying on an implicit sort", async () => {
    const request = saveRequest();
    request.sections.photos.items[1].order = 4;
    expect((await schema()).safeParse(request).success).toBe(false);
  });

  it("retains the existing blank-description fallback behavior", async () => {
    const request = saveRequest();
    request.sections.photos.items[0].alt = "";
    expect((await schema()).safeParse(request).success).toBe(true);
  });

  it.each([
    ["heading", 120], ["bodyPrimary", 1200], ["bodySecondary", 1200], ["ctaLabel", 40],
  ] as const)("preserves the real story %s ceiling of %i", async (field, maximum) => {
    const contract = await schema();
    const atLimit = saveRequest();
    atLimit.sections.story[field] = "x".repeat(maximum);
    expect(contract.safeParse(atLimit).success).toBe(true);
    const overLimit = saveRequest();
    overLimit.sections.story[field] = "x".repeat(maximum + 1);
    expect(contract.safeParse(overLimit).success).toBe(false);
  });

  it.each([
    ["headline_line_one", 80], ["headline_line_two", 80], ["intro", 320],
  ] as const)("preserves the database hero %s ceiling of %i", async (field, maximum) => {
    const contract = await schema();
    const request = saveRequest();
    request.sections.hero[field] = "x".repeat(maximum);
    expect(contract.safeParse(request).success).toBe(true);
    request.sections.hero[field] += "x";
    expect(contract.safeParse(request).success).toBe(false);
  });
});
