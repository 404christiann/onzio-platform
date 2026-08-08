import { describe, expect, it } from "vitest";
import {
  deriveProgramSlug,
  MAX_SLUG_LENGTH,
  slugify,
  truncateSlug,
  uniqueSlug,
} from "@/lib/slugify";

/** The database constraints this utility exists to satisfy. */
const SLUG_FORMAT = /^[a-z][a-z0-9-]*$/;

function assertStorable(slug: string) {
  expect(slug).toMatch(SLUG_FORMAT);
  expect(slug.length).toBeGreaterThanOrEqual(1);
  expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
}

describe("slugify", () => {
  it("lowercases and hyphenates ordinary labels", () => {
    expect(slugify("Youth Academy")).toBe("youth-academy");
    expect(slugify("Special Olympics")).toBe("special-olympics");
  });

  it("strips apostrophes without inserting a hyphen", () => {
    expect(slugify("Men's Teams")).toBe("mens-teams");
    expect(slugify("Men’s Teams")).toBe("mens-teams");
    expect(slugify("Women‘s Reserves")).toBe("womens-reserves");
  });

  it("transliterates accented characters to their closest ASCII form", () => {
    expect(slugify("Fútbol Académie")).toBe("futbol-academie");
    expect(slugify("Ñandú Niños")).toBe("nandu-ninos");
    expect(slugify("Ørsted Straße")).toBe("orsted-strasse");
    expect(slugify("Æther Œuvre")).toBe("aether-oeuvre");
  });

  it("collapses runs of symbols and whitespace into single hyphens", () => {
    expect(slugify("U-12  //  U-14   Pathway")).toBe("u-12-u-14-pathway");
    expect(slugify("  Padded Label  ")).toBe("padded-label");
    expect(slugify("Elite --- Squad")).toBe("elite-squad");
  });

  it("falls back to 'program' when nothing survives stripping", () => {
    expect(slugify("!!!")).toBe("program");
    expect(slugify("   ")).toBe("program");
    expect(slugify("")).toBe("program");
    expect(slugify("—— // ——")).toBe("program");
  });

  it("prefixes results that would not start with a letter", () => {
    expect(slugify("2026 Spring Squad")).toBe("program-2026-spring-squad");
    expect(slugify("12")).toBe("program-12");
  });

  it("truncates on a word boundary and stays inside the length ceiling", () => {
    const label =
      "Advanced Competitive Development Pathway For Aspiring Regional Players";
    const slug = slugify(label);
    assertStorable(slug);
    expect(slug).toBe(
      "advanced-competitive-development-pathway-for-aspiring-regional",
    );
    expect(slug.endsWith("-")).toBe(false);
  });

  it("hard cuts a single word longer than the ceiling", () => {
    const slug = slugify("a".repeat(120));
    assertStorable(slug);
    expect(slug).toBe("a".repeat(MAX_SLUG_LENGTH));
  });

  it("always returns a value the database will accept", () => {
    for (const label of [
      "Men's Teams",
      "!!!",
      "2026 Spring Squad",
      "Ørsted Straße",
      "a".repeat(200),
      "-".repeat(10),
      "9",
      "Ãccénts & Symbols!!! ¿Qué?",
    ]) {
      assertStorable(slugify(label));
    }
  });
});

describe("truncateSlug", () => {
  it("leaves short slugs untouched", () => {
    expect(truncateSlug("youth-academy")).toBe("youth-academy");
  });

  it("prefers the last hyphen boundary", () => {
    expect(truncateSlug("alpha-beta-gamma", 12)).toBe("alpha-beta");
  });

  it("hard cuts when there is no usable boundary", () => {
    expect(truncateSlug("supercalifragilistic", 6)).toBe("superc");
  });

  it("returns an empty string for a non-positive maximum", () => {
    expect(truncateSlug("anything", 0)).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when it is free", () => {
    expect(uniqueSlug("youth-academy", ["mens-teams"])).toBe("youth-academy");
  });

  it("appends an incrementing suffix on collision", () => {
    expect(uniqueSlug("youth-academy", ["youth-academy"])).toBe(
      "youth-academy-2",
    );
    expect(
      uniqueSlug("youth-academy", ["youth-academy", "youth-academy-2"]),
    ).toBe("youth-academy-3");
  });

  it("keeps the suffixed slug inside the length ceiling", () => {
    const base = "a".repeat(MAX_SLUG_LENGTH);
    const slug = uniqueSlug(base, [base]);
    assertStorable(slug);
    expect(slug.endsWith("-2")).toBe(true);
  });
});

describe("deriveProgramSlug", () => {
  it("derives Diverse City's live slugs from labels that match them", () => {
    expect(deriveProgramSlug("Youth Academy")).toBe("youth-academy");
    expect(deriveProgramSlug("Special Olympics Soccer")).toBe(
      "special-olympics-soccer",
    );
  });

  it("de-duplicates against slugs already used by the club", () => {
    expect(
      deriveProgramSlug("Youth Academy", [
        "youth-academy",
        "special-kickers-program",
      ]),
    ).toBe("youth-academy-2");
  });

  it("handles every documented edge case in one pass", () => {
    const existing = ["mens-teams"];
    expect(deriveProgramSlug("Men's Teams", existing)).toBe("mens-teams-2");
    expect(deriveProgramSlug("2027 Futsal", existing)).toBe(
      "program-2027-futsal",
    );
    expect(deriveProgramSlug("###", existing)).toBe("program");
  });
});
