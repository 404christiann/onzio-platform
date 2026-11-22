import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fitPreviewScale } from "@/components/admin/ui/editor-kit/fitPreviewScale";
import { matchPreviewFixtures } from "@/components/admin/schedule/rose-city/match-preview-fixtures";
import type { Fixture } from "@/lib/data";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const globals = read("styles/globals.css");

/** The last value a block whose selector list matches `selector` gives `token`, as "h s% l%". */
function token(selector: RegExp, name: string): string {
  let value: string | undefined;
  for (const match of globals.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector.test(match[1])) continue;
    const decl = match[2].match(new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`));
    if (decl) value = decl[1].trim();
  }
  if (!value) throw new Error(`no ${name} for ${selector}`);
  return value;
}

function luminance(hsl: string) {
  const [h, s, l] = hsl.replace(/%/g, "").split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("Homepage Overview part numbers stay readable in both admin themes", () => {
  const css = read("components/admin/homepage/HomepageOverview.module.css");
  const ink = (theme: "light" | "dark") => {
    const rule = theme === "dark"
      ? css.match(/data-admin-theme="dark"\]\)\s*\.root\s*\{[^}]*--part-num-ink:\s*([^;]+);/)
      : css.match(/(?:^|\n)\.root\s*\{[^}]*--part-num-ink:\s*([^;]+);/);
    if (!rule) throw new Error(`no --part-num-ink for ${theme}`);
    return rule[1].trim();
  };

  it("does not take the portal's forced white --primary-foreground", () => {
    const num = css.match(/\.num\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(num).toContain("var(--part-num-ink)");
    expect(num).not.toContain("--primary-foreground");
  });

  it.each(["light", "dark"] as const)("meets 4.5:1 on the %s-theme blue", (theme) => {
    const primary = token(new RegExp(`\\.admin-theme\\[data-admin-theme="${theme}"\\](?!\\s*\\.)`), "--primary");
    expect(contrast(ink(theme), primary)).toBeGreaterThanOrEqual(4.5);
  });

  it("would fail with the portal's white on the dark blue (the bug this pins)", () => {
    const primary = token(/\.admin-theme\[data-admin-theme="dark"\](?!\s*\.)/, "--primary");
    expect(contrast("0 0% 100%", primary)).toBeLessThan(4.5);
  });
});

describe("kit preview cards show the whole section width", () => {
  it("scales the preview to the measured box, not a fixed factor", () => {
    // Robinson asked for .46 at 780px: 359px of preview in a 306px card clipped the right side (the right-aligned heading).
    expect(fitPreviewScale(306, 780, 0.46) * 780).toBeCloseTo(306);
    expect(fitPreviewScale(358, 780, 0.4) * 780).toBeCloseTo(358);
  });
  it("keeps the asked-for scale until the box is measured", () => {
    expect(fitPreviewScale(0, 780, 0.46)).toBe(0.46);
  });
  it.each([
    ["components/admin/ui/editor-kit/PreviewCards.tsx", /useFitPreviewScale\(ref, width, fallbackScale\)/],
    ["components/admin/news/NewsCards.tsx", /useFitPreviewScale\(ref, PREVIEW_WIDTH, PREVIEW_SCALE\)/],
  ])("%s scales with the fitted value", (file, call) => {
    const source = read(file);
    expect(source).toMatch(call);
    expect(source).toMatch(/"--preview-scale": scale\b/);
  });
});

describe("Tickets and ticket-page cards show only their own section", () => {
  it("the isolation list beats the public page's desktop rules", () => {
    // Card previews are not in an iframe: `.tickets-top:has(...):has(...)` (0,4,0, desktop media) out-ranked the list.
    const css = read("components/admin/ticket-pages/ticket-editors.module.css");
    const list = css.match(/\.only\[data-only="page"\][^{]*\{([^}]*)\}/)?.[1] ?? "";
    expect(list).toMatch(/display:\s*none\s*!important/);
  });
});

describe("Schedule match previews are never blank", () => {
  const fixture = (id: string, date: string, played = false) => ({
    id, date, time: "7:00 PM", opponent: `Team ${id}`, home: true, venue: "Rose City Field",
    rose_city_score: played ? 2 : null, opponent_score: played ? 1 : null,
  }) as unknown as Fixture;
  const now = new Date("2027-03-20T12:00:00Z");
  const next = fixture("next", "2027-03-27");

  it("previews a match after Next on its own and says it is not on the site yet", () => {
    const later = fixture("later", "2027-04-10");
    expect(matchPreviewFixtures(later, next, "America/Los_Angeles", now)).toEqual({ fixtures: [later], listed: false });
  });
  it("keeps Next beside a match the public page lists", () => {
    const played = fixture("played", "2027-03-06", true);
    expect(matchPreviewFixtures(played, next, "America/Los_Angeles", now)).toEqual({ fixtures: [next, played], listed: true });
    expect(matchPreviewFixtures(next, next, "America/Los_Angeles", now)).toEqual({ fixtures: [next], listed: true });
  });
});
