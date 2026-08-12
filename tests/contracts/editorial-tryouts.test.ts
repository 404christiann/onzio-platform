import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClubIdentityContent, TryoutPageContent } from "@/lib/club-identity";

/**
 * Real Starter-tier Lions editorial tryouts info page (`/tryouts`)
 * contracts.
 *
 * Following this repository's established editorial-*.test.ts conventions:
 * real server renders through react-dom/server against a real seeded-shaped
 * `tryout_page_content` fixture plus the shared `club_identity` fixture for
 * contact info, plus static source assertions for the dispatch/mirror/
 * middleware/nav/footer wiring. Per Christian's already-approved decision,
 * this is informational only — no registration form, no signup mutation —
 * so this suite also proves the page was intentionally built without one.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/tryouts",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: Record<string, unknown> & { children?: unknown; href?: string }) =>
    createElement("a", { href, ...props }, children as never),
}));

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const LIONS_IDENTITY: ClubIdentityContent = {
  shortName: "Lions FC",
  initials: "LFC",
  foundedYear: 2014,
  league: "Midwest Premier League",
  division: "Ohio Valley Division",
  city: "Columbus",
  state: "OH",
  venue: "Scioto Field",
  timeZone: "America/New_York",
  contactEmail: "hello@lionsfc.example",
  contactPhone: "(614) 555-0142",
  contactAddress: "1814 W Broad St, Columbus, OH 43223",
  heroHeadlineTop: "Capital City.",
  heroHeadlineEm: "Roar as One.",
  heroIntro:
    "Columbus-built football, carried by a club that plays for the city and every supporter behind it.",
  slideshowHeadingTop: "This is how",
  slideshowHeadingEm: "Columbus roars.",
  identityHeadingTop: "A club shaped by",
  identityHeadingEm: "Columbus.",
  storyHeadingTop: "From Columbus.",
  storyHeadingEm: "For the Capital City.",
  mission: "Roar as one for Columbus.",
  highlights: [
    "2025 Ohio Valley Division Champions",
    "Three connected player pathways",
    "Columbus-owned and community-backed",
  ],
};

// Transcribed verbatim from the real seeded supabase/seed.sql
// tryout_page_content row for the Lions tenant.
const LIONS_TRYOUT_CONTENT: TryoutPageContent = {
  heroHeadlineTop: "Open Trials.",
  heroHeadlineEm: "Wear the Badge.",
  heroIntro:
    "Lions FC runs open tryouts every year across three pathways — Academy, U23s, and First Team. Bring your boots and come compete for the Capital City.",
  sessions: [
    {
      ageGroup: "Academy (U10–U17)",
      dateRange: "August 18–19, 2026",
      dayTime: "Tue–Wed, 5:30–7:30 PM",
      notes: "Open to all skill levels. Check in at the Scioto Field north gate.",
    },
    {
      ageGroup: "U23s",
      dateRange: "August 22, 2026",
      dayTime: "Sat, 9:00–11:30 AM",
      notes: "Prior competitive experience recommended.",
    },
    {
      ageGroup: "First Team",
      dateRange: "August 29, 2026",
      dayTime: "Sat, 8:00–10:30 AM",
      notes: "By invitation and open trial slots — email to request a slot.",
    },
  ],
  whatToBring: [
    "Boots (cleats) and shin guards",
    "Water and a light snack",
    "A signed waiver (available at check-in)",
    "Photo ID for players 16 and older",
  ],
  feeNote:
    "Tryouts are free to attend. No registration required — just show up ready to play.",
  ctaLabel: "Questions? Contact the club",
};

async function renderWithIdentity(
  element: ReturnType<typeof createElement>,
  identity: ClubIdentityContent | null = LIONS_IDENTITY,
) {
  const { EditorialIdentityProvider } = await import(
    "@/components/editorial/EditorialIdentityContext"
  );
  return renderToStaticMarkup(
    createElement(EditorialIdentityProvider, {
      value: { identity, crestUrl: "", crestOnDarkUrl: "" },
      children: element,
    }),
  );
}

describe("editorial tryouts view", () => {
  it("renders the interior hero from hero_headline_top/em and hero_intro", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: LIONS_TRYOUT_CONTENT }),
    );
    expect(html).toContain('class="interior-hero"');
    expect(html).toContain("Open Trials.");
    expect(html).toContain("<em>Wear the Badge.</em>");
    expect(html).toContain(LIONS_TRYOUT_CONTENT.heroIntro);
  });

  it("renders all three real seeded tryout session cards", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: LIONS_TRYOUT_CONTENT }),
    );
    expect(html).toContain('class="tryout-sessions-grid"');
    for (const session of LIONS_TRYOUT_CONTENT.sessions) {
      expect(html).toContain(`<h3>${session.ageGroup}</h3>`);
      expect(html).toContain(session.dateRange);
      expect(html).toContain(session.dayTime);
      expect(html).toContain(session.notes);
    }
  });

  it("renders all four real seeded what-to-bring items as list items", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: LIONS_TRYOUT_CONTENT }),
    );
    expect(html).toContain('class="tryout-checklist"');
    for (const item of LIONS_TRYOUT_CONTENT.whatToBring) {
      expect(html).toContain(`<li>${item}</li>`);
    }
  });

  it("renders the fee note and CTA label", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: LIONS_TRYOUT_CONTENT }),
    );
    expect(html).toContain(LIONS_TRYOUT_CONTENT.feeNote);
    expect(html).toContain(LIONS_TRYOUT_CONTENT.ctaLabel);
  });

  it("renders club_identity.contactEmail as a mailto link and contactPhone as text", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: LIONS_TRYOUT_CONTENT }),
    );
    expect(html).toContain(`href="mailto:${LIONS_IDENTITY.contactEmail}"`);
    expect(html).toContain(LIONS_IDENTITY.contactEmail);
    expect(html).toContain(LIONS_IDENTITY.contactPhone);
  });

  it("renders a safe loading state with a null content prop — no session or checklist content", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: null }),
    );
    expect(html).toContain('class="interior tryouts-page"');
    for (const session of LIONS_TRYOUT_CONTENT.sessions) {
      expect(html).not.toContain(session.ageGroup);
    }
    for (const item of LIONS_TRYOUT_CONTENT.whatToBring) {
      expect(html).not.toContain(item);
    }
  });

  it("renders no checklist section when what_to_bring is empty, mirroring EditorialClubStoryView's empty-highlights omission", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, {
        content: { ...LIONS_TRYOUT_CONTENT, whatToBring: [] },
      }),
    );
    expect(html).not.toContain('class="tryout-checklist"');
  });

  it("never renders a registration form — informational only, per the approved plan", async () => {
    const { default: EditorialTryoutsView } = await import(
      "@/components/editorial/EditorialTryoutsView"
    );
    const html = await renderWithIdentity(
      createElement(EditorialTryoutsView, { content: LIONS_TRYOUT_CONTENT }),
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<button");

    const source = read("components/editorial/EditorialTryoutsView.tsx");
    expect(source).not.toMatch(/<form|<input|<textarea|useState/);
  });

  it("is entirely data-driven: the component source contains no hardcoded Lions copy", () => {
    const source = read("components/editorial/EditorialTryoutsView.tsx");
    expect(source).not.toMatch(
      /Columbus|Capital City|Lions|Scioto|Open Trials|Wear the Badge/,
    );
  });
});

describe("editorial tryouts container", () => {
  it("fetches tryout_page_content once via the existing fetchTryoutPageContent helper", () => {
    const source = read("components/editorial/EditorialTryouts.tsx");
    expect(source).toContain("fetchTryoutPageContent");
    expect(source).toContain("useClubContext()");
    expect(source).toContain("EditorialTryoutsView");
  });
});

describe("editorial tryouts: dispatch, mirror, and middleware wiring", () => {
  it("only editorial-template tenants reach EditorialTryouts from the shared /tryouts route; classic 404s", () => {
    const page = read("app/(public)/tryouts/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain(
      'const EditorialTryouts = nextDynamic(\n  () => import("@/components/editorial/EditorialTryouts"),\n);',
    );
    expect(page).toContain("<EditorialTryouts />");
    expect(page).toContain("notFound()");
  });

  it("mirrors /tryouts under the tenant route group, matching the club/roster/staff mirror pattern", () => {
    const mirror = read("app/%5Fclubs/[slug]/tryouts/page.tsx").trim();
    expect(mirror).toBe(
      'export { default } from "@/app/(public)/tryouts/page";',
    );
  });

  it("is registered in the tenant-rewrite allowlist so it resolves real club context", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toMatch(
      /PUBLIC_TENANT_PATHS = new Set\(\[[\s\S]*?"\/tryouts"/,
    );
  });

  it("appears in the editorial header nav items with href /tryouts", () => {
    const header = read("components/editorial/EditorialHeader.tsx");
    expect(header).toMatch(
      /\{\s*href:\s*"\/tryouts",\s*label:\s*"Tryouts"\s*\}/,
    );
  });

  it("appears as a footer link to /tryouts", () => {
    const footer = read("components/editorial/EditorialFooter.tsx");
    expect(footer).toContain('<Link href="/tryouts">Tryouts</Link>');
  });
});

describe("editorial tryouts: classic regression", () => {
  it("classic components never mention the editorial tryouts page", () => {
    for (const file of ["components/Nav.tsx", "components/Footer.tsx"]) {
      expect(read(file)).not.toMatch(/editorial/i);
    }
  });
});
