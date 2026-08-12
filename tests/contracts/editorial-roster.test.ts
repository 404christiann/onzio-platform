import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Player, Staff } from "@/lib/data";

/**
 * Real Starter-tier Lions editorial roster contracts (filter control,
 * position groups, non-interactive player/staff cards, `/staff` redirect).
 *
 * Following this repository's established editorial-template.test.ts /
 * editorial-home.test.ts conventions: static source assertions for
 * client-only behavior (filter select, non-interactivity, reduced-motion
 * fallback) plus real server renders through react-dom/server for
 * everything observable at render time. `EditorialRosterView` is
 * presentational (roster/staff arrive as props from `EditorialRoster`'s
 * single fetch), so it can be rendered directly with real seeded-shaped
 * fixtures instead of mocking Supabase.
 */

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
    ...props
  }: Record<string, unknown> & {
    src?: string;
    alt?: string;
    className?: string;
  }) => {
    void props;
    return createElement("span", {
      "data-mock-image": true,
      "data-src": src,
      "data-alt": alt,
      className,
    });
  },
}));

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CREST_URL = "https://storage.example/onzio-media/lions/crest.webp";

function makePlayer(overrides: Partial<Player>): Player {
  return {
    number: 1,
    name: "Jonah Reed",
    nationality: "",
    position: "Goalkeeper",
    height: "6'2\"",
    weight: "",
    hometown: "Columbus, OH",
    age: 21,
    image: "",
    stats: { goalsAgainst: 0, saves: 24, cleanSheets: 2, starts: 4, yellow: 0, red: 0, mins: 414 },
    ...overrides,
  };
}

function makeStaff(overrides: Partial<Staff>): Staff {
  return {
    initials: "",
    name: "Marcus Hale",
    role: "Head Coach",
    hometown: "",
    nationality: "",
    bio: null,
    image: "",
    ...overrides,
  };
}

