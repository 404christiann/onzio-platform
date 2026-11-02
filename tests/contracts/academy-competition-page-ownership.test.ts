import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Academy competition page ownership", () => {
  it.each([
    {
      page: "Roster",
      module: "components/sites/diverse-city/AcademyRosterPage.tsx",
      publicRoute: "app/(public)/roster/page.tsx",
      importLine: 'import AcademyRosterPage from "@/components/sites/diverse-city/AcademyRosterPage";',
      render: "<AcademyRosterPage />",
    },
    {
      page: "Schedule",
      module: "components/sites/diverse-city/AcademySchedulePage.tsx",
      publicRoute: "app/(public)/schedule/page.tsx",
      importLine: 'import AcademySchedulePage from "@/components/sites/diverse-city/AcademySchedulePage";',
      render: "<AcademySchedulePage />",
    },
  ])("dispatches Academy $page to its site module", ({ module, publicRoute, importLine, render }) => {
    expect(source(module)).toContain("export default function Academy");
    const route = source(publicRoute);
    expect(route).toContain(importLine);
    expect(route).toContain('if (club.presentationTemplateKey === "academy@1") return ' + render + ";");
  });

  it("keeps the existing tenant adapters and player and match detail pages in place", () => {
    expect(source("app/%5Fclubs/[slug]/roster/page.tsx").trim()).toBe(
      'export { default } from "@/app/(public)/roster/page";',
    );
    expect(source("app/%5Fclubs/[slug]/schedule/page.tsx").trim()).toBe(
      'export { default } from "@/app/(public)/schedule/page";',
    );
    expect(source("app/(public)/roster/[playerId]/page.tsx")).toContain(
      "<ClubhousePlayerProfilePage playerId={playerId} />",
    );
    expect(source("app/(public)/schedule/[fixtureId]/page.tsx")).toContain(
      "<ClubhouseMatchAreaPage fixtureId={fixtureId} />",
    );
  });

  it("shares the Academy standings table between the public destination and its editor preview", () => {
    const modulePath = "@/components/sites/diverse-city/AcademyStandingsTable";
    expect(source("components/LeagueStandingsContainer.tsx")).toContain(
      'import AcademyStandingsSection from "@/components/sites/diverse-city/AcademyStandingsSection";',
    );
    expect(source("components/sites/diverse-city/AcademyStandingsSection.tsx")).toContain(
      `from "${modulePath}"`,
    );
    expect(source("app/admin/(protected)/standings/page.tsx")).toContain(
      `import AcademyLeagueStandingsTable from "${modulePath}";`,
    );
    expect(source("components/sites/diverse-city/routes.ts")).not.toContain("standings:");
    expect(existsSync(resolve(process.cwd(), "app/%5Fclubs/[slug]/standings/page.tsx"))).toBe(false);
  });
});
