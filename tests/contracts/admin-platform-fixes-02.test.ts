import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { clubLogoRedirectPath } from "@/lib/club-branding";
import { GRAPHIC_UPLOAD_ACCEPT, GRAPHIC_UPLOAD_MIME_TYPES } from "@/lib/media-upload-types";
import { validateClaimedMetadata } from "@/lib/media-validation";
import { DEFAULT_PROGRAM_REGISTRATION_CONTENT } from "@/lib/program-content";
import { NEW_REGISTRATION_FORM_PARTICIPANT_MODE } from "@/lib/registration-fields";
import { PLAYER_MAX_AGE, PLAYER_MIN_AGE, playerAgeError } from "@/lib/roster-player-age";
import { nextSeasonAfter } from "@/lib/season-label";
import { normalizeKitBuyLink, shopSaveRequestSchema } from "@/lib/shop-editor/contract";
import { siteRouteOptionsWithFallback } from "@/lib/site-routes";
import {
  DEFAULT_STANDINGS_SETTINGS,
  normalizeStandingsSettings,
} from "@/lib/standings-content";
import { DEFAULT_TRYOUTS_PAGE_CONTENT } from "@/lib/tryouts-page-content";
import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";

const source = (path: string) => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const OWNER: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "academy@1",
  isBillingAuthorized: true,
  canMutateContent: true,
  storeEnabled: true,
};

describe("1. Standings title", () => {
  it("never substitutes Rose City's league for a blank title", () => {
    expect(DEFAULT_STANDINGS_SETTINGS.title).toBe("");
    expect(JSON.stringify(DEFAULT_STANDINGS_SETTINGS)).not.toMatch(/Rose City|UPSL SoCal/);
    const normalized = normalizeStandingsSettings({
      id: 1, eyebrow: "Table", title: "   ", intro: "", updated_at: "",
    });
    expect(normalized.title).toBe("");
  });

  it("saves a blank title as blank and says where the title appears", () => {
    const page = source("app/admin/(protected)/standings/page.tsx");
    expect(page).not.toContain("DEFAULT_STANDINGS_SETTINGS.title");
    expect(page).toContain("Next Match card");
    expect(diverseCitySite.admin.standings.titleShowsOnNextMatch).toBe(true);
  });
});

describe("2. Browser tab icon without a logo", () => {
  it("does not fall back to the Rose City crest", () => {
    expect(clubLogoRedirectPath(undefined)).toBeNull();
    expect(clubLogoRedirectPath("")).toBeNull();
    expect(clubLogoRedirectPath("   ")).toBeNull();
    expect(clubLogoRedirectPath("club/crest.png")).toBe("club/crest.png");
    const route = source("app/%5Fclubs/[slug]/club-logo/route.ts");
    expect(route).not.toContain("DEFAULT_CLUB_LOGO_PATH");
    expect(route).toContain("status: 404");
  });
});

describe("3. Logo and sponsor uploads match what the server accepts", () => {
  it("offers only the graphic types the media server accepts", () => {
    expect([...GRAPHIC_UPLOAD_MIME_TYPES]).toEqual(["image/png", "image/webp"]);
    expect(GRAPHIC_UPLOAD_ACCEPT).toBe("image/png,image/webp");
    expect(() => validateClaimedMetadata({ fileName: "logo.jpg", mimeType: "image/jpeg", size: 100, kind: "graphic" })).toThrow();
    for (const mimeType of GRAPHIC_UPLOAD_MIME_TYPES) {
      const fileName = mimeType === "image/png" ? "logo.png" : "logo.webp";
      expect(() => validateClaimedMetadata({ fileName, mimeType, size: 100, kind: "graphic" })).not.toThrow();
    }
  });

  it("stops promising JPG on Branding and Sponsors", () => {
    const branding = source("app/admin/(protected)/branding/page.tsx");
    expect(branding).not.toMatch(/JPG|image\/jpeg/);
    const sponsors = source("app/admin/(protected)/sponsors/page.tsx");
    expect(sponsors).not.toContain('accept="image/*"');
    expect(sponsors).toContain("GRAPHIC_UPLOAD_ACCEPT");
  });
});

