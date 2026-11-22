import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { templateRegistry } from "@/packages/presentation";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";
import {
  DEFAULT_EPISODE_VIDEO_URL,
  DEFAULT_HERO_VIDEO,
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

  describe("presentation_config merge (RC-HERO-VIDEO-SWAP)", () => {
    const run = (inputs: Partial<PresentationInputs> = {}) => buildPresentationInputsSql({ inputs: { ...INPUTS, ...inputs }, commit: false });
    const cfgLiteral = (sql: string) => JSON.parse(/\$cfg\$([\s\S]*?)\$cfg\$/.exec(sql)![1]);

    it("merges with || and treats the run as a no-op only when the merge would change nothing", () => {
      const scan = withoutJson(run());
      expect(scan).toContain("presentation_config = presentation_config || v_merge");
      expect(scan).toContain("(v_row.presentation_config || v_merge) = v_row.presentation_config");
      expect(scan).not.toMatch(/presentation_config\s*=\s*v_config/);
      expect(scan).not.toMatch(/v_row\.presentation_config\s*=/);
    });

    it("compares owned keys by equality in the no-op check and the read-back, never containment", () => {
      const scan = withoutJson(run());
      expect(scan).not.toContain("@>");
      expect(scan).toMatch(/and \(v_row\.presentation_config \|\| v_merge\) = v_row\.presentation_config then/);
      expect(scan).toMatch(/\(r\.presentation_config \|\| \(''::jsonb - 'artworkAlt'\)\) = r\.presentation_config\n/);
      expect(scan).toMatch(/\|\| \(''::jsonb->'artworkAlt'\)\)\n\s+= coalesce\(r\.presentation_config->'artworkAlt', '\{\}'::jsonb\) as config_matches/);
    });

    it("leaves the hero video out of the payload unless the operator passes it", () => {
      const config = cfgLiteral(run());
      expect(config).not.toHaveProperty("heroVideoGuid");
      expect(config).not.toHaveProperty("heroVideoLibraryId");
      expect(config).toHaveProperty("sponsorTreatments");
      expect(config).toHaveProperty("artworkAlt");
    });

    it("falls back to the default hero video only when the row has no such key", () => {
      const scan = withoutJson(run());
      expect(scan).toContain("not (v_merge ? 'heroVideoGuid') and not (v_row.presentation_config ? 'heroVideoGuid')");
      expect(scan).toContain("not (v_merge ? 'heroVideoLibraryId') and not (v_row.presentation_config ? 'heroVideoLibraryId')");
      expect(scan).toContain(DEFAULT_HERO_VIDEO.guid);
    });

    it("includes the hero video when the operator passes it, and still validates it", () => {
      const guid = "aaaaaaaa-1111-4111-8111-111111111111";
      expect(cfgLiteral(run({ heroVideoGuid: guid, heroVideoLibraryId: "42" }))).toMatchObject({ heroVideoGuid: guid, heroVideoLibraryId: "42" });
      expect(() => run({ heroVideoGuid: "x'; drop table onzio.clubs; --" })).toThrow(/malformed/);
      expect(() => run({ heroVideoLibraryId: "abc" })).toThrow(/malformed/);
    });

    it("never writes or removes previousHeroVideoGuid", () => {
      for (const sql of [run(), run({ heroVideoGuid: "aaaaaaaa-1111-4111-8111-111111111111" })]) {
        expect(sql).not.toContain("previousHeroVideoGuid");
        expect(sql).not.toMatch(/presentation_config[ \t]*(#-|-[ \t]*')/);
      }
    });
  });

  describe("hero poster (RC-HERO-POSTER-01)", () => {
    const run = (inputs: Partial<PresentationInputs> = {}) => buildPresentationInputsSql({ inputs: { ...INPUTS, ...inputs }, commit: false });
    const cfgLiteral = (sql: string) => JSON.parse(/\$cfg\$([\s\S]*?)\$cfg\$/.exec(sql)![1]);
    const { heroPoster: _omitted, ...withoutPoster } = INPUTS;
    const noPoster = () => buildPresentationInputsSql({ inputs: withoutPoster, commit: false });

    it("is optional: without --hero-poster the SQL never writes or validates the poster column", () => {
      const sql = noPoster();
      const expected = { ...EXPECTED_WRITES["presentation-inputs"] };
      expected["onzio.homepage_revamp_content"] = expected["onzio.homepage_revamp_content"].filter((column) => column !== "hero_poster_media_asset_id");
      expect(writes(sql)).toEqual(sorted(expected));
      expect(sql).toContain("v_hero_poster constant uuid := null;");
      expect(withoutJson(sql)).not.toContain("('hero_poster_media_asset_id', ");
      expect(sql).toContain("-- hero_poster_media_asset_id is not written (no --hero-poster).");
    });

    it("writes a passed poster only while the row has none, in the same single update", () => {
      const scan = withoutJson(run());
      expect(scan).toContain(`v_hero_poster constant uuid := '${INPUTS.heroPoster}'::uuid;`);
      expect(scan).toContain("v_set_poster := v_hero_poster is not null and v_row.hero_poster_media_asset_id is null;");
      expect(scan).toContain("hero_poster_media_asset_id = case when v_set_poster then v_hero_poster else hero_poster_media_asset_id end,");
      expect(scan.match(/update onzio\.homepage_revamp_content/g)).toHaveLength(1);
      expect(scan).toMatch(/is not distinct from '[^']+'::uuid\n\s+and not v_set_poster\n/);
      expect(scan).not.toMatch(/hero_poster_media_asset_id is not distinct from/);
    });

    it("skips validating a passed poster the row will not use", () => {
      expect(withoutJson(run())).toContain("continue when v_check.column_name = 'hero_poster_media_asset_id' and not v_set_poster;");
    });

    it("merges artworkAlt key by key and adds the poster alt only with the poster", () => {
      for (const sql of [run(), noPoster()]) {
        expect(cfgLiteral(sql).artworkAlt).not.toHaveProperty("heroPoster");
        expect(cfgLiteral(sql).artworkAlt).toHaveProperty("headerPartner");
        const scan = withoutJson(sql);
        expect(scan).toContain("v_merge := jsonb_set(v_merge, '{artworkAlt}', coalesce(v_row.presentation_config->'artworkAlt', '{}'::jsonb) || (v_config->'artworkAlt')");
        expect(scan).toContain("|| case when v_set_poster then jsonb_build_object('heroPoster', 'Rose City players preparing their boots on the team bench') else '{}'::jsonb end);");
      }
    });

    it("never writes the previous poster or its alt", () => {
      for (const sql of [run(), noPoster()]) {
        expect(sql).not.toContain("previous_hero_poster_media_asset_id");
        expect(sql).not.toContain("previousHeroPosterAlt");
      }
    });

    it("still requires distinct artwork among the IDs passed", () => {
      expect(() => buildPresentationInputsSql({ inputs: { ...withoutPoster, seatsBackground: INPUTS.headerPartner }, commit: false })).toThrow(/different/);
      expect(() => run({ heroPoster: "x" })).toThrow(/--hero-poster/);
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
