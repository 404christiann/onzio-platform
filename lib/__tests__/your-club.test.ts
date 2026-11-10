import { describe, expect, it } from "vitest";
import {
  EMPTY_SOCIAL,
  SOCIAL_PLATFORMS,
  YOUR_CLUB_LIMITS,
  changeSummary,
  cropGeometry,
  counterLabel,
  draftFromSaved,
  effectiveSocialHref,
  normalizeSocialInput,
  socialDisplay,
  validateYourClub,
  type YourClubDraft,
} from "@/lib/your-club";

// ADMIN-RE-14: the pure rules behind "Your club" (design: cd-your-club;
// group 3 decisions 10 and 11).

const BASE: YourClubDraft = {
  email: "info@example.com",
  phone: "(206) 555-0142",
  hours: "Mon–Fri, 10 am – 4 pm",
  area: "Seattle’s Eastside",
  footerLine: "Every kid, every Saturday.",
  social: { ...EMPTY_SOCIAL, facebook: "https://facebook.com/example" },
};
const SHOWN = { reach: true, footerLine: true };

describe("limits", () => {
  it("holds the numbers the design and the plan name", () => {
    expect(YOUR_CLUB_LIMITS.footerLine).toBe(160);
    expect(YOUR_CLUB_LIMITS.hours).toBe(200);
    expect(YOUR_CLUB_LIMITS.socialHref).toBe(2048);
  });

  it("lists the five social pages in the footer's order with the platform's own marks", () => {
    expect(SOCIAL_PLATFORMS.map((platform) => platform.id)).toEqual(["instagram", "facebook", "tiktok", "x", "youtube"]);
    for (const platform of SOCIAL_PLATFORMS) {
      expect(platform.icon).toBe(`/images/logo/${platform.id}Logo.svg`);
    }
  });
});

