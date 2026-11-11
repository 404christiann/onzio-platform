import { describe, expect, it } from "vitest";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import {
  canAddSponsorLogo,
  characterCount,
  diffSponsorList,
  diffSponsorLogos,
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  normalizeSponsorWebsite,
  savedSponsorName,
  SPONSOR_PLACEMENT_SWITCH,
  sponsorDraftFromRow,
  sponsorLimitForPlacement,
  sponsorListProblems,
  sponsorNameFromFile,
  sponsorsForPlacement,
  sponsorStoragePathFromPublicUrl,
  sponsorWebsiteDomain,
  type SponsorDraft,
} from "@/lib/sponsor-content";

describe("sponsor placement limits", () => {
  it("caps carousel and footer placements differently", () => {
    expect(MAX_CAROUSEL_SPONSORS).toBe(10);
    expect(MAX_FOOTER_SPONSORS).toBe(6);
    expect(sponsorLimitForPlacement("carousel")).toBe(10);
    expect(sponsorLimitForPlacement("footer")).toBe(6);
  });

  it.each([
    ["carousel", 9, true],
    ["carousel", 10, false],
    ["footer", 5, true],
    ["footer", 6, false],
  ] as const)("returns %s at %i logos for %s", (placement, count, expected) => {
    expect(canAddSponsorLogo(placement, count)).toBe(expected);
  });
});

describe("sponsorStoragePathFromPublicUrl", () => {
  it("extracts only site-sponsor paths from the sponsors bucket", () => {
    expect(
      sponsorStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/sponsors/site-sponsors/carousel/logo%201.png",
      ),
    ).toBe("site-sponsors/carousel/logo 1.png");
  });

  it("does not return legacy sponsor root paths", () => {
    expect(
      sponsorStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/sponsors/legacy-logo.png",
      ),
    ).toBeNull();
  });

  it("extracts a versioned Onzio branding path", () => {
    expect(
      sponsorStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/branding/44444444-4444-4444-8444-444444444444.png",
      ),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/branding/44444444-4444-4444-8444-444444444444.png",
    );
  });
});

const row = (id: string, order: number, homepage: boolean, footer: boolean, extra: Partial<DBSiteSponsorLogo> = {}): DBSiteSponsorLogo => ({
  id,
  placement: null,
  name: id.toUpperCase(),
  logo_url: `${id}.png`,
  sort_order: order,
  show_on_homepage: homepage,
  show_in_footer: footer,
  website_url: null,
  created_at: "",
  ...extra,
});

describe("diffSponsorLogos (classic page, one place at a time)", () => {
  // a: homepage only; b: both places; c: footer only.
  const all = [row("a", 0, true, false), row("b", 1, true, true), row("c", 2, false, true)];

  it("returns no writes when nothing changed", () => {
    expect(diffSponsorLogos("carousel", all, [
      { id: "a", name: "A", logo_url: "a.png" },
      { id: "b", name: "B", logo_url: "b.png" },
    ])).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
  });

  it("deletes a logo only its own place showed, and only turns the switch off for one both places show", () => {
    const fromHomepage = diffSponsorLogos("carousel", all, []);
    expect(fromHomepage.toDelete.map((logo) => logo.id)).toEqual(["a"]);
    expect(fromHomepage.toUpdate).toEqual([{ id: "b", changes: { show_on_homepage: false } }]);

    const fromFooter = diffSponsorLogos("footer", all, [{ id: "c", name: "C", logo_url: "c.png" }]);
    expect(fromFooter.toDelete).toEqual([]);
    expect(fromFooter.toUpdate).toEqual([{ id: "b", changes: { show_in_footer: false } }]);
  });

  it("reorders inside the place's own positions and leaves the other place's logos where they are", () => {
    const result = diffSponsorLogos("footer", all, [
      { id: "c", name: "C", logo_url: "c.png" },
      { id: "b", name: "B", logo_url: "b.png" },
    ]);
    expect(result.toUpdate).toEqual([
      { id: "c", changes: { sort_order: 1 } },
      { id: "b", changes: { sort_order: 2 } },
    ]);
  });

  it("adds a new logo at the end with only its place's switch on, and renames and replaces", () => {
    const result = diffSponsorLogos("carousel", all, [
      { id: "a", name: "A renamed", logo_url: "new-a.png" },
      { id: "b", name: "B", logo_url: "b.png" },
      { id: null, name: "", logo_url: "d.png" },
    ]);
    expect(result.toUpdate).toEqual([{ id: "a", changes: { name: "A renamed", logo_url: "new-a.png" } }]);
    expect(result.toInsert).toEqual([
      { name: "Sponsor 3", logo_url: "d.png", sort_order: 3, show_on_homepage: true, show_in_footer: false },
    ]);
  });

  it("cuts a long name to 60 characters", () => {
    const result = diffSponsorLogos("carousel", [], [{ id: null, name: "x".repeat(70), logo_url: "x.png" }]);
    expect(result.toInsert[0].name).toBe("x".repeat(60));
  });
});

