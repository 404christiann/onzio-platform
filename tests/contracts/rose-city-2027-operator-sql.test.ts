import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { templateRegistry } from "@/packages/presentation";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";
import {
  DEFAULT_EPISODE_VIDEO_URL,
  EPISODE_VIDEO_SQL_PATTERN,
  OPERATOR_WRITES,
  ROSE_CITY_CLUB_ID,
  ROSE_CITY_ROUTES,
  buildPresentationInputsSql,
  buildPublishSql,
  type PresentationInputs,
} from "../../scripts/rose-city-2027-operator-sql";

// Guard for the Rose City 2027 cutover operator SQL. The two generated files may write only these tables and columns.
const EXPECTED_WRITES = {
  publish: {
    "onzio.presentation_documents": ["id", "club_id", "version", "schema_version", "template_id", "template_version", "configuration", "configuration_digest", "created_by"],
    "onzio.presentation_state": ["club_id", "draft_document_id", "published_document_id", "updated_by", "updated_at"],
    "onzio.presentation_publications": ["id", "club_id", "action", "previous_document_id", "next_document_id", "next_configuration_digest", "validation_result", "created_by"],
  },
  "presentation-inputs": {
    "onzio.homepage_revamp_content": ["header_partner_media_asset_id", "hero_poster_media_asset_id", "seats_background_media_asset_id", "episode_poster_media_asset_id", "presentation_config"],
    "onzio.behind_the_rose_section": ["video_url"],
  },
};

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const INPUTS: PresentationInputs = {
  headerPartner: "11111111-1111-4111-8111-111111111111",
  heroPoster: "22222222-2222-4222-8222-222222222222",
  seatsBackground: "33333333-3333-4333-8333-333333333333",
  episodePoster: "44444444-4444-4444-8444-444444444444",
  sponsorTreatments: { "55555555-5555-4555-8555-555555555555": "invert" },
};

// Dollar-quoted JSON literals hold data, not SQL, so they are removed before scanning.
const withoutJson = (sql: string) => sql.replace(/\$(cfg|val)\$[\s\S]*?\$\1\$/g, "''");

function writes(sql: string): Record<string, string[]> {
  const found: Record<string, Set<string>> = {};
  const add = (table: string, columns: string[]) => {
    found[table] ??= new Set();
    for (const column of columns) found[table].add(column);
  };
  const body = withoutJson(sql);
  for (const match of body.matchAll(/\binsert\s+into\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)/gi)) {
    add(match[1], match[2].split(",").map((column) => column.trim()));
  }
  for (const match of body.matchAll(/\bupdate\s+([a-z_]+\.[a-z_]+)\s+set\s+([\s\S]*?)\s+where\b/gi)) {
    add(match[1], [...match[2].matchAll(/(?:^|,)\s*([a-z_]+)\s*=/gi)].map((m) => m[1]));
  }
  return Object.fromEntries(Object.entries(found).map(([table, columns]) => [table, [...columns].sort()]));
}

const sorted = (table: Record<string, readonly string[]>) =>
  Object.fromEntries(Object.entries(table).map(([name, columns]) => [name, [...columns].sort()]));

