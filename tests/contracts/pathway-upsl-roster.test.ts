import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { upslRosterContent } from "@/components/pathway/content";
import {
  buildMlaPathwayPresentationConfiguration,
} from "@/scripts/mla-pathway-presentation";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("pathway UPSL roster", () => {
  it("dispatches pathway@1 to its own roster while preserving other templates", () => {
    const route = read("app/(public)/roster/page.tsx");

    expect(route).toContain(
      'import PathwayUpslRoster from "@/components/pathway/PathwayUpslRoster";',
    );
    expect(route).toContain(
      'if (club.presentationTemplateKey === "pathway@1") return <PathwayUpslRoster {...upslRosterContent} />;',
    );
    expect(route).not.toContain(
      'if (club.presentationTemplateKey === "pathway@1") notFound();',
    );
    expect(route.indexOf('presentationTemplateKey === "pathway@1"')).toBeLessThan(
      route.indexOf('presentationTemplateKey === "editorial@1"'),
    );

    const detail = read("app/%5Fclubs/[slug]/roster/[playerId]/page.tsx");
    expect(detail).toContain(
      'if (club.presentationTemplateKey === "pathway@1") notFound();',
    );
  });

  it("provides exactly Player 1 through Player 22 and neutral default staff", () => {
    expect(upslRosterContent.players).toHaveLength(22);
    expect(upslRosterContent.players.map((player) => player.name)).toEqual(
      Array.from({ length: 22 }, (_, index) => `Player ${index + 1}`),
    );
    expect(upslRosterContent.players.map((player) => player.squadNumber)).toEqual(
      Array.from({ length: 22 }, (_, index) => index + 1),
    );
    expect(
      new Set(upslRosterContent.players.map((player) => player.nationality)),
    ).toEqual(new Set(["American"]));
    expect(
      upslRosterContent.players.filter((player) => player.position === "GK"),
    ).toHaveLength(2);
    expect(
      upslRosterContent.players.filter((player) => player.position === "DF"),
    ).toHaveLength(6);
    expect(
      upslRosterContent.players.filter((player) => player.position === "MF"),
    ).toHaveLength(7);
    expect(
      upslRosterContent.players.filter((player) => player.position === "FW"),
    ).toHaveLength(7);
    expect(upslRosterContent.staff).toHaveLength(4);
    expect(upslRosterContent.staff.map((member) => member.name)).toEqual([
      "Staff 1",
      "Staff 2",
      "Staff 3",
      "Staff 4",
    ]);
    expect(new Set(upslRosterContent.staff.map((member) => member.role))).toEqual(
      new Set(["Technical Staff"]),
    );
    expect(
      new Set(upslRosterContent.staff.map((member) => member.nationality)),
    ).toEqual(new Set(["American"]));
  });

  it("matches the supplied crest-number-name hierarchy and includes flags", () => {
    const component = read("components/pathway/PathwayUpslRoster.tsx");

    expect(component).toContain('"use client"');
    expect(component).toContain("useClubBranding()");
    expect(component).toContain("clubLogoUrl || \"/club-logo\"");
    expect(component).toContain(
      'import ResilientImage from "@/components/ResilientImage"',
    );
    expect(component).toContain(
      'import NationalityFlag from "@/components/NationalityFlag"',
    );
    expect(component).toContain('imageDeliveryProps("club-logo")');
    expect(component).toContain("<PathwayImageFallback");
    expect(component).toContain('id="pathway-roster-filter"');
    expect(component).toContain('htmlFor="pathway-roster-filter"');
    expect(component).toContain('<option value="all">All squad</option>');
    expect(component).toContain('<option value="staff">Technical staff</option>');
    expect(component).toContain('className="sr-only" aria-live="polite"');
    expect(component).not.toMatch(/pathway-roster-content"\s+aria-live/);
    expect(component).toContain("Goalkeepers");
    expect(component).toContain("Defenders");
    expect(component).toContain("Midfielders");
    expect(component).toContain("Forwards");
    expect(component).toContain('data-interactive="false"');
    expect(component).toContain('data-pathway-roster-player-card="true"');
    expect(component).toContain('className="pathway-roster-card-number"');
    expect(component).toContain("player.squadNumber");
    expect(component).toContain('className="pathway-roster-card-flag"');
    expect(component).toContain("nationality={player.nationality}");
    expect(component).toContain("nationality={member.nationality}");
    expect(component.match(/<NationalityFlag/g)).toHaveLength(2);
    // Both flags take NationalityFlag's default 34px width, matching the
    // reference card where the flag balances the squad numeral beside it.
    expect(component).not.toMatch(/width=\{\d+\}/);
    // Staff cards drop the squad-number slot for the reference composition:
    // name + flag on the top line, then a monogram badge beside the role.
    expect(component).not.toContain("pathway-roster-card-staff-label");
    expect(component).toContain('className="pathway-roster-card-staff-role"');
    expect(component).toContain(
      'className="pathway-roster-card-staff-initials"',
    );
    expect(component).toContain('className="pathway-roster-card-staff-title"');
    expect(component).toContain("member.initials || staffInitials(member.name)");
    expect(component).toContain('className="pathway-roster-card-name"');
    expect(component).toContain('className="pathway-roster-card-position"');
    expect(component).not.toContain('from "next/link"');
    expect(component).not.toMatch(/href=|View profile|dialog|modal/i);
    expect(component).not.toMatch(/Manu Ledesma|manu-ledesma-academy|Real Madrid/i);
  });

  it("registers roster as a real pathway destination and published module", () => {
    const registry = read("packages/presentation/index.ts");
    const pathwayBlock = registry.slice(
      registry.indexOf('"pathway@1": {'),
      registry.indexOf("export function templateKey"),
    );
    const { configuration } = buildMlaPathwayPresentationConfiguration({
      createdBy: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-17T00:00:00.000Z",
    });

    expect(pathwayBlock).toMatch(
      /defaultRoutes:\s*\[[\s\S]*"league",\s*"roster",\s*"schedule",\s*"merch"/,
    );
    expect(pathwayBlock).toMatch(
      /supportedModules:\s*\[[^\]]*"roster"[^\]]*"staff"[^\]]*\]/,
    );
    expect(configuration.navigation.groups[0]?.routes).toContain("roster");
    expect(configuration.modules.roster).toBe(true);
    expect(configuration.modules.staff).toBe(true);
  });

  it("keeps the roster geometry pathway-scoped and responsive", () => {
    const css = read("styles/pathway.css");
    const start = css.indexOf("/* ============ UPSL ROSTER");
    const end = css.indexOf("/* ============", start + 30);
    const block = css.slice(start, end);
    const cardRule = block.match(/\.pathway-roster-card\s*\{[^}]+\}/)?.[0];
    const numberRule = block.match(
      /\.pathway-roster-card-number\s*\{[^}]+\}/,
    )?.[0];
    const nameRule = block.match(
      /\.pathway-roster-card-name\s*\{[^}]+\}/,
    )?.[0];
    const mediaRule = block.match(
      /\.pathway-roster-card-media\s*\{[^}]+\}/,
    )?.[0];
    const copyRule = block.match(
      /\.pathway-roster-card-copy\s*\{[^}]+\}/,
    )?.[0];
    const initialsRule = block.match(
      /\.pathway-roster-card-staff-initials\s*\{[^}]+\}/,
    )?.[0];
    const staffTitleRule = block.match(
      /\.pathway-roster-card-staff-title\s*\{[^}]+\}/,
    )?.[0];

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain(".pathway-roster-grid");
    expect(block).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(block).toContain("aspect-ratio: 3 / 4;");
    expect(block).toContain("object-fit: contain;");
    expect(cardRule).toContain("border: 0;");
    expect(cardRule).toContain("border-radius: 0;");
    expect(cardRule).toContain("background: var(--panel);");
    expect(cardRule).toContain("position: relative;");
    expect(cardRule).not.toContain("box-shadow");
    expect(mediaRule).toContain("position: absolute;");
    expect(mediaRule).toContain("inset: 0;");
    expect(copyRule).toContain("position: absolute;");
    expect(copyRule).toContain("inset: auto 0 0;");
    expect(copyRule).toContain("linear-gradient(");
    expect(numberRule).toContain("color: var(--accent);");
    // Upright, heavy and untracked — the reference numeral, not the earlier
    // italic condensed one that crowded the flag beside it.
    expect(numberRule).toContain("font-style: normal;");
    expect(numberRule).toContain("font-weight: 900;");
    expect(numberRule).toContain("letter-spacing: normal;");
    expect(numberRule).toContain("line-height: 1;");
    expect(nameRule).toContain("color: var(--primary);");
    expect(nameRule).toContain("font-style: italic;");
    expect(block).toContain(".pathway-roster-card-flag");
    expect(block).not.toContain(".pathway-roster-card-staff-label");
    expect(initialsRule).toContain("background: var(--accent);");
    expect(initialsRule).toContain("color: var(--ink);");
    expect(staffTitleRule).toContain("color: var(--accent);");
    expect(block).toContain(".pathway-roster-card-staff-role");
    expect(block).toContain("@media (max-width: 1050px)");
    expect(block).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(block).toContain("@media (max-width: 800px)");
    expect(block).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(block).not.toContain("100vw");
    expect(block).not.toMatch(/#(?:002b80|fc6601|077df2)/i);

    const selectorLines = block
      .split("\n")
      .filter((line) => line.includes(".pathway-roster"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });
});