describe("normalizeSocialInput", () => {
  it("adds https:// to a bare address, as typed in the design", () => {
    expect(normalizeSocialInput("instagram.com/eastsideunited")).toBe("https://instagram.com/eastsideunited");
    expect(normalizeSocialInput("  www.tiktok.com/@eastside ")).toBe("https://www.tiktok.com/@eastside");
  });

  it("leaves a full web address alone and keeps a blank blank", () => {
    expect(normalizeSocialInput("https://x.com/eastside")).toBe("https://x.com/eastside");
    expect(normalizeSocialInput("http://x.com/eastside")).toBe("http://x.com/eastside");
    expect(normalizeSocialInput("   ")).toBe("");
  });

  it("does not turn something that is not an address into one", () => {
    expect(normalizeSocialInput("@eastside")).toBe("@eastside");
    expect(normalizeSocialInput("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(normalizeSocialInput("two words.com")).toBe("two words.com");
  });
});

describe("validateYourClub", () => {
  it("accepts the filled-in design page", () => {
    expect(validateYourClub(BASE, SHOWN)).toEqual({});
  });

  it("counts the footer line and the hours at their limits", () => {
    expect(validateYourClub({ ...BASE, footerLine: "a".repeat(160) }, SHOWN)).toEqual({});
    expect(validateYourClub({ ...BASE, footerLine: "a".repeat(161) }, SHOWN).footerLine).toMatch(/160/);
    expect(validateYourClub({ ...BASE, hours: "h".repeat(200) }, SHOWN)).toEqual({});
    expect(validateYourClub({ ...BASE, hours: "h".repeat(201) }, SHOWN).hours).toMatch(/200/);
  });

  it("checks the email and the phone the way the Contact page does", () => {
    expect(validateYourClub({ ...BASE, email: "not-an-email" }, SHOWN).email).toBeTruthy();
    expect(validateYourClub({ ...BASE, phone: "call me" }, SHOWN).phone).toBeTruthy();
    expect(validateYourClub({ ...BASE, email: "", phone: "" }, SHOWN)).toEqual({});
    expect(validateYourClub({ ...BASE, email: `${"a".repeat(250)}@x.co` }, SHOWN).email).toBeTruthy();
    expect(validateYourClub({ ...BASE, area: "z".repeat(121) }, SHOWN).area).toMatch(/120/);
  });

  it("rejects a social address that is too long or not a web address", () => {
    const long = `https://instagram.com/${"a".repeat(2048)}`;
    expect(validateYourClub({ ...BASE, social: { ...EMPTY_SOCIAL, instagram: long } }, SHOWN).instagram).toMatch(/2,048/);
    const exactly = `https://instagram.com/${"a".repeat(2048 - "https://instagram.com/".length)}`;
    expect(exactly).toHaveLength(2048);
    expect(validateYourClub({ ...BASE, social: { ...EMPTY_SOCIAL, instagram: exactly } }, SHOWN)).toEqual({});
    expect(validateYourClub({ ...BASE, social: { ...EMPTY_SOCIAL, x: "@eastside" } }, SHOWN).x).toBeTruthy();
    expect(validateYourClub({ ...BASE, social: { ...EMPTY_SOCIAL, x: "mailto:a@b.co" } }, SHOWN).x).toBeTruthy();
    expect(validateYourClub({ ...BASE, social: { ...EMPTY_SOCIAL, x: "javascript:alert(1)" } }, SHOWN).x).toBeTruthy();
  });

  it("accepts a bare address because Save adds https://", () => {
    expect(validateYourClub({ ...BASE, social: { ...EMPTY_SOCIAL, tiktok: "tiktok.com/@eastside" } }, SHOWN)).toEqual({});
  });

  it("ignores the sections the club's website does not have", () => {
    const bad = { ...BASE, email: "nope", footerLine: "a".repeat(500) };
    expect(validateYourClub(bad, { reach: false, footerLine: false })).toEqual({});
    expect(Object.keys(validateYourClub(bad, { reach: true, footerLine: false }))).toEqual(["email"]);
    expect(Object.keys(validateYourClub(bad, { reach: false, footerLine: true }))).toEqual(["footerLine"]);
  });
});

describe("counterLabel", () => {
  it("shows used over limit with a thousands separator", () => {
    expect(counterLabel("abc", 160)).toBe("3/160");
    expect(counterLabel("", 200)).toBe("0/200");
    expect(counterLabel("a".repeat(2048), 2048)).toBe("2,048/2,048");
  });
});

describe("socialDisplay", () => {
  it("shows the address without the scheme, as the design's fields do", () => {
    expect(socialDisplay("https://facebook.com/eastsideunited")).toBe("facebook.com/eastsideunited");
    expect(socialDisplay("http://www.x.com/a")).toBe("www.x.com/a");
    expect(socialDisplay("")).toBe("");
  });
});

describe("changeSummary", () => {
  it("is empty when nothing differs", () => {
    expect(changeSummary(BASE, { ...BASE, social: { ...BASE.social } }, SHOWN, false)).toEqual({
      logo: false,
      footerLine: false,
      social: [],
      reach: false,
      count: 0,
    });
  });

  it("counts each part once, and each social page on its own", () => {
    const next: YourClubDraft = {
      ...BASE,
      hours: "Mon–Fri, 9 am – 5 pm",
      phone: "(206) 555-0199",
      footerLine: "New line",
      social: { ...BASE.social, instagram: "instagram.com/eastside", youtube: "" },
    };
    expect(changeSummary(BASE, next, SHOWN, true)).toEqual({
      logo: true,
      footerLine: true,
      social: ["instagram"],
      reach: true,
      count: 4,
    });
  });

  it("does not count a social page typed with and without https:// as a change", () => {
    const next = { ...BASE, social: { ...BASE.social, facebook: "facebook.com/example" } };
    expect(changeSummary(BASE, next, SHOWN, false).count).toBe(0);
  });

  it("ignores edits to sections the club's website does not have", () => {
    const next = { ...BASE, hours: "x", footerLine: "y" };
    expect(changeSummary(BASE, next, { reach: false, footerLine: false }, false).count).toBe(0);
  });

  it("does not count a clear on a page that was never filled in", () => {
    expect(changeSummary(BASE, { ...BASE, social: { ...BASE.social, tiktok: "   " } }, SHOWN, false).count).toBe(0);
  });
});

describe("cropGeometry (Fit your logo)", () => {
  const FRAME = 240;

  it("fits a wide logo whole at zoom 1 and centers it", () => {
    const g = cropGeometry({ naturalWidth: 400, naturalHeight: 200, frame: FRAME, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(g.drawWidth).toBeCloseTo(240);
    expect(g.drawHeight).toBeCloseTo(120);
    expect(g.drawX).toBeCloseTo(0);
    expect(g.drawY).toBeCloseTo(60);
    expect(g.offsetX).toBe(0);
    expect(g.offsetY).toBe(0);
  });

  it("zooms around the center and lets the picture slide only as far as it covers the frame", () => {
    const g = cropGeometry({ naturalWidth: 200, naturalHeight: 200, frame: FRAME, zoom: 2, offsetX: 500, offsetY: -500 });
    expect(g.drawWidth).toBeCloseTo(480);
    // Half of the 240px overhang, so an edge of the picture meets an edge of the frame.
    expect(g.offsetX).toBeCloseTo(120);
    expect(g.offsetY).toBeCloseTo(-120);
    expect(g.drawX).toBeCloseTo(0);
    expect(g.drawY).toBeCloseTo(-240);
  });

  it("keeps a picture that is smaller than the frame in the middle whatever the offset", () => {
    const g = cropGeometry({ naturalWidth: 400, naturalHeight: 200, frame: FRAME, zoom: 1, offsetX: 80, offsetY: 80 });
    expect(g.offsetX).toBe(0);
    expect(g.offsetY).toBe(0);
  });

  it("limits zoom to 1 through 4", () => {
    expect(cropGeometry({ naturalWidth: 100, naturalHeight: 100, frame: FRAME, zoom: 0.2, offsetX: 0, offsetY: 0 }).zoom).toBe(1);
    expect(cropGeometry({ naturalWidth: 100, naturalHeight: 100, frame: FRAME, zoom: 9, offsetX: 0, offsetY: 0 }).zoom).toBe(4);
  });

  it("survives an image with no size", () => {
    const g = cropGeometry({ naturalWidth: 0, naturalHeight: 0, frame: FRAME, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(g.drawWidth).toBe(0);
    expect(Number.isFinite(g.drawX)).toBe(true);
  });
});

// The review bot's Medium on #117: a saved address that is not a lower-case
// https:// one with no port must not load as an unsaved change.
describe("a saved page that is shown and not touched is not a change", () => {
  const SAVED_ADDRESSES = [
    "https://instagram.com/club",
    "http://instagram.com/club",
    "HTTPS://Instagram.com/club",
    "https://instagram.com:443/club",
    "mailto:club@example.com",
    "/local/path",
  ];

  for (const address of SAVED_ADDRESSES) {
    it(`${address} loads clean and stays as saved`, () => {
      const saved: YourClubDraft = { ...BASE, social: { ...EMPTY_SOCIAL, instagram: address } };
      const draft = draftFromSaved(saved);
      const summary = changeSummary(saved, draft, SHOWN, false);
      expect(summary).toMatchObject({ social: [], count: 0 });
      // Nothing about it blocks a Save of something else.
      expect(effectiveSocialHref(saved.social.instagram, draft.social.instagram)).toBe(address);
    });
  }

  it("shows a saved address without its scheme", () => {
    const saved: YourClubDraft = { ...BASE, social: { ...EMPTY_SOCIAL, facebook: "http://facebook.com/a" } };
    expect(draftFromSaved(saved).social.facebook).toBe("facebook.com/a");
  });

  it("still sees a real edit, and an edit back to what was saved", () => {
    const saved: YourClubDraft = { ...BASE, social: { ...EMPTY_SOCIAL, instagram: "http://instagram.com/club" } };
    const edited = { ...draftFromSaved(saved), social: { ...EMPTY_SOCIAL, instagram: "instagram.com/other" } };
    expect(changeSummary(saved, edited, SHOWN, false).social).toEqual(["instagram"]);
    expect(effectiveSocialHref(saved.social.instagram, "instagram.com/other")).toBe("https://instagram.com/other");
    const back = { ...edited, social: { ...EMPTY_SOCIAL, instagram: "instagram.com/club" } };
    expect(changeSummary(saved, back, SHOWN, false).social).toEqual([]);
  });

  it("treats a cleared saved page as a change and an untouched blank as none", () => {
    const saved: YourClubDraft = { ...BASE, social: { ...EMPTY_SOCIAL, instagram: "https://instagram.com/club" } };
    expect(changeSummary(saved, { ...draftFromSaved(saved), social: { ...EMPTY_SOCIAL } }, SHOWN, false).social).toEqual(["instagram"]);
    expect(changeSummary(BASE, draftFromSaved(BASE), SHOWN, false).count).toBe(0);
  });
});
