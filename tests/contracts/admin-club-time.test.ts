import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMIN-RE-03: the admin, the public schedule and Next match read dates in the
// club's own time zone (decision 0014, plan decision 5).

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const KICKOFF_PAGES = [
  "app/(public)/schedule/page.tsx",
  "components/sites/diverse-city/AcademySchedulePage.tsx",
  "components/NextMatchCard.tsx",
  "components/AcademyNextMatch.tsx",
];

describe("public kickoff logic uses the club's zone", () => {
  it.each(KICKOFF_PAGES)("%s has no hardcoded zone, UTC today or browser-local kickoff", (path) => {
    const source = read(path);
    expect(source).not.toContain("America/Los_Angeles");
    expect(source).not.toMatch(/toISOString\(\)\.split\("T"\)\[0\]/);
    expect(source).not.toMatch(/function fixtureToDate|fixtureKickoffInstantFromLosAngelesLocalTime/);
    expect(source).toContain("useClubTimeZone()");
    expect(source).toContain("clubKickoffInstant(fixture.date, fixture.time, timeZone)");
  });

  it("the next-match cards pick against the club's today", () => {
    for (const path of ["components/NextMatchCard.tsx", "components/AcademyNextMatch.tsx"]) {
      expect(read(path)).toContain("const todayStr = clubToday(timeZone);");
    }
  });
});

describe("where the zone comes from", () => {
  it("the tenant layout reads it separately, fail-safe, and provides it on both site shells", () => {
    const layout = read("app/%5Fclubs/[slug]/layout.tsx");
    expect(layout).toContain("const timeZone = await readPublicClubTimeZone(club.id);");
    expect(layout.match(/<ClubTimeZoneProvider timeZone=\{timeZone\}>/g)).toHaveLength(2);
  });

  it("the public read is time-boxed and falls back to Los Angeles", () => {
    const reader = read("lib/public-club-time-zone.ts");
    expect(reader).toContain("const BUDGET_MS = 1_500;");
    expect(reader).toContain('.select("time_zone")');
    expect(reader).toMatch(/catch \{\s*return DEFAULT_CLUB_TIME_ZONE;/);
  });

  it("tenant resolution and ClubContext never carry the zone (the 2026-08-14 outage)", () => {
    expect(read("lib/club-context.ts")).not.toMatch(/time_zone|timeZone/);
    expect(read("components/ClubContextProvider.tsx")).not.toMatch(/time_zone|timeZone/);
  });

  it("admin pages get the zone from AdminPortalProvider", () => {
    expect(read("components/admin/AdminPortalProvider.tsx")).toContain(
      "<ClubTimeZoneProvider timeZone={current.timeZone}>{children}</ClubTimeZoneProvider>",
    );
  });
});

describe("admin dates", () => {
  it("the dashboard's today is the club's today", () => {
    const data = read("lib/admin-dashboard-data.ts");
    expect(data).toContain("const today = clubToday(timeZone);");
    expect(data).not.toMatch(/now\.getFullYear\(\)/);
    expect(read("app/admin/(protected)/page.tsx")).toContain(
      "const data = await loadAdminDashboardData(supabase, club.id, timeZone);",
    );
  });

  it("the schedule's date labels come from the shared helper", () => {
    const schedule = read("app/admin/(protected)/schedule/page.tsx");
    expect(schedule).toContain('formatClubDate(dateValue, "month-year")');
    expect(schedule).toContain('formatClubDate(dateValue, "weekday-day")');
    expect(schedule).toContain('formatClubDate(dateValue, "weekday-day-month")');
    expect(schedule).not.toMatch(/WEEKDAY_SHORT_FORMATTER|MONTH_GROUP_FORMATTER/);
  });
});
