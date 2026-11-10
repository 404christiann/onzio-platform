import { describe, expect, it } from "vitest";
import { DEFAULT_ABOUT_PAGE_CONTENT, DEFAULT_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { prepareAboutPageSave } from "@/lib/about-editor/save";
import { codeSiteAdminFor } from "@/lib/code-site-admin";

describe("code site admin choices", () => {
  it("resolves Diverse City's admin choices only for the Academy presentation", () => {
    const policy = codeSiteAdminFor({ presentationTemplateKey: "academy@1" });
    expect(policy?.programs).toMatchObject({ routeVisible: true, showSlugField: false, allowCreation: false, showPageCopyEditor: true });
    expect(policy?.shop).toMatchObject({ variants: ["home"], showHomeFeature: true, initialSurface: "shop" });
    expect(policy?.schedule.showMatchSponsorFields).toBe(false);
    expect(policy?.schedule.competitionShowsOnNextMatch).toBe(true);
    expect(codeSiteAdminFor({ presentationTemplateKey: "editorial@1" })).toBeNull();
    expect(codeSiteAdminFor({ presentationTemplateKey: null })).toBeNull();
  });

  it("saves the fixed About editor destination without changing the stored public fixture", () => {
    const about = { ...DEFAULT_ABOUT_PAGE_CONTENT, closing_cta_href: "/contact" };
    const base = { page: "about" as const, about, logo: DEFAULT_CLUB_LOGO_PAGE_CONTENT, now: "2026-11-02T00:00:00.000Z" };
    const fixedClosingCtaHref = codeSiteAdminFor({ presentationTemplateKey: "academy@1" })?.about.closingCtaHref ?? null;
    expect(prepareAboutPageSave({ ...base, fixedClosingCtaHref })).toMatchObject({ content: { closing_cta_href: "/schedule" } });
    expect(prepareAboutPageSave({ ...base, fixedClosingCtaHref: null })).toMatchObject({ content: { closing_cta_href: "/contact" } });
    expect(about.closing_cta_href).toBe("/contact");
  });
});