describe("one-list page", () => {
  const saved = [row("a", 0, true, false), row("b", 1, true, true, { website_url: "https://b.example" })];
  const drafts = (): SponsorDraft[] => saved.map(sponsorDraftFromRow);

  it("writes nothing when nothing changed", () => {
    expect(diffSponsorList(saved, drafts())).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
  });

  it("writes the order on the page, the switches, the website, removals and new sponsors", () => {
    const [a, b] = drafts();
    const result = diffSponsorList(saved, [
      { ...b, footer: false, website: "" },
      { key: "new-1", id: null, name: "Summit Coffee", logo_url: "s.png", website: "summitcoffee.com", homepage: true, footer: true },
    ]);
    expect(result.toDelete.map((logo) => logo.id)).toEqual([a.id]);
    expect(result.toUpdate).toEqual([{ id: "b", changes: { sort_order: 0, website_url: null, show_in_footer: false } }]);
    expect(result.toInsert).toEqual([
      { name: "Summit Coffee", logo_url: "s.png", sort_order: 1, show_on_homepage: true, show_in_footer: true, website_url: "https://summitcoffee.com" },
    ]);
  });

  it.each([
    ["", { ok: true, value: null }],
    ["  kimshardware.com ", { ok: true, value: "https://kimshardware.com" }],
    ["http://kims.example/a?b=1", { ok: true, value: "http://kims.example/a?b=1" }],
    ["HTTPS://Kims.Example", { ok: true, value: "HTTPS://Kims.Example" }],
    ["kims hardware", { ok: false }],
    ["localhost", { ok: false }],
    ["javascript:alert(1)", { ok: false }],
    ["mailto:kim@example.com", { ok: false }],
    [`https://e.com/${"a".repeat(2_040)}`, { ok: false }],
  ])("reads %j as a website", (input, expected) => {
    const result = normalizeSponsorWebsite(input);
    expect(result.ok).toBe(expected.ok);
    if (expected.ok && result.ok) expect(result.value).toBe((expected as { value: string | null }).value);
  });

  it("shows only the domain, cut with an ellipsis", () => {
    expect(sponsorWebsiteDomain("https://www.kimshardware.com/sponsors?x=1")).toBe("kimshardware.com");
    expect(sponsorWebsiteDomain(`https://${"a".repeat(50)}.example.com`, 22)).toBe(`${"a".repeat(21)}…`);
  });

  it("blocks a blank name, a bad website and a place over its limit, and ignores the footer where it is hidden", () => {
    const many = Array.from({ length: 7 }, (_, index): SponsorDraft => ({
      key: `k${index}`, id: null, name: `S${index}`, logo_url: "x.png", website: "", homepage: index < 3, footer: true,
    }));
    many[0] = { ...many[0], name: "   " };
    many[1] = { ...many[1], website: "not a site" };
    const shown = sponsorListProblems(many, true);
    expect(shown.fields).toEqual([
      { key: "k0", field: "name", message: "Give this sponsor a name." },
      { key: "k1", field: "website", message: "Use a web address like theirshop.com." },
    ]);
    expect(shown.footerOver).toBe(true);
    expect(shown.homepageOver).toBe(false);
    expect(sponsorListProblems(many, false).footerOver).toBe(false);
  });

  it("counts characters as the database does", () => {
    expect(characterCount("😀".repeat(60))).toBe(60);
    expect(sponsorListProblems([{ key: "e", id: null, name: "😀".repeat(60), logo_url: "", website: "", homepage: true, footer: false }], true).fields).toEqual([]);
    expect(savedSponsorName("😀".repeat(61), 0)).toBe("😀".repeat(60));
  });

  it("names a new sponsor from its file, within 60", () => {
    expect(sponsorNameFromFile("kims-hardware_logo.png")).toBe("kims hardware logo");
    expect(characterCount(sponsorNameFromFile(`${"a".repeat(80)}.webp`))).toBe(60);
  });

  it("picks each place's sponsors from the one list", () => {
    const all = [row("a", 0, true, false), row("b", 1, true, true), row("c", 2, false, true)];
    expect(sponsorsForPlacement("carousel", all).map((logo) => logo.id)).toEqual(["a", "b"]);
    expect(sponsorsForPlacement("footer", all).map((logo) => logo.id)).toEqual(["b", "c"]);
    expect(SPONSOR_PLACEMENT_SWITCH).toEqual({ carousel: "show_on_homepage", footer: "show_in_footer" });
  });
});
