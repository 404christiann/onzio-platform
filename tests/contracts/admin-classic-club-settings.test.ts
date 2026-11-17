import { describe, expect, it } from "vitest";
import { validateChangedSocialLink, brandingDirty, brandingStages, confirmBrandingStage, advanceBrandingSave, rejectBrandingSave, brandingPrewriteRejectionMessage, type BrandingDraft } from "@/components/admin/club-settings/branding-draft";
import { normalizeSiteSocialLinks } from "@/lib/social-links";

const original = (): BrandingDraft => ({
  logoPath: "original.png", tagline: "Original", links: normalizeSiteSocialLinks([]), configured: [],
});
const timestamp = "2026-11-15T12:00:00.000Z";

describe("classic Branding sequential saves", () => {
  it("retains the exact original stage after a partial success and a newer draft", () => {
    const baseline = original();
    const submitted = { ...baseline, logoPath: "new.png", tagline: "First edit" };
    const pending = brandingStages(submitted, baseline, true, timestamp);
    const afterLogo = confirmBrandingStage(baseline, pending.shift()!);
    const newer = { ...submitted, tagline: "Newer edit" };
    expect(afterLogo.logoPath).toBe("new.png");
    expect(afterLogo.tagline).toBe("Original");
    expect(pending).toEqual([{ kind: "tagline", value: "First edit", payload: { footer_tagline: "First edit", updated_at: timestamp } }]);
    const afterRetry = confirmBrandingStage(afterLogo, pending[0]);
    expect(brandingDirty(newer, afterRetry, true)).toBe(true);
    expect(brandingStages(newer, afterRetry, true, "next")[0]).toMatchObject({ kind: "tagline", value: "Newer edit" });
  });

  it("keeps an unsaved logo dirty when the draft changes during its original save", () => {
    const baseline = original();
    const stage = brandingStages({ ...baseline, logoPath: "first.png" }, baseline, false, timestamp)[0];
    const confirmed = confirmBrandingStage(baseline, stage);
    expect(brandingDirty({ ...baseline, logoPath: "second.png" }, confirmed, false)).toBe(true);
    expect(confirmed.logoPath).toBe("first.png");
  });

  it("does not invent social rows when saving only a tagline", () => {
    const baseline = original();
    expect(brandingStages({ ...baseline, tagline: "Edited" }, baseline, true, timestamp).map((stage) => stage.kind)).toEqual(["tagline"]);
  });

  it("preserves configured blank rows and the original platform sort order", () => {
    const baseline = original();
    const submitted: BrandingDraft = { ...baseline, configured: ["tiktok"], links: normalizeSiteSocialLinks([]) };
    const [stage] = brandingStages(submitted, baseline, true, timestamp);
    expect(stage.kind).toBe("social");
    if (stage.kind !== "social") throw new Error("Expected social stage");
    expect(stage.payload).toEqual([{ id: "tiktok", label: "TikTok", href: "", icon: "/images/logo/tiktokLogo.svg", sort_order: 2, updated_at: timestamp }]);
    expect(brandingDirty(submitted, confirmBrandingStage(baseline, stage), true)).toBe(false);
  });

  it("copies social requests so later input edits cannot change an uncertain retry", () => {
    const baseline = original();
    const submitted: BrandingDraft = { ...baseline, configured: ["instagram"], links: baseline.links.map((link) => ({ ...link, href: link.id === "instagram" ? "https://example.com/first" : "" })) };
    const [stage] = brandingStages(submitted, baseline, true, timestamp);
    submitted.links[0].href = "https://example.com/newer";
    submitted.configured.push("facebook");
    expect(stage.kind).toBe("social");
    if (stage.kind !== "social") throw new Error("Expected social stage");
    expect(stage.payload).toHaveLength(1);
    expect(stage.payload[0].href).toBe("https://example.com/first");
    expect(stage.configured).toEqual(["instagram"]);
    expect(brandingDirty(submitted, confirmBrandingStage(baseline, stage), true)).toBe(true);
  });

  it("uses the existing logo, social, tagline sequence", () => {
    const baseline = original();
    const draft: BrandingDraft = { ...baseline, logoPath: "", tagline: "New", configured: ["x"] };
    expect(brandingStages(draft, baseline, true, timestamp).map((stage) => stage.kind)).toEqual(["logo", "social", "tagline"]);
  });

  it("does not save an unsupported tagline and compares persisted trimmed values", () => {
    const baseline = original();
    expect(brandingStages({ ...baseline, tagline: "Changed" }, baseline, false, timestamp)).toEqual([]);
    expect(brandingDirty({ ...baseline, tagline: " Original " }, baseline, true)).toBe(false);
  });
});

