import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_PARTNERS,
  PARTNERSHIP_ROUTE,
  cinematicPartnersContentSchema,
  partnerAction,
  starterCinematicPartnersContent,
  type CinematicPartnersContent,
} from "@/lib/cinematic-partners-content";

const partner = (name: string, role = "Official partner") => ({ id: randomUUID(), name, role, logoAssetId: null, tone: "original" as const });

function sam(): CinematicPartnersContent {
  const content = starterCinematicPartnersContent();
  content.pages.opportunities.intro = "Interested in becoming a sponsor for your business?";
  content.partners = [partner("Foothill Transit", "Main partner & front of jersey sponsor"), partner("MVMNT CULTR", "Official sports recovery partner")];
  return content;
}

describe("cinematic Partners content rules", () => {
  it("starts an unseeded club with both page headings and no invented partners", () => {
    const starter = starterCinematicPartnersContent();
    expect(starter.pages.partners.title).toBe("Club Partners");
    expect(starter.pages.opportunities.title).toBe("Partnership Opportunities");
    expect(starter.pages.partners.subtitle).toBe("Fueled by our amazing partners");
    expect(starter.partners).toEqual([]);
    expect(cinematicPartnersContentSchema.safeParse(starter).success).toBe(true);
  });

  it("keeps one ordered partner list with a logo tone per partner", () => {
    const content = sam();
    content.partners[0].tone = "grey";
    const parsed = cinematicPartnersContentSchema.parse(content);
    expect(parsed.partners.map(row => row.name)).toEqual(["Foothill Transit", "MVMNT CULTR"]);
    expect(parsed.partners[0].tone).toBe("grey");
    expect(cinematicPartnersContentSchema.safeParse({ ...content, partners: [{ ...content.partners[0], tone: "sepia" }] }).success).toBe(false);
  });

  it(`allows at most ${MAX_PARTNERS} partners, each with a name and a unique id`, () => {
    const content = sam();
    expect(cinematicPartnersContentSchema.safeParse({ ...content, partners: Array.from({ length: MAX_PARTNERS }, (_, i) => partner(`Partner ${i}`)) }).success).toBe(true);
    expect(cinematicPartnersContentSchema.safeParse({ ...content, partners: Array.from({ length: MAX_PARTNERS + 1 }, (_, i) => partner(`Partner ${i}`)) }).success).toBe(false);
    expect(cinematicPartnersContentSchema.safeParse({ ...content, partners: [partner("  ")] }).success).toBe(false);
    expect(cinematicPartnersContentSchema.safeParse({ ...content, partners: [content.partners[0], { ...content.partners[1], id: content.partners[0].id }] }).success).toBe(false);
  });

  it("requires each page heading but allows a blank intro and role", () => {
    const content = sam();
    content.pages.partners.intro = "";
    content.partners[1].role = "";
    expect(cinematicPartnersContentSchema.safeParse(content).success).toBe(true);
    expect(cinematicPartnersContentSchema.safeParse({ ...content, pages: { ...content.pages, partners: { ...content.pages.partners, title: " " } } }).success).toBe(false);
  });

  it("sends the Club Partners button to Partnership Opportunities", () => {
    expect(partnerAction(sam(), "partners")).toEqual({ prompt: "Interested in becoming a sponsor or partner?", label: "Partnerships", href: PARTNERSHIP_ROUTE });
    expect(PARTNERSHIP_ROUTE).toBe("/community/partnership");
  });

  it("hides the Partnership Opportunities button until the owner saves a destination", () => {
    const content = sam();
    expect(partnerAction(content, "opportunities")).toBeNull();
    content.pages.opportunities.ctaHref = "mailto:partners@example.com";
    expect(partnerAction(content, "opportunities")?.href).toBe("mailto:partners@example.com");
    content.pages.opportunities.ctaLabel = "";
    expect(partnerAction(content, "opportunities")).toBeNull();
  });

  it.each(["javascript:alert(1)", "//other.example", "https://user:pass@example.com", "https://127.0.0.1/form"])("rejects unsafe button destination %s", href => {
    const content = sam();
    content.pages.opportunities.ctaHref = href;
    expect(cinematicPartnersContentSchema.safeParse(content).success).toBe(false);
  });

  it("rejects invented keys", () => {
    const content = sam();
    expect(cinematicPartnersContentSchema.safeParse({ ...content, pages: { ...content.pages, news: content.pages.partners } }).success).toBe(false);
    expect(cinematicPartnersContentSchema.safeParse({ ...content, partners: [{ ...content.partners[0], url: "https://example.com" }] }).success).toBe(false);
  });
});
