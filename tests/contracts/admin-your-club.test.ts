import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import {
  ADMIN_MORE_ROWS,
  ADMIN_NAVIGATION_MANIFEST,
  ADMIN_ROUTE_MANIFEST,
  getVisibleAdminMoreRows,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

// ADMIN-RE-14: "Your club" (design: cd-your-club; decision 0006; group 3
// decisions 10 and 11). The pure rules are pinned in lib/__tests__/your-club.test.ts;
// this file pins the write schemas, the route and where the page runs, what it
// reads and how it writes.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/your-club/page.tsx");
const loader = source("lib/admin-your-club-data.ts");
const component = source("components/admin/reimagined/YourClub.tsx");
const fitLogo = source("components/admin/reimagined/FitLogo.tsx");

const OWNER: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "academy@1",
  isBillingAuthorized: true,
  canMutateContent: true,
  storeEnabled: true,
  adminPortal: "reimagined",
  adminFlags: {},
};

function write(table: string, payload: unknown, operation = "upsert") {
  return adminDataRequestSchema.safeParse({ table, operation, payload });
}

describe("site_social_links writes", () => {
  const link = {
    id: "instagram",
    label: "Instagram",
    href: "https://instagram.com/eastsideunited",
    icon: "/images/logo/instagramLogo.svg",
    sort_order: 0,
    updated_at: "2026-11-09T10:00:00.000Z",
  };

  it("accepts what the old Branding page and Your club both send", () => {
    expect(write("site_social_links", [link]).success).toBe(true);
    expect(write("site_social_links", [{ ...link, href: "" }]).success).toBe(true);
  });

  it("limits an address to 2,048 characters (the break-ui gap)", () => {
    const exactly = `https://instagram.com/${"a".repeat(2048 - "https://instagram.com/".length)}`;
    expect(exactly).toHaveLength(2048);
    expect(write("site_social_links", [{ ...link, href: exactly }]).success).toBe(true);
    expect(write("site_social_links", [{ ...link, href: `${exactly}a` }]).success).toBe(false);
  });

  it("still refuses a link that is not http, https, mailto or a local path", () => {
    expect(write("site_social_links", [{ ...link, href: "javascript:alert(1)" }]).success).toBe(false);
    expect(write("site_social_links", [{ ...link, href: "instagram.com/x" }]).success).toBe(false);
  });

  it("refuses unknown columns, a client club_id and an oversized label", () => {
    expect(write("site_social_links", [{ ...link, surprise: 1 }]).success).toBe(false);
    expect(write("site_social_links", [{ ...link, club_id: "0f060f06-0f06-4f06-8f06-0f060f060f06" }]).success).toBe(false);
    expect(write("site_social_links", [{ ...link, label: "L".repeat(41) }]).success).toBe(false);
  });
});