describe("4. Contact admin only where a Contact page exists", () => {
  it("hides Contact for designs without a public Contact page", () => {
    const ids = (context: AdminRouteAccessContext) => getVisibleAdminRoutes(context).map((route) => route.id);
    expect(ids(OWNER)).toContain("contact");
    expect(ids({ ...OWNER, presentationTemplateKey: null })).not.toContain("contact");
    expect(ids({ ...OWNER, presentationTemplateKey: "clubhouse@1" })).not.toContain("contact");
  });
});

describe("5. Branding footer line only where the footer shows it", () => {
  it("gates the tagline field and its save on the design", () => {
    expect(diverseCitySite.admin.branding.showFooterTagline).toBe(true);
    const branding = source("app/admin/(protected)/branding/page.tsx");
    expect(branding).toContain("showFooterTagline");
    expect(branding).toMatch(/showFooterTagline\s*\?/);
  });
});

describe("6. Deleting a game", () => {
  it("warns that its player stats are deleted too", () => {
    const schedule = source("app/admin/(protected)/schedule/page.tsx");
    expect(schedule).toContain("player stats entered for it");
  });
});

describe("7. Roster age", () => {
  it("explains the 14 to 80 limit in the form instead of failing at save", () => {
    expect(PLAYER_MIN_AGE).toBe(14);
    expect(PLAYER_MAX_AGE).toBe(80);
    expect(playerAgeError(13)).toMatch(/under 14 aren.t supported yet/);
    expect(playerAgeError(0)).toMatch(/under 14/);
    expect(playerAgeError(81)).toMatch(/80/);
    expect(playerAgeError(14)).toBeNull();
    expect(playerAgeError(80)).toBeNull();
    const roster = source("app/admin/(protected)/roster/page.tsx");
    expect(roster).toContain("playerAgeError(");
    expect(roster).toContain("min={PLAYER_MIN_AGE}");
  });

  it("matches the database check", () => {
    const migration = source("supabase/migrations/20260726000200_phase2_content.sql");
    expect(migration).toContain(`check (age between ${PLAYER_MIN_AGE} and ${PLAYER_MAX_AGE})`);
  });
});

describe("8. Shop buy link may be an email (decision 0008 amended)", () => {
  const request = (cta_link: string) => ({
    operationId: "6f1d1c2e-8f0a-4c3b-9d2e-1a2b3c4d5e6f",
    surface: "shop",
    expectedRevision: "1",
    designRevision: "d",
    variants: {
      home: {
        section: { eyebrow: "", title: "Kit", description: "", bullet_points: [], store_note: "", cta_label: "Order", cta_link },
        photos: [{ rowId: null, assetId: "7f1d1c2e-8f0a-4c3b-9d2e-1a2b3c4d5e6f", order: 0 }],
      },
    },
  });

  it("accepts the seeded Diverse City order-by-email link", () => {
    const seeded = "mailto:diverse.cityfc@gmail.com?subject=Diverse%20City%20FC%20Jersey%20Order";
    expect(shopSaveRequestSchema.safeParse(request(seeded)).success).toBe(true);
    expect(shopSaveRequestSchema.safeParse(request("https://store.example.com/kit")).success).toBe(true);
    expect(shopSaveRequestSchema.safeParse(request("/shop")).success).toBe(true);
  });

  it("still rejects unsafe or malformed links", () => {
    for (const bad of ["javascript:alert(1)", "mailto:", "mailto:not-an-email", "mailto:a b@c.com", "ftp://x.com"]) {
      expect(shopSaveRequestSchema.safeParse(request(bad)).success, bad).toBe(false);
    }
  });

  it("turns a typed email address into an email link", () => {
    expect(normalizeKitBuyLink(" orders@club.org ")).toBe("mailto:orders@club.org");
    expect(normalizeKitBuyLink("mailto:orders@club.org")).toBe("mailto:orders@club.org");
    expect(normalizeKitBuyLink("https://x.com")).toBe("https://x.com");
    expect(normalizeKitBuyLink("")).toBe("");
  });

  it("ships the matching database rule", () => {
    const migration = source("supabase/migrations/20261105120000_shop_buy_link_email.sql");
    expect(migration).toContain("create or replace function onzio_private.validate_shop_section(p_section jsonb)");
    expect(migration).toContain("mailto:");
    const editor = source("components/admin/shop/ShopPageEditor.tsx");
    expect(editor).toContain("email address");
  });
});