describe("classic Branding outcome recovery", () => {
  const codes = ["INVALID_ADMIN_PAYLOAD", "AUTHENTICATION_REQUIRED", "SESSION_EXPIRED", "UNKNOWN_TENANT", "NOT_AUTHORIZED", "CLUB_ARCHIVED", "CLUB_INACTIVE", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_INACTIVE", "UNTRUSTED_TENANT_INPUT", "INVALID_CLUB"];
  it.each(codes)("recognizes the actual pre-write response %s without guessing from status or message", (code) => {
    expect(brandingPrewriteRejectionMessage(code)).toEqual(expect.any(String));
    expect(rejectBrandingSave({ stages: brandingStages({ ...original(), tagline: "Changed" }, original(), true, timestamp), uncertain: false }, code)).toEqual({ stages: [], uncertain: false });
  });

  it("drops rejected and unattempted stages without mutating the immutable original", () => {
    const baseline = original();
    const stages = brandingStages({ ...baseline, logoPath: "new.png", tagline: "First", configured: ["instagram"] }, baseline, true, timestamp);
    const next = rejectBrandingSave({ stages, uncertain: false }, "INVALID_ADMIN_PAYLOAD");
    expect(next.stages).toEqual([]);
    expect(stages.map((stage) => stage.kind)).toEqual(["logo", "social", "tagline"]);
  });

  it("retains an exact stage after unknown then definite rejection of a later attempt", () => {
    const stages = brandingStages({ ...original(), logoPath: "possibly-committed.png" }, original(), true, timestamp);
    const unknown = rejectBrandingSave({ stages, uncertain: false }, undefined);
    const rejectedLater = rejectBrandingSave(unknown, "SESSION_EXPIRED");
    expect(rejectedLater).toEqual({ stages, uncertain: true });
    expect(rejectedLater.stages).toBe(stages);
    expect(rejectedLater.stages[0]).toEqual({ kind: "logo", value: "possibly-committed.png", payload: { club_logo_path: "possibly-committed.png", updated_at: timestamp } });
  });

  it("never treats generic database, transport, status, prefix or message failures as proof of non-commit", () => {
    const stages = brandingStages({ ...original(), tagline: "First" }, original(), true, timestamp);
    for (const code of ["DATABASE_OPERATION_FAILED", "ADMIN_REQUEST_FAILED", "INVALID_SOMETHING", "OWNER_REQUIRED", 400, { status: 400 }, "request rejected", undefined]) {
      expect(brandingPrewriteRejectionMessage(code)).toBeUndefined();
      expect(rejectBrandingSave({ stages, uncertain: false }, code)).toEqual({ stages, uncertain: true });
    }
  });

  it("advances only a confirmed stage and resets uncertainty for the next stage", () => {
    const baseline = original();
    const stages = brandingStages({ ...baseline, logoPath: "new.png", tagline: "First" }, baseline, true, timestamp);
    const unknown = rejectBrandingSave({ stages, uncertain: false }, undefined);
    const confirmed = confirmBrandingStage(baseline, unknown.stages[0]);
    const advanced = advanceBrandingSave(unknown);
    expect(advanced.uncertain).toBe(false);
    expect(advanced.stages.map((stage) => stage.kind)).toEqual(["tagline"]);
    expect(rejectBrandingSave(advanced, "INVALID_ADMIN_PAYLOAD").stages).toEqual([]);
    expect(confirmed.logoPath).toBe("new.png");
  });

  it("preserves confirmed media and newer draft after partial success and a definite rejection", () => {
    const baseline = original();
    const submitted = { ...baseline, logoPath: "confirmed.png", tagline: "First", configured: ["instagram" as const] };
    const stages = brandingStages(submitted, baseline, true, timestamp);
    const confirmed = confirmBrandingStage(baseline, stages[0]);
    const rejected = rejectBrandingSave(advanceBrandingSave({ stages, uncertain: false }), "INVALID_ADMIN_PAYLOAD");
    const newer = { ...submitted, tagline: "Newer" };
    expect(rejected.stages).toEqual([]);
    expect(confirmed.logoPath).toBe("confirmed.png");
    expect(confirmed.tagline).toBe("Original");
    expect(brandingDirty(newer, confirmed, true)).toBe(true);
    expect(brandingStages(newer, confirmed, true, "next").map((stage) => stage.kind)).toEqual(["social", "tagline"]);
  });
});


describe("classic changed social URL validation", () => {
  it.each(["http://example.org/old", "mailto:club@example.org", "/club/social"])("grandfathers the unchanged baseline %s", (value) => {
    expect(validateChangedSocialLink(value, value)).toBeUndefined();
    expect(validateChangedSocialLink(`  ${value}  `, value)).toBeUndefined();
    expect(validateChangedSocialLink("", value)).toBeUndefined();
    expect(validateChangedSocialLink("https://example.org/new", value)).toBeUndefined();
    expect(validateChangedSocialLink(value + "/changed", value)).toContain("https://");
  });
  it.each(["http://example.org/new", "mailto:new@example.org", "/new", "not a URL", "https://", "https:example.org", "https://example.org/" + "x".repeat(2048)])("rejects new non-HTTPS or invalid link %s", (value) => {
    expect(validateChangedSocialLink(value, "")).toContain("https://");
  });
  it("compares against the latest confirmed baseline after a stage acknowledges", () => {
    const baseline = original();
    const submitted = { ...baseline, configured: ["instagram" as const], links: baseline.links.map((link) => link.id === "instagram" ? { ...link, href: "https://example.org/saved" } : link) };
    const [stage] = brandingStages(submitted, baseline, true, timestamp);
    const saved = confirmBrandingStage(baseline, stage);
    expect(validateChangedSocialLink("https://example.org/saved", saved.links[0].href)).toBeUndefined();
    expect(validateChangedSocialLink("http://example.org/newer", saved.links[0].href)).toContain("https://");
  });
});