describe("Rose City 2027 operator SQL", () => {
  const steps = {
    publish: (commit: boolean) => buildPublishSql({ actorId: ACTOR, commit }),
    "presentation-inputs": (commit: boolean) => buildPresentationInputsSql({ inputs: INPUTS, commit }),
  } as const;

  it("declares exactly the approved tables and columns", () => {
    expect(sorted(OPERATOR_WRITES.publish)).toEqual(sorted(EXPECTED_WRITES.publish));
    expect(sorted(OPERATOR_WRITES["presentation-inputs"])).toEqual(sorted(EXPECTED_WRITES["presentation-inputs"]));
  });

  for (const [step, build] of Object.entries(steps)) {
    describe(`--step ${step}`, () => {
      const sql = build(false);
      const scan = withoutJson(sql).toLowerCase();

      it("writes only the approved tables and columns, and all of them", () => {
        expect(writes(sql)).toEqual(sorted(EXPECTED_WRITES[step as keyof typeof EXPECTED_WRITES]));
      });

      it("never deletes, drops, alters, grants or creates anything", () => {
        for (const word of ["delete", "truncate", "drop", "alter", "grant", "revoke", "create", "copy", "merge", "security definer", "execute"]) {
          expect(scan, word).not.toMatch(new RegExp(`\\b${word}\\b`));
        }
      });

      it("is one transaction: begin first, a single read-back, and rollback unless --commit", () => {
        const statements = scan.split("\n").filter((line) => !line.startsWith("--") && line.trim());
        expect(statements[0]).toBe("begin;");
        expect(scan.match(/^begin;$/gm)).toHaveLength(1);
        expect(scan.match(/^(commit|rollback);$/gm)).toEqual(["rollback;"]);
        expect(scan.trimEnd().endsWith("rollback;")).toBe(true);
        expect(withoutJson(build(true)).toLowerCase().trimEnd().endsWith("commit;")).toBe(true);
        expect(scan.match(/^-- read-back\.$/gm)).toHaveLength(1);
      });

      it("only touches Rose City", () => {
        for (const match of scan.matchAll(/\bupdate\s+[a-z_]+\.[a-z_]+\s+set[\s\S]*?(where[^;]*);/g)) {
          expect(match[1]).toMatch(/where club_id = v_club_id/);
        }
        expect(scan).toContain(`v_club_id constant uuid := '${ROSE_CITY_CLUB_ID}'`);
        expect(scan).toContain("v_club.slug <> 'rose-city'");
      });

      it("writes only after comparing, so a rerun is a no-op", () => {
        expect(scan).toContain("set_config('onzio_operator.result'");
        expect(scan).toContain("'no-op'");
      });

      it("generates the same SQL for the same input", () => {
        expect(build(false)).toBe(sql);
      });
    });
  }

  it("publishes the cinematic@2 template's own default routes", () => {
    expect([...ROSE_CITY_ROUTES]).toEqual(templateRegistry["cinematic@2"].defaultRoutes);
  });

  describe("episode video (step B)", () => {
    it("defaults to the approved Rose City episode and accepts another YouTube embed link", () => {
      expect(buildPresentationInputsSql({ inputs: INPUTS, commit: false })).toContain(`v_video_url constant text := '${DEFAULT_EPISODE_VIDEO_URL}'`);
      const other = "https://www.youtube.com/embed/abcdefghijk?rel=0";
      expect(buildPresentationInputsSql({ inputs: { ...INPUTS, episodeVideoUrl: other }, commit: false })).toContain(`v_video_url constant text := '${other}'`);
    });

    it("refuses anything but a canonical YouTube embed link before writing SQL", () => {
      for (const url of [
        "https://www.youtube.com/watch?v=fJf_A4LdKDw",
        "https://youtu.be/fJf_A4LdKDw",
        "http://www.youtube.com/embed/fJf_A4LdKDw?rel=0",
        "https://www.youtube.com/embed/fJf_A4LdKDw",
        "https://evil.example/embed/fJf_A4LdKDw?rel=0",
        "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0'; drop table onzio.clubs; --",
        "",
      ]) {
        expect(() => buildPresentationInputsSql({ inputs: { ...INPUTS, episodeVideoUrl: url }, commit: false }), url).toThrow(/YouTube embed/);
      }
    });

    it("checks the same pattern in SQL, requires the video row, and only compares and sets video_url", () => {
      const sql = buildPresentationInputsSql({ inputs: INPUTS, commit: false });
      expect(EPISODE_VIDEO_SQL_PATTERN).toBe(MATCH_REPLAY_EMBED_PATTERN.source);
      expect(sql).toContain(`if v_video_url !~ '${EPISODE_VIDEO_SQL_PATTERN}' then`);
      expect(sql).toContain("SAVE_THE_HOMEPAGE_VIDEO_SECTION_FIRST");
      expect(sql).toContain("if v_video.video_url is distinct from v_video_url then");
      expect(sql).toMatch(/update onzio\.behind_the_rose_section set video_url = v_video_url where club_id = v_club_id;/);
    });
  });

  it("refuses malformed input before generating anything", () => {
    expect(() => buildPublishSql({ actorId: "not-a-uuid", commit: false })).toThrow(/--actor/);
    expect(() => buildPresentationInputsSql({ inputs: { ...INPUTS, heroPoster: INPUTS.headerPartner }, commit: false })).toThrow(/different/);
    expect(() => buildPresentationInputsSql({ inputs: { ...INPUTS, seatsBackground: "x" }, commit: false })).toThrow(/--seats-background/);
    expect(() => buildPresentationInputsSql({
      inputs: { ...INPUTS, sponsorTreatments: { "55555555-5555-4555-8555-555555555555": "glow" as "invert" } }, commit: false,
    })).toThrow(/invert or dark-lettering/);
  });

  it("makes no network call and needs no key", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/rose-city-2027-operator-sql.ts"), "utf8");
    for (const banned of ["createClient", "fetch(", "SERVICE_ROLE", "sb_secret", "process.env", "@supabase/"]) {
      expect(source, banned).not.toContain(banned);
    }
  });
});
