import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";
import { codeSiteAdminFor } from "@/lib/code-site-admin";

// ADMIN-RE-22: Diverse City screens. The Programs page words are the club's to
// change, and the Next Match card shows the next game of any kind with the
// competition taken from the game. No schema change.

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) return [];
    const relative = join(dir, name);
    if (statSync(join(ROOT, relative)).isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx)$/.test(name) ? [relative] : [];
  });
}

describe("Next Match on Diverse City's homepage", () => {
  const card = read("components/AcademyNextMatch.tsx");

  it("takes the competition from the game, not from the Standings title", () => {
    expect(card).not.toContain("fetchLeagueStandings");
    expect(card).not.toContain("leagueLabel");
    expect(card).toContain("nextMatchLabels(nextFixture)");
  });

  it("picks the next game of any kind: no league-only filter", () => {
    expect(card).not.toMatch(/competition\s*(===|!==|==|!=)/);
    expect(card).not.toMatch(/league_game|leagueGame/);
    expect(card).toContain("activeSeason ? fetchSchedule(activeSeason.id, club.id) : []");
  });

  it("says 'No game coming up' with no made-up opponent when nothing is scheduled", () => {
    expect(card).toContain("No game coming up");
    expect(card).not.toContain("Next Opponent");
    expect(card).not.toContain("Date and time TBA");
  });

  it("is used by Diverse City's homepage only", () => {
    const users = [...sourceFiles("app"), ...sourceFiles("components")].filter(
      (path) => path !== "components/AcademyNextMatch.tsx" && /import[^;]*AcademyNextMatch/.test(read(path)),
    );
    expect(users).toEqual(["components/sites/diverse-city/HomePage.tsx"]);
  });

  it("leaves the other clubs' Next Match card alone", () => {
    const other = read("components/NextMatchCard.tsx");
    expect(other).not.toContain("nextMatchLabels");
  });

  it("the Games form says where the competition shows, for Diverse City only", () => {
    expect(diverseCitySite.admin.schedule.competitionShowsOnNextMatch).toBe(true);
    expect(codeSiteAdminFor({ presentationTemplateKey: "clubhouse@1" })).toBeNull();
    const schedule = read("app/admin/(protected)/schedule/page.tsx");
    expect(schedule).toContain("competitionShowsOnNextMatch === true");
    expect(schedule).toContain("Shows under VS on your homepage Next Match card");
  });
});

describe("Programs page words on Diverse City", () => {
  const page = read("app/admin/(protected)/programs/page.tsx");

  it("turns the words editor on for Diverse City, and only through its site definition", () => {
    expect(diverseCitySite.admin.programs.showPageCopyEditor).toBe(true);
    expect(codeSiteAdminFor({ presentationTemplateKey: "academy@1" })?.programs.showPageCopyEditor).toBe(true);
    expect(codeSiteAdminFor({ presentationTemplateKey: "editorial@1" })).toBeNull();
    expect(page).toContain("programsPolicy ? !programsPolicy.showPageCopyEditor : false");
  });

  it("stops saying the words are managed by Onzio once the club can change them", () => {
    expect(page).toContain('hidesPageCopyEditor ? "Page copy managed by Onzio" : "Click a heading or paragraph to change its words"');
    expect(page).toContain("!hidesPageCopyEditor && (section === \"Page heading\" || section === \"Closing band\")");
  });

  it("writes the same eleven stored words as before, with no new table or column", () => {
    const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((name) => name > "20261109120000");
    expect(migrations.filter((name) => /programs_page|next_match|competition/.test(name))).toEqual([]);
    expect(page).toContain('.from("programs_page_content")');
  });
});
