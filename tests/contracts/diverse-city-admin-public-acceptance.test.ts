import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const canonicalRoutes = [
  "app/(public)/programs/page.tsx",
  "app/(public)/programs/[programSlug]/page.tsx",
  "app/(public)/contact/page.tsx",
  "app/(public)/tryouts/page.tsx",
] as const;

const tenantRoutes = [
  "app/%5Fclubs/[slug]/programs/page.tsx",
  "app/%5Fclubs/[slug]/programs/[programSlug]/page.tsx",
  "app/%5Fclubs/[slug]/contact/page.tsx",
  "app/%5Fclubs/[slug]/tryouts/page.tsx",
] as const;

describe("DCFC-304 reusable public route acceptance", () => {
  it("ships canonical and tenant-runtime routes for all three domains", () => {
    for (const route of [...canonicalRoutes, ...tenantRoutes]) {
      expect(existsSync(resolve(root, route)), route).toBe(true);
    }
  });

  it("routes Programs, program details, Contact, and Tryouts through verified tenant middleware", () => {
    const middleware = source("middleware.ts");
    for (const route of ['"/programs"', '"/contact"', '"/tryouts"']) {
      expect(middleware).toContain(route);
    }
    expect(middleware).toContain("PROGRAM_DETAIL_PATH");
    expect(middleware).toContain("PROGRAM_SLUG_PATTERN");
  });

  it("loads every public domain with the server-resolved tenant id", () => {
    const joined = tenantRoutes.map(source).join("\n");
    // The tenant id stays the first argument, and DCFC-602 additionally
    // requires the server-resolved schema-scoped client to be passed
    // explicitly: the default browser client stores its session in
    // localStorage while middleware uses cookies, so without this the
    // authenticated-member read path is unreachable and public reads run as
    // anonymous. Both halves are the contract, so assert the full call.
    for (const query of [
      "fetchPrograms(club.id, onzio)",
      "fetchProgramBySlug(club.id, programSlug, onzio)",
      "fetchContactContent(club.id, onzio)",
      "fetchTryouts(club.id, onzio)",
    ]) {
      expect(joined).toContain(query);
    }
    expect(joined).toContain('presentationTemplateKey !== "academy@1"');
    expect(source("middleware.ts")).toContain(
      "target.hostname = hostname",
    );
    expect(source("middleware.ts")).toContain(
      "if (internalSlug !== tenant.slug) return notFound()",
    );
    expect(source("components/Nav.tsx")).toContain(
      'rewrittenPathname.replace(/^\\/_clubs\\/[^/]+/, "") || "/"',
    );
    expect(joined).not.toContain('club.slug === "diverse-city"');
    expect(joined).not.toContain('club.slug === "alpha"');
  });

  it("renders safe external actions without collecting registration or contact data", () => {
    const joined = [
      source("components/AcademyContactPage.tsx"),
      source("components/AcademyTryoutsPage.tsx"),
      source("components/AcademyProgramsPage.tsx"),
      source("components/AcademyProgramDetailPage.tsx"),
    ].join("\n");
    expect(joined).toContain('rel="noopener noreferrer"');
    expect(joined).toContain("Third-party registration");
    expect(joined).toContain("TBA");
    expect(joined).not.toContain("<form");
    expect(joined).not.toContain("participant_name");
    expect(joined).not.toContain("waiver_accepted");
    expect(joined).not.toContain("payment_status");
    expect(joined).not.toContain("FAQ");
  });

  it("uses editable program navigation and the approved Academy footer paths", () => {
    const nav = source("components/Nav.tsx");
    const footer = source("components/Footer.tsx");
    expect(nav).toContain("fetchPrograms(club.id)");
    expect(nav).toContain('label: "Tryouts", href: "/tryouts"');
    // Programs is now an intentional hover/tap-only dropdown trigger with no
    // page of its own (matching the existing "Club" pattern), per Christian's
    // explicit request — so it must exist but must NOT carry its own href.
    expect(nav).toContain('label: "Programs",');
    expect(nav).not.toContain('label: "Programs", href:');
    for (const href of [
      'href: "/programs"',
      'href: "/roster"',
      'href: "/schedule"',
      'href: "/sponsors"',
      'href: "/contact"',
      'href: "/tryouts"',
    ]) {
      expect(footer).toContain(href);
    }
  });

  it("renders tenant-specific admin chrome without an empty image source", () => {
    const shell = source("components/AdminShell.tsx");
    expect(shell).toContain("{clubLogoUrl ? (");
    expect(shell).toContain("{club.name}");
    expect(shell).not.toContain('alt="Rose City FC"');
    expect(shell).not.toContain("Rose City\n");
  });
});

describe("DCFC-304 repeatable local acceptance fixtures", () => {
  it("seeds a published Academy document plus visibly isolated Alpha and Bravo content", () => {
    const seed = source("supabase/seed.sql");
    expect(seed).toContain("dcfc-304-alpha-academy");
    expect(seed).toContain("Alpha Academy Pathway");
    expect(seed).toContain("Bravo Development Pathway");
    expect(seed).toContain("Alpha public acceptance contact");
    expect(seed).toContain("Bravo public acceptance contact");
    expect(seed).toContain("Alpha Open Evaluation");
    expect(seed).toContain("Bravo Closed Evaluation");
    expect(
      source(
        "supabase/migrations/20260802023000_dcfc_304_academy_presentation_template.sql",
      ),
    ).toContain("'academy'");
  });
});