describe("9. Shop editor says what the academy Shop page shows", () => {
  it("names the photo and bullet limits", () => {
    expect(diverseCitySite.admin.shop.shopPageShows).toEqual({ photos: 2, bullets: 2 });
    expect(diverseCitySite.admin.shop.homeFeatureShows).toEqual({ photos: 2 });
    const editor = source("components/admin/shop/ShopPageEditor.tsx");
    expect(editor).toContain("shopPageShows");
    expect(editor).toContain("homeFeatureShows");
  });
});

describe("10. Program and Tryout default wording", () => {
  it("does not claim sign-up always goes through an outside provider", () => {
    const text = JSON.stringify([DEFAULT_PROGRAM_REGISTRATION_CONTENT, DEFAULT_TRYOUTS_PAGE_CONTENT]);
    expect(text).not.toMatch(/external|provider|partner/i);
  });
});

describe("11. New sign-up form participant default", () => {
  it("defaults to minor or adult so neither a child nor an adult is turned away", () => {
    expect(NEW_REGISTRATION_FORM_PARTICIPANT_MODE).toBe("both");
    const page = source("app/admin/(protected)/registrations/page.tsx");
    expect(page).toContain("participantMode: NEW_REGISTRATION_FORM_PARTICIPANT_MODE");
  });
});

describe("12. Seasons", () => {
  it("labels the next season from a single-year season without '2027–27'", () => {
    expect(nextSeasonAfter({ start_year: 2026, end_year: 2026 })).toEqual({ label: "2027", start_year: 2027, end_year: 2027 });
    expect(nextSeasonAfter({ start_year: 2025, end_year: 2026 })).toEqual({ label: "2026–27", start_year: 2026, end_year: 2027 });
    expect(nextSeasonAfter({ start_year: 2099, end_year: 2100 }).label).toBe("2100–01");
  });

  it("no longer claims the league table follows the season", () => {
    const page = source("app/admin/(protected)/seasons/page.tsx");
    expect(page).toContain("nextSeasonAfter(");
    expect(page).not.toMatch(/Match Stats and Standings all read/);
    expect(page).toContain("does not change with the season");
  });
});

describe("13. Who can sign in lists every owner (decision 0013)", () => {
  it("reads every active owner and never offers Remove on an owner", () => {
    const route = source("app/api/admin/members/route.ts");
    expect(route).toContain("listClubOwners(");
    const page = source("app/admin/(protected)/members/page.tsx");
    expect(page).toContain("otherOwners.map(");
    expect(page).toMatch(/totalAdminCount = admins\.length \+ otherOwners\.length/);
    const ownerBlock = page.slice(page.indexOf("otherOwners.map("), page.indexOf("admins.map("));
    expect(ownerBlock).not.toContain("Remove");
    expect(ownerBlock).toContain("Owner");
  });
});

describe("14. Shop switch gaps", () => {
  it("leaves Shop out of the hero button picker while the store is off", () => {
    const off = siteRouteOptionsWithFallback([], "/", { storeEnabled: false }).map((option) => option.href);
    expect(off).not.toContain("/shop");
    const on = siteRouteOptionsWithFallback([], "/", { storeEnabled: true }).map((option) => option.href);
    expect(on).toContain("/shop");
    expect(source("components/admin/homepage/HomepageFields.tsx")).toContain("storeEnabled");
  });

  it("hides the Edit in Shop shortcut while the store is off", () => {
    const editor = source("components/admin/homepage/HomepageEditor.tsx");
    expect(editor).toMatch(/sharedTargets\.shop && club\.storeEnabled/);
  });
});

describe("15. Sponsors help", () => {
  it("does not mention a slideshow", () => {
    expect(source("app/admin/(protected)/sponsors/page.tsx")).not.toMatch(/slideshow/i);
  });
});