describe("site_branding writes", () => {
  it("accepts the logo path, its asset and the footer line", () => {
    expect(
      write("site_branding", {
        club_logo_path: "0f060f06-0f06-4f06-8f06-0f060f060f06/branding/1f061f06-1f06-4f06-8f06-1f061f061f06.png",
        club_logo_asset_id: "1f061f06-1f06-4f06-8f06-1f061f061f06",
        footer_tagline: "Every kid, every Saturday.",
        updated_at: "2026-11-09T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("limits the footer line to 160 characters, as the database does", () => {
    expect(write("site_branding", { footer_tagline: "a".repeat(160) }).success).toBe(true);
    expect(write("site_branding", { footer_tagline: "a".repeat(161) }).success).toBe(false);
  });

  it("refuses unknown columns and a client club_id", () => {
    expect(write("site_branding", { footer_tagline: "x", surprise: 1 }).success).toBe(false);
    expect(write("site_branding", { club_id: "0f060f06-0f06-4f06-8f06-0f060f060f06", footer_tagline: "x" }).success).toBe(false);
    expect(write("site_branding", { club_logo_asset_id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("contact_profile writes (unchanged limits)", () => {
  it("still accepts the four public fields Your club sends and stops at the same limits", () => {
    const row = { public_email: "info@example.com", public_phone: "(206) 555-0142", service_area: "Seattle", hours: "h".repeat(200) };
    expect(write("contact_profile", row).success).toBe(true);
    expect(write("contact_profile", { ...row, hours: "h".repeat(201) }).success).toBe(false);
  });
});

describe("the route and the More row", () => {
  it("declares Your club as a reimagined-only page outside the sidebar groups", () => {
    expect(ADMIN_ROUTE_MANIFEST.find((route) => route.id === "your-club")).toEqual({
      id: "your-club",
      label: "Your club",
      href: "/admin/your-club",
      iconKey: "branding",
      groupId: null,
      reimaginedOnly: true,
    });
    expect(JSON.stringify(ADMIN_NAVIGATION_MANIFEST)).not.toContain("your-club");
  });

  it("opens from the Your club More row, owners and helpers alike, in the reimagined admin only", () => {
    expect(ADMIN_MORE_ROWS.find((row) => row.id === "your-club")?.routeId).toBe("your-club");
    const row = (context: AdminRouteAccessContext) => getVisibleAdminMoreRows(context).find((entry) => entry.id === "your-club");
    expect(row(OWNER)).toEqual({ id: "your-club", label: "Your club", href: "/admin/your-club", iconKey: "branding" });
    expect(row({ ...OWNER, role: "admin", isBillingAuthorized: false })?.href).toBe("/admin/your-club");
    expect(row({ ...OWNER, adminPortal: "classic" })).toBeUndefined();
    const ids = (context: AdminRouteAccessContext) => getVisibleAdminRoutes(context).map((route) => route.id);
    expect(ids({ ...OWNER, adminPortal: "classic" })).not.toContain("your-club");
  });

  it("leaves the old Branding page where it was for classic clubs", () => {
    expect(ADMIN_ROUTE_MANIFEST.find((route) => route.id === "branding")?.href).toBe("/admin/branding");
  });
});

describe("the page", () => {
  it("resolves the session, club and role on the server and sends a classic club to Branding", () => {
    expect(page).toContain("requireFreshClubSession");
    expect(page).toContain("getClubContext");
    expect(page).toContain("readAdminPortal");
    expect(page).toMatch(/portal\.portal !== "reimagined"\) redirect\("\/admin\/branding"\)/);
    expect(page).toContain('redirect("/admin/login?error=not_authorized")');
    expect(page).not.toMatch(/service.?role|supabase-admin|createServiceClient/i);
  });

  it("shows the contact details and the footer line only where the club's website has them", () => {
    expect(page).toContain("codeSiteAdminFor(club)");
    expect(page).toMatch(/contact\.routeVisible/);
    expect(page).toMatch(/branding\.showFooterTagline/);
    expect(page).not.toMatch(/presentationTemplateKey/);
  });

  it("words the saved label from the club's website state (decision 2)", () => {
    expect(page).toContain("savedLabel(websiteState(club))");
  });
});

describe("the data it reads", () => {
  it("reads with the signed-in person's client, scoped to the club, and only the columns it shows", () => {
    expect(loader).toContain('.from("site_branding")');
    expect(loader).toContain('.from("site_social_links")');
    expect(loader).toContain('.from("contact_profile")');
    expect(loader.match(/\.eq\("club_id", clubId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(loader).not.toMatch(/select\("\*"\)|select\(\s*['"`]\*/);
    expect(loader).not.toMatch(/service.?role|supabase-admin/i);
    expect(loader).toContain("club_logo_path");
    expect(loader).toContain("footer_tagline");
    expect(loader).toContain("public_email");
  });

  it("never touches tenant resolution", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/site_branding|site_social_links|contact_profile|footer_tagline/);
  });
});

describe("how it saves", () => {
  it("writes through the admin client, which sends every write to POST /api/admin/data", () => {
    expect(component).toContain('import { createClient } from "@/lib/admin-client";');
    expect(component).not.toMatch(/from "@\/lib\/supabase(-server)?"/);
    expect(component).toContain('.from("site_branding")');
    expect(component).toContain('.from("site_social_links")');
    expect(component).toContain('.from("contact_profile")');
    expect(component).not.toMatch(/club_id|clubId/);
  });

  it("uploads the logo through the same graphic media chain and says PNG or WebP", () => {
    expect(component).toContain('.from(CLUB_LOGO_BUCKET)');
    expect(component).toContain("GRAPHIC_UPLOAD_ACCEPT");
    expect(component).toContain("GRAPHIC_UPLOAD_TYPES_LABEL");
    expect(`${component}${fitLogo}`).not.toMatch(/JPG|JPEG|image\/jpeg/i);
    expect(fitLogo).toContain('"image/png"');
  });

  it("has one Save for the whole page that confirms with the hold-aware label", () => {
    expect(component).toContain("savedText");
    expect(component).toContain("not saved yet");
    expect(component).toContain("Save your changes first?");
    expect(component).toContain("beforeunload");
    expect((component.match(/data-testid="your-club-save"/g) ?? []).length).toBe(1);
  });

  it("opens Fit your logo before a new logo is kept", () => {
    expect(component).toContain("FitLogo");
    expect(fitLogo).toContain("Fit your logo");
  });
});

describe("the old Branding page", () => {
  it("still tells owners PNG or WebP (the JPG copy fix, PR #88, ADMIN-PLATFORM-FIXES-02 section 3)", () => {
    const branding = source("app/admin/(protected)/branding/page.tsx");
    expect(branding).not.toMatch(/JPG|image\/jpeg/);
    expect(branding).toContain("GRAPHIC_UPLOAD_TYPES_LABEL");
  });
});
