import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Lions clubhouse roster presentation", () => {
  it("renders nationality flags on both player and staff cards", () => {
    const component = source("components/ClubhouseRosterPage.tsx");

    expect(component).toContain(
      'import NationalityFlag from "@/components/NationalityFlag"',
    );
    expect(component.match(/<NationalityFlag/g)).toHaveLength(2);
    expect(component).toContain("nationality={player.nationality}");
    expect(component).toContain("nationality={member.nationality}");
  });

  it("keeps Lions roster cards presentational instead of navigable", () => {
    const component = source("components/ClubhouseRosterPage.tsx");

    expect(component).toContain('data-clubhouse-roster-player-card="true"');
    expect(component).toContain('data-interactive="false"');
    expect(component).not.toContain('from "next/link"');
    expect(component).not.toContain("href={`/roster/${player.id}`}");
    expect(component).not.toContain("View profile");
    expect(component).not.toContain('data-interactive="true"');
  });

  it("does not use a legacy shared flags bucket for Lions", () => {
    const flags = source("lib/flags.ts");
    const component = source("components/NationalityFlag.tsx");

    expect(flags).not.toContain("/storage/v1/object/public/flags");
    expect(component).toContain("getFlagCountryCode(nationality)");
    expect(component).toContain("fi-${countryCode}");
  });
});
