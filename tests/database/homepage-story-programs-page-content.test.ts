import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

// Database contracts for onzio.homepage_story_section,
// onzio.programs_page_content, and onzio.site_branding.footer_tagline, added in
// 20260808130000_dcfc_homepage_story_programs_page_content.sql.
//
// These cover the boundary the migration owns: a club can only manage its own
// copy, the public can only read it for a club whose site is actually
// readable, every documented CHECK is real, and — the point of building a new
// table rather than reusing behind_the_rose_section — the two homepage
// sections stay independent rows that cannot bleed into each other.

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const MISSING_TABLE = "PGRST205";

const CONTENT_TABLES = [
  "homepage_story_section",
  "programs_page_content",
] as const;

async function clearContentRows() {
  for (const table of CONTENT_TABLES) {
    await clients.service
      .from(table)
      .delete()
      .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
  }
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  await clearContentRows();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  await clearContentRows();
  // The tagline lives on a pre-existing singleton, so restore rather than
  // delete: other files assert against the same site_branding fixture row.
  await clients.service
    .from("site_branding")
    .update({ footer_tagline: "" })
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
});

describe("onzio.homepage_story_section schema", () => {
  it("exposes the table", async () => {
    const { error } = await clients.service
      .from("homepage_story_section")
      .select("*")
      .limit(0);
    expect(error?.code).not.toBe(MISSING_TABLE);
    expect(error?.message).toBeUndefined();
  });

  it("defaults to visible with empty copy so nothing changes for existing clubs", async () => {
    const { error: insertError } = await clients.service
      .from("homepage_story_section")
      .insert({ club_id: CLUB_IDS.alpha });
    expect(insertError?.message).toBeUndefined();

    const { data, error } = await clients.service
      .from("homepage_story_section")
      .select("visible, heading, body_primary, body_secondary, cta_label")
      .eq("club_id", CLUB_IDS.alpha)
      .single();
    expect(error?.message).toBeUndefined();
    expect(data).toEqual({
      visible: true,
      heading: "",
      body_primary: "",
      body_secondary: "",
      cta_label: "",
    });
  });

  it("holds exactly one row per club", async () => {
    await clients.service
      .from("homepage_story_section")
      .insert({ club_id: CLUB_IDS.alpha });
    const { error } = await clients.service
      .from("homepage_story_section")
      .insert({ club_id: CLUB_IDS.alpha });
    expect(
      error?.code,
      "the story section is a per-club singleton",
    ).toBe("23505");
  });

  it.each([
    ["heading", 120],
    ["body_primary", 1_200],
    ["body_secondary", 1_200],
    ["cta_label", 40],
  ] as const)("caps %s at %i characters", async (column, maximum) => {
    const atLimit = await clients.service
      .from("homepage_story_section")
      .insert({ club_id: CLUB_IDS.alpha, [column]: "x".repeat(maximum) });
    expect(atLimit.error?.message).toBeUndefined();

    const overLimit = await clients.service
      .from("homepage_story_section")
      .update({ [column]: "x".repeat(maximum + 1) })
      .eq("club_id", CLUB_IDS.alpha);
    expectPostgrestError(overLimit.error, CHECK_VIOLATION, `${column} ceiling`);
  });

  it("stays a separate row from behind_the_rose_section on the same homepage", async () => {
    // The reason this table exists. components/BehindTheRose.tsx and
    // components/DevelopingNextGeneration.tsx are both mounted on the academy
    // homepage; if they shared one singleton, entering content for one would
    // render both with the same words.
    await clients.service.from("homepage_story_section").insert({
      club_id: CLUB_IDS.alpha,
      heading: "Developing the next generation",
    });

    const { data: behind, error } = await clients.service
      .from("behind_the_rose_section")
      .select("title")
      .eq("club_id", CLUB_IDS.alpha)
      .maybeSingle();
    expect(error?.message).toBeUndefined();
    expect(
      behind?.title ?? "",
      "writing the story section must never populate Behind the Rose",
    ).not.toBe("Developing the next generation");
  });
});