// Transcribed verbatim from the real seeded first-team roster
// (supabase/seed.sql): 2 GK, 6 DF, 6 MF, 4 FW = 18 players.
const LIONS_GOALKEEPERS: Player[] = [
  makePlayer({ id: "77777777-7777-4777-8777-777777777701", number: 1, name: "Jonah Reed", position: "Goalkeeper" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777702", number: 13, name: "Mateo Silva", position: "Goalkeeper" }),
];
const LIONS_DEFENDERS: Player[] = [
  makePlayer({ id: "77777777-7777-4777-8777-777777777703", number: 2, name: "Elias Ford", position: "Defender" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777704", number: 3, name: "Andre Kouyaté", position: "Defender" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777705", number: 4, name: "Noah Chen", position: "Defender" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777706", number: 5, name: "Luca Bennett", position: "Defender" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777707", number: 15, name: "Darius Cole", position: "Defender" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777708", number: 22, name: "Owen Park", position: "Defender" }),
];
const LIONS_MIDFIELDERS: Player[] = [
  makePlayer({ id: "77777777-7777-4777-8777-777777777709", number: 6, name: "Miles Okafor", position: "Midfielder" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777710", number: 8, name: "Nico Valdez", position: "Midfielder" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777711", number: 10, name: "Theo Santos", position: "Midfielder" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777712", number: 14, name: "Caleb Wright", position: "Midfielder" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777713", number: 18, name: "Isaac Amini", position: "Midfielder" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777714", number: 21, name: "Rowan Kim", position: "Midfielder" }),
];
const LIONS_FORWARDS: Player[] = [
  makePlayer({ id: "77777777-7777-4777-8777-777777777715", number: 7, name: "Malik Johnson", position: "Forward" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777716", number: 9, name: "Santiago Ruiz", position: "Forward" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777717", number: 11, name: "Adrian Brooks", position: "Forward" }),
  makePlayer({ id: "77777777-7777-4777-8777-777777777718", number: 19, name: "Kenji Tanaka", position: "Forward" }),
];

const LIONS_ROSTER = {
  goalkeepers: LIONS_GOALKEEPERS,
  defenders: LIONS_DEFENDERS,
  midfielders: LIONS_MIDFIELDERS,
  forwards: LIONS_FORWARDS,
};

// Transcribed verbatim from the real seeded staff (supabase/seed.sql):
// the `initials` column defaults to '' and is never populated by the Lions
// seed, so every real staff row arrives with an empty `initials` field.
const LIONS_STAFF: Staff[] = [
  makeStaff({ name: "Marcus Hale", role: "Head Coach" }),
  makeStaff({ name: "Elena Torres", role: "Assistant Coach" }),
  makeStaff({ name: "David Kim", role: "Goalkeeper Coach" }),
  makeStaff({ name: "Dr. Maya Brooks", role: "Athletic Trainer" }),
  makeStaff({ name: "Renee Walker", role: "Club General Manager" }),
];

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(element);
}

describe("editorial player card", () => {
  it("is non-interactive: article, not button, data-interactive=false, no click handler", async () => {
    const { default: EditorialPlayerCard } = await import(
      "@/components/editorial/EditorialPlayerCard"
    );
    const html = render(
      createElement(EditorialPlayerCard, {
        player: LIONS_GOALKEEPERS[0],
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain("<article");
    expect(html).not.toContain("<button");
    expect(html).toContain('data-interactive="false"');

    const source = stripComments(
      read("components/editorial/EditorialPlayerCard.tsx"),
    );
    expect(source).not.toMatch(/onClick|useState|Modal|"use client"/);
  });

  it("renders the big number, position label, and small-first/big-last name split", async () => {
    const { default: EditorialPlayerCard } = await import(
      "@/components/editorial/EditorialPlayerCard"
    );
    const html = render(
      createElement(EditorialPlayerCard, {
        player: LIONS_GOALKEEPERS[0],
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain(">1<");
    expect(html).toContain(">01<");
    expect(html).toContain(">Goalkeeper<");
    expect(html).toContain("<small>Jonah</small>");
    expect(html).toContain("<strong>Reed</strong>");
  });

  it("falls back to the club crest (never a hardcoded club asset) when the player has no photo", async () => {
    const { default: EditorialPlayerCard } = await import(
      "@/components/editorial/EditorialPlayerCard"
    );
    const html = render(
      createElement(EditorialPlayerCard, {
        player: LIONS_GOALKEEPERS[0],
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain(`data-src="${CREST_URL}"`);
    expect(html).toContain('class="is-crest"');

    const source = read("components/editorial/EditorialPlayerCard.tsx");
    expect(source).not.toMatch(/lions|LFC/i);
  });

  it("renders the seeded photo when the player has one", async () => {
    const { default: EditorialPlayerCard } = await import(
      "@/components/editorial/EditorialPlayerCard"
    );
    const html = render(
      createElement(EditorialPlayerCard, {
        player: makePlayer({ image: "https://storage.example/onzio-media/lions/player-1.webp" }),
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain(
      'data-src="https://storage.example/onzio-media/lions/player-1.webp"',
    );
    expect(html).toContain('class="is-photo"');
  });

  it("splits a single-word name entirely onto the bold line", async () => {
    const { splitPlayerName } = await import(
      "@/components/editorial/EditorialPlayerCard"
    );
    expect(splitPlayerName("Cher")).toEqual({ first: "", last: "Cher" });
    expect(splitPlayerName("Jonah Reed")).toEqual({ first: "Jonah", last: "Reed" });
  });
});

describe("editorial staff card", () => {
  it("is non-interactive: article, not button, data-interactive=false, no click handler", async () => {
    const { default: EditorialStaffCard } = await import(
      "@/components/editorial/EditorialStaffCard"
    );
    const html = render(
      createElement(EditorialStaffCard, {
        member: LIONS_STAFF[0],
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain("<article");
    expect(html).not.toContain("<button");
    expect(html).toContain('data-interactive="false"');

    const source = stripComments(
      read("components/editorial/EditorialStaffCard.tsx"),
    );
    expect(source).not.toMatch(/onClick|useState|Modal|"use client"/);
  });

  it("derives initials from the name rather than trusting the stored (empty) field", async () => {
    const { default: EditorialStaffCard, staffInitials } = await import(
      "@/components/editorial/EditorialStaffCard"
    );
    expect(staffInitials("Marcus Hale")).toBe("MH");
    expect(LIONS_STAFF[0].initials).toBe("");

    const html = render(
      createElement(EditorialStaffCard, {
        member: LIONS_STAFF[0],
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain("<b>MH</b>");
    expect(html).toContain("Head Coach");
    expect(html).toContain("Marcus Hale");
  });

  it("falls back to the club crest when the staff member has no photo", async () => {
    const { default: EditorialStaffCard } = await import(
      "@/components/editorial/EditorialStaffCard"
    );
    const html = render(
      createElement(EditorialStaffCard, {
        member: LIONS_STAFF[0],
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain(`data-src="${CREST_URL}"`);
    expect(html).toContain('class="is-crest"');
  });
});

describe("editorial roster: filter logic (pure, no animation timing)", () => {
  it("visibleGroupsForFilter returns exactly one group for a position filter", async () => {
    const { visibleGroupsForFilter } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    expect(visibleGroupsForFilter("Goalkeeper")).toEqual([
      ["Goalkeeper", "Goalkeepers", "goalkeepers"],
    ]);
    expect(visibleGroupsForFilter("Forward")).toEqual([
      ["Forward", "Forwards", "forwards"],
    ]);
  });

  it("visibleGroupsForFilter returns all four groups for 'all' and none for 'staff'", async () => {
    const { visibleGroupsForFilter } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    expect(visibleGroupsForFilter("all")).toHaveLength(4);
    expect(visibleGroupsForFilter("staff")).toHaveLength(0);
  });

  it("showsStaffSection is true only for 'all' and 'staff'", async () => {
    const { showsStaffSection } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    expect(showsStaffSection("all")).toBe(true);
    expect(showsStaffSection("staff")).toBe(true);
    expect(showsStaffSection("Goalkeeper")).toBe(false);
  });

  it("resultLabelForFilter labels each filter value", async () => {
    const { resultLabelForFilter } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    expect(resultLabelForFilter("all")).toBe("All squad");
    expect(resultLabelForFilter("staff")).toBe("Technical staff");
    expect(resultLabelForFilter("Midfielder")).toBe("Midfielders");
  });

  it("playersByPosition resolves the real seeded 2/6/6/4 group counts", async () => {
    const { playersByPosition } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    expect(playersByPosition(LIONS_ROSTER, "Goalkeeper")).toHaveLength(2);
    expect(playersByPosition(LIONS_ROSTER, "Defender")).toHaveLength(6);
    expect(playersByPosition(LIONS_ROSTER, "Midfielder")).toHaveLength(6);
    expect(playersByPosition(LIONS_ROSTER, "Forward")).toHaveLength(4);
  });
});

describe("editorial roster view: composition", () => {
  it("opens directly with the filter control and no roster hero or marketing copy", async () => {
    const { default: EditorialRosterView } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    const html = render(
      createElement(EditorialRosterView, {
        roster: LIONS_ROSTER,
        staffList: LIONS_STAFF,
        crestUrl: CREST_URL,
      }),
    );
    expect(html).toContain('id="roster-filter"');
    expect(html).toContain('for="roster-filter"');
    expect(html).toContain("<option");
    expect(html).toContain(">All squad<");
    expect(html).toContain(">Technical staff<");
    expect(html).not.toContain("<h1");
    expect(html).not.toMatch(/roster-hero|eyebrow/);
  });

  it("renders position groups in Goalkeepers -> Defenders -> Midfielders -> Forwards -> staff order with real seeded counts", async () => {
    const { default: EditorialRosterView } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    const html = render(
      createElement(EditorialRosterView, {
        roster: LIONS_ROSTER,
        staffList: LIONS_STAFF,
        crestUrl: CREST_URL,
      }),
    );
    const gkIndex = html.indexOf('id="goalkeepers"');
    const dfIndex = html.indexOf('id="defenders"');
    const mfIndex = html.indexOf('id="midfielders"');
    const fwIndex = html.indexOf('id="forwards"');
    const staffIndex = html.indexOf('id="staff"');
    expect(gkIndex).toBeGreaterThan(-1);
    expect(dfIndex).toBeGreaterThan(gkIndex);
    expect(mfIndex).toBeGreaterThan(dfIndex);
    expect(fwIndex).toBeGreaterThan(mfIndex);
    expect(staffIndex).toBeGreaterThan(fwIndex);

    expect(html).toContain(">Goalkeepers<");
    expect(html).toContain(">Defenders<");
    expect(html).toContain(">Midfielders<");
    expect(html).toContain(">Forwards<");
    expect(html).toContain("2 players");
    // 6 players occurs for both Defenders and Midfielders.
    expect((html.match(/6 players/g) ?? []).length).toBe(2);
    expect(html).toContain("4 players");

    expect((html.match(/class="player-card"/g) ?? []).length).toBe(18);
    expect((html.match(/class="staff-card"/g) ?? []).length).toBe(5);
  });

  it("never mounts stats, a season selector, or a click affordance on any card", async () => {
    const { default: EditorialRosterView } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    const html = render(
      createElement(EditorialRosterView, {
        roster: LIONS_ROSTER,
        staffList: LIONS_STAFF,
        crestUrl: CREST_URL,
      }),
    );
    expect(html).not.toMatch(/season-selector|sponsor|partner|\/store/i);
    expect(html).not.toContain('data-interactive="true"');
    expect((html.match(/data-interactive="false"/g) ?? []).length).toBe(23);
  });
});

describe("editorial roster view: reduced motion", () => {
  it("uses Framer Motion for the filter transition with a prefers-reduced-motion fallback", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    expect(source).toContain('from "framer-motion"');
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("AnimatePresence");
    expect(source).toMatch(/prefersReducedMotion\s*\?\s*\{ opacity: 0 \}/);
  });

  it("renders correctly under a real reduced-motion render without throwing", async () => {
    const { default: EditorialRosterView } = await import(
      "@/components/editorial/EditorialRosterView"
    );
    expect(() =>
      render(
        createElement(EditorialRosterView, {
          roster: LIONS_ROSTER,
          staffList: LIONS_STAFF,
          crestUrl: CREST_URL,
        }),
      ),
    ).not.toThrow();
  });
});

describe("editorial roster: dispatch and classic regression", () => {
  it("only editorial-template tenants reach EditorialRoster from the shared /roster route", () => {
    const page = read("app/(public)/roster/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain(
      'const EditorialRoster = nextDynamic(\n  () => import("@/components/editorial/EditorialRoster"),\n);',
    );
    expect(page).toContain("<EditorialRoster />");
  });

  it("the classic roster page (PlayerCard/StaffCard) is untouched by editorial concerns", () => {
    for (const path of [
      "components/PlayerCard.tsx",
      "components/StaffCard.tsx",
      "components/PlayerModal.tsx",
      "components/StaffModal.tsx",
    ]) {
      expect(read(path)).not.toMatch(/editorial/i);
    }
  });
});

describe("/staff redirect", () => {
  it("redirects to /roster#staff for editorial tenants and 404s for classic tenants", () => {
    const source = read("app/(public)/staff/page.tsx");
    expect(source).toContain('club.siteTemplate === "editorial"');
    expect(source).toContain('redirect("/roster#staff")');
    expect(source).toContain("notFound()");
  });

  it("mirrors /staff under the tenant route group, matching the roster mirror pattern", () => {
    const mirror = read("app/%5Fclubs/[slug]/staff/page.tsx").trim();
    expect(mirror).toBe('export { default } from "@/app/(public)/staff/page";');
  });

  it("is registered in the tenant-rewrite allowlist so it resolves real club context", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toMatch(/PUBLIC_TENANT_PATHS = new Set\(\[[\s\S]*?"\/staff"/);
  });
});