describe("onzio.programs_page_content schema", () => {
  it("exposes the table", async () => {
    const { error } = await clients.service
      .from("programs_page_content")
      .select("*")
      .limit(0);
    expect(error?.code).not.toBe(MISSING_TABLE);
    expect(error?.message).toBeUndefined();
  });

  it("defaults every band to empty so an untouched club renders the template", async () => {
    const { error: insertError } = await clients.service
      .from("programs_page_content")
      .insert({ club_id: CLUB_IDS.alpha });
    expect(insertError?.message).toBeUndefined();

    const { data, error } = await clients.service
      .from("programs_page_content")
      .select("*")
      .eq("club_id", CLUB_IDS.alpha)
      .single();
    expect(error?.message).toBeUndefined();
    for (const column of [
      "pathway_eyebrow",
      "pathway_heading",
      "pathway_intro",
      "hero_eyebrow",
      "hero_headline_line_one",
      "hero_headline_line_two",
      "hero_intro",
      "closing_heading_line_one",
      "closing_heading_line_two",
      "closing_body",
      "closing_cta_label",
    ] as const) {
      expect(
        (data as Record<string, unknown>)[column],
        `${column} must default to empty, meaning "use the template default"`,
      ).toBe("");
    }
  });

  it.each([
    ["pathway_eyebrow", 80],
    ["pathway_heading", 120],
    ["pathway_intro", 320],
    ["hero_eyebrow", 80],
    ["hero_headline_line_one", 80],
    ["hero_headline_line_two", 80],
    ["hero_intro", 320],
    ["closing_heading_line_one", 80],
    ["closing_heading_line_two", 80],
    ["closing_body", 320],
    ["closing_cta_label", 40],
  ] as const)("caps %s at %i characters", async (column, maximum) => {
    const atLimit = await clients.service
      .from("programs_page_content")
      .insert({ club_id: CLUB_IDS.alpha, [column]: "x".repeat(maximum) });
    expect(atLimit.error?.message).toBeUndefined();

    const overLimit = await clients.service
      .from("programs_page_content")
      .update({ [column]: "x".repeat(maximum + 1) })
      .eq("club_id", CLUB_IDS.alpha);
    expectPostgrestError(overLimit.error, CHECK_VIOLATION, `${column} ceiling`);
  });

  it("persists edited copy and surfaces it as the public page's own values", async () => {
    const { resolveProgramsPageContent } = await import(
      "@/lib/programs-page-content"
    );
    const edited = {
      club_id: CLUB_IDS.alpha,
      hero_headline_line_one: "Every level.",
      hero_intro: "Alpha FC runs four programs across three age groups.",
      closing_cta_label: "Talk to us",
    };
    const write = await clients.service
      .from("programs_page_content")
      .insert(edited);
    expect(write.error?.message).toBeUndefined();

    // Read back the way the public site does: anonymous, tenant-scoped.
    const { data, error } = await clients.anon
      .from("programs_page_content")
      .select("*")
      .eq("club_id", CLUB_IDS.alpha)
      .single();
    expect(error?.message).toBeUndefined();

    const content = resolveProgramsPageContent(data, "Alpha FC");
    expect(content.heroHeadlineLineOne).toBe(edited.hero_headline_line_one);
    expect(content.heroIntro).toBe(edited.hero_intro);
    expect(content.closingCtaLabel).toBe(edited.closing_cta_label);
    // Untouched fields still resolve to the approved template wording rather
    // than rendering blank.
    expect(content.pathwayHeading).toBe("A pathway for every player.");
    expect(content.heroHeadlineLineTwo).toBe("Every athlete belongs.");
  });
});

describe("onzio.site_branding.footer_tagline", () => {
  it("defaults to empty and accepts a two-line tagline", async () => {
    const { data: initial, error: readError } = await clients.service
      .from("site_branding")
      .select("footer_tagline")
      .eq("club_id", CLUB_IDS.alpha)
      .single();
    expect(readError?.message).toBeUndefined();
    expect(initial?.footer_tagline).toBe("");

    const { error } = await clients.service
      .from("site_branding")
      .update({ footer_tagline: "One Club. One Community.\nEndless Opportunities." })
      .eq("club_id", CLUB_IDS.alpha);
    expect(error?.message).toBeUndefined();
  });

  it("caps the tagline at 160 characters", async () => {
    const atLimit = await clients.service
      .from("site_branding")
      .update({ footer_tagline: "x".repeat(160) })
      .eq("club_id", CLUB_IDS.alpha);
    expect(atLimit.error?.message).toBeUndefined();

    const overLimit = await clients.service
      .from("site_branding")
      .update({ footer_tagline: "x".repeat(161) })
      .eq("club_id", CLUB_IDS.alpha);
    expectPostgrestError(
      overLimit.error,
      CHECK_VIOLATION,
      "footer_tagline ceiling",
    );
  });
});

describe("new content tables authorization", () => {
  it.each(CONTENT_TABLES)("denies an anonymous write to %s", async (table) => {
    const { error } = await clients.anon
      .from(table)
      .insert({ club_id: CLUB_IDS.alpha });
    expectPostgrestError(error, PERMISSION_DENIED, `anonymous ${table} insert`);
  });

  it.each(CONTENT_TABLES)("exposes %s publicly for a live club", async (table) => {
    await clients.service.from(table).insert({ club_id: CLUB_IDS.alpha });

    const { data, error } = await clients.anon
      .from(table)
      .select("club_id")
      .eq("club_id", CLUB_IDS.alpha);
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([{ club_id: CLUB_IDS.alpha }]);
  });

  it.each(CONTENT_TABLES)(
    "hides %s from the public for a preview club",
    async (table) => {
      await clients.service.from(table).insert({ club_id: CLUB_IDS.bravo });

      const { data, error } = await clients.anon
        .from(table)
        .select("club_id")
        .eq("club_id", CLUB_IDS.bravo);
      expect(error?.message).toBeUndefined();
      expect(
        data ?? [],
        "a club that is not publicly accessible must expose no content rows",
      ).toEqual([]);
    },
  );

  it.each(CONTENT_TABLES)(
    "lets a club member manage only its own club's %s",
    async (table) => {
      const session = await createFreshLocalClient({
        email: "owner-aal2@alpha.local",
        userId: USER_IDS.ownerAal2,
      });
      cleanups.push(session.cleanup);

      const allowed = await session.client
        .from(table)
        .insert({ club_id: CLUB_IDS.alpha });
      expect(allowed.error?.message).toBeUndefined();

      const crossClub = await session.client
        .from(table)
        .insert({ club_id: CLUB_IDS.bravo });
      expectPostgrestError(
        crossClub.error,
        PERMISSION_DENIED,
        `cross-club ${table} insert`,
      );

      // A foreign delete must leave the other club's row untouched.
      await clients.service.from(table).insert({ club_id: CLUB_IDS.bravo });
      await session.client.from(table).delete().eq("club_id", CLUB_IDS.bravo);
      const { data: survivors } = await clients.service
        .from(table)
        .select("club_id")
        .eq("club_id", CLUB_IDS.bravo);
      expect(
        survivors ?? [],
        "another club's content row must survive a foreign delete attempt",
      ).toEqual([{ club_id: CLUB_IDS.bravo }]);
    },
  );
});
