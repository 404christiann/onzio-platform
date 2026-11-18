/**
 * Operator SQL for Rose City's 2027 cinematic@2 cutover. This script only writes SQL text. It makes no network call and
 * needs no key. Christian reviews the file and runs it in the Supabase SQL editor (as postgres).
 *
 *   --step publish               Step A, before any admin editing: publishes Rose City's cinematic@2 presentation
 *                                document (presentation_documents, presentation_state, presentation_publications).
 *   --step presentation-inputs   Step B, after the owner has saved the cinematic homepage and uploaded the four
 *                                artworks in the admin: sets the operator-owned homepage inputs. Those are the four
 *                                artwork asset columns and presentation_config on homepage_revamp_content, plus the
 *                                episode video (behind_the_rose_section.video_url), which no admin save writes.
 *
 * Each file is one transaction:
 * - guards first;
 * - compare-and-set writes, so a rerun writes nothing and reports "no-op";
 * - then a single read-back row.
 * Without --commit the file ends in ROLLBACK, a rehearsal. With --commit it ends in COMMIT.
 *
 * Usage:
 *   npx tsx scripts/rose-city-2027-operator-sql.ts --step publish --actor <auth user uuid> [--commit] [--out file.sql]
 *   npx tsx scripts/rose-city-2027-operator-sql.ts --step presentation-inputs \
 *     --header-partner <asset uuid> --hero-poster <asset uuid> --seats-background <asset uuid> --episode-poster <asset uuid> \
 *     [--hero-video-guid <guid>] [--hero-video-library-id <id>] [--sponsor-treatment <sponsor logo uuid>=invert|dark-lettering ...] \
 *     [--episode-video-url https://www.youtube.com/embed/<11-character id>?rel=0] \
 *     [--commit] [--out file.sql]
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePresentationDocument, validatePresentationDocument, type PresentationDocument } from "@/packages/presentation";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";

export const ROSE_CITY_CLUB_ID = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
export const ROSE_CITY_SLUG = "rose-city";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DOCUMENT_CREATED_AT = "2026-11-17T00:00:00.000Z";

// The only tables and columns these files may write. tests/contracts/rose-city-2027-operator-sql.test.ts holds the
// generated SQL to exactly this list.
export const OPERATOR_WRITES = {
  publish: {
    "onzio.presentation_documents": ["id", "club_id", "version", "schema_version", "template_id", "template_version", "configuration", "configuration_digest", "created_by"],
    "onzio.presentation_state": ["club_id", "draft_document_id", "published_document_id", "updated_by", "updated_at"],
    "onzio.presentation_publications": ["id", "club_id", "action", "previous_document_id", "next_document_id", "next_configuration_digest", "validation_result", "created_by"],
  },
  "presentation-inputs": {
    "onzio.homepage_revamp_content": ["header_partner_media_asset_id", "hero_poster_media_asset_id", "seats_background_media_asset_id", "episode_poster_media_asset_id", "presentation_config"],
    "onzio.behind_the_rose_section": ["video_url"],
  },
} as const;

export type OperatorStep = keyof typeof OPERATOR_WRITES;

// The cinematic@2 template's default routes, written out so the published document is explicit. The guard test holds
// this list equal to the template registry.
export const ROSE_CITY_ROUTES = [
  "home", "club", "roster", "club-logo", "sponsors", "tryouts", "store", "schedule", "tickets", "season-membership", "stadium",
  "stadium-parking", "stadium-guidelines", "chick-fil-a", "know-before-you", "fan-code", "foothill-transit", "media-credentials",
  "injury-report", "news-page", "partnership", "national-anthem", "contact",
] as const;

/** The same theme, modules and sections as the approved local rehearsal (scripts/seed-rose-city-2027-local.ts). */
export function roseCityPresentationDocument(actorId: string): PresentationDocument {
  assertUuid(actorId, "--actor");
  return parsePresentationDocument({
    schemaVersion: 1, template: { id: "cinematic", version: 2 }, fontPack: "museomoderno-avenir",
    theme: {
      surface: { canvas: "#F7F7F7", elevated: "#FFFFFF", subtle: "#F7F7F7", inverse: "#141414" },
      text: { primary: "#141414", secondary: "#3C3C3C", muted: "#B8B8B8", inverse: "#F7F7F7" },
      action: { primary: "#E73C2E", primaryHover: "#E73C2E", primaryText: "#F7F7F7", secondary: "#141414" },
      border: { subtle: "#B8B8B8", strong: "#3C3C3C" },
      status: { success: "#94C946", warning: "#94C946", danger: "#CA2F3B" },
    },
    modules: { roster: true, schedule: true, store: true, sponsors: true, tryouts: true, contact: true, affiliations: true },
    homepage: { sections: (["cinematic.hero", "cinematic.matchday", "cinematic.gallery"] as const).map((type, index) => ({ id: `section-${index}`, type, enabled: true, emptyBehavior: "hide", config: {} })) },
    navigation: { groups: [{ id: "main", label: null, routes: [...ROSE_CITY_ROUTES] }] },
    metadata: { recommendationId: null, createdBy: actorId, createdAt: DOCUMENT_CREATED_AT, sourceArtifact: "Rose City 2027 cutover, operator step A" },
  }, { surface: "production" });
}

export type PresentationInputs = {
  headerPartner: string; heroPoster: string; seatsBackground: string; episodePoster: string;
  heroVideoGuid?: string; heroVideoLibraryId?: string;
  sponsorTreatments?: Record<string, "invert" | "dark-lettering">;
  episodeVideoUrl?: string;
};

// The episode player iframes this link (components/cinematic/CinematicEpisode.tsx). YouTube embed links only, in the
// same canonical form the match replay column enforces (lib/youtube-embed.ts). The SQL checks the same pattern.
export const DEFAULT_EPISODE_VIDEO_URL = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";
export const EPISODE_VIDEO_SQL_PATTERN = MATCH_REPLAY_EMBED_PATTERN.source;

export function episodeVideoUrl(inputs: PresentationInputs): string {
  const url = inputs.episodeVideoUrl ?? DEFAULT_EPISODE_VIDEO_URL;
  if (!MATCH_REPLAY_EMBED_PATTERN.test(url)) {
    throw new Error("--episode-video-url must be a YouTube embed link: https://www.youtube.com/embed/<11-character id>?rel=0");
  }
  return url;
}

// Artwork columns, the media kind each one renders as, and the alt text from the approved rehearsal.
export const PRESENTATION_ARTWORK = [
  { key: "headerPartner", column: "header_partner_media_asset_id", kind: "graphic", alt: "Foothill Transit" },
  { key: "heroPoster", column: "hero_poster_media_asset_id", kind: "photograph", alt: "Rose City players preparing their boots on the team bench" },
  { key: "seatsBackground", column: "seats_background_media_asset_id", kind: "graphic", alt: "" },
  { key: "episodePoster", column: "episode_poster_media_asset_id", kind: "photograph", alt: "Rose City players celebrating with their championship trophy" },
] as const;
export const DEFAULT_HERO_VIDEO = { guid: "d17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91", libraryId: "723074" };

export function presentationConfig(inputs: PresentationInputs) {
  return {
    heroVideoGuid: inputs.heroVideoGuid ?? DEFAULT_HERO_VIDEO.guid,
    heroVideoLibraryId: inputs.heroVideoLibraryId ?? DEFAULT_HERO_VIDEO.libraryId,
    sponsorTreatments: inputs.sponsorTreatments ?? {},
    artworkAlt: Object.fromEntries(PRESENTATION_ARTWORK.map(({ key, alt }) => [key, alt])),
  };
}

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new Error(`${label} must be a lowercase UUID.`);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function jsonLiteral(value: unknown, tag: string): string {
  const text = JSON.stringify(value);
  if (text.includes(`$${tag}$`)) throw new Error(`JSON contains the $${tag}$ quote tag.`);
  return `$${tag}$${text}$${tag}$::jsonb`;
}

function deterministicUuid(label: string): string {
  const hex = createHash("sha256").update(`rose-city-2027-operator:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function header(step: OperatorStep, commit: boolean, lines: string[]): string {
  return [
    `-- Rose City 2027 cutover, operator step ${step === "publish" ? "A (publish cinematic@2)" : "B (homepage presentation inputs)"}.`,
    "-- Generated by scripts/rose-city-2027-operator-sql.ts. Review before running; run in the Supabase SQL editor.",
    `-- Club ${ROSE_CITY_CLUB_ID} (${ROSE_CITY_SLUG}). Ends in ${commit ? "COMMIT" : "ROLLBACK (rehearsal; regenerate with --commit to apply)"}.`,
    "-- Rerunning is safe: unchanged values are not written and the read-back row says no-op.",
    ...lines.map((line) => `-- ${line}`),
    "",
    "begin;",
    "set local lock_timeout = '10s';",
    "set local statement_timeout = '60s';",
  ].join("\n");
}

const CLUB_GUARD = `  select * into v_club from onzio.clubs where id = v_club_id for update;
  if not found or v_club.slug <> ${quote(ROSE_CITY_SLUG)} then
    raise exception 'ROSE_CITY_NOT_FOUND: club % is missing or is not rose-city', v_club_id;
  end if;
  if v_club.lifecycle = 'archived' then raise exception 'ROSE_CITY_ARCHIVED'; end if;`;

export function buildPublishSql(options: { actorId: string; commit: boolean }): string {
  const document = roseCityPresentationDocument(options.actorId);
  const validation = validatePresentationDocument(document, { surface: "production" });
  if (!validation.valid) throw new Error(`Presentation document is invalid: ${JSON.stringify(validation.errors)}`);
  const digest = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  const documentId = deterministicUuid(`presentation-document:${ROSE_CITY_CLUB_ID}:${digest}`);
  return `${header("publish", options.commit, [`Actor ${options.actorId}. Document ${documentId}, digest ${digest}.`])}

do $operator$
declare
  v_club_id constant uuid := ${quote(ROSE_CITY_CLUB_ID)};
  v_actor constant uuid := ${quote(options.actorId)};
  v_document_id constant uuid := ${quote(documentId)};
  v_digest constant text := ${quote(digest)};
  v_configuration constant jsonb := ${jsonLiteral(document, "cfg")};
  v_club onzio.clubs;
  v_state onzio.presentation_state;
  v_has_state boolean;
  v_current onzio.presentation_documents;
  v_existing onzio.presentation_documents;
  v_target uuid;
  v_version integer;
  v_changes text[] := '{}';
begin
${CLUB_GUARD}
  if not exists (select 1 from auth.users where id = v_actor) then
    raise exception 'ACTOR_NOT_FOUND: auth user % does not exist', v_actor;
  end if;

  select * into v_state from onzio.presentation_state where club_id = v_club_id for update;
  v_has_state := found;
  if v_has_state and v_state.published_document_id is not null then
    select * into strict v_current from onzio.presentation_documents where club_id = v_club_id and id = v_state.published_document_id;
    if v_current.template_id = 'cinematic' and v_current.template_version = 2 and v_current.configuration_digest <> v_digest then
      raise exception 'DIFFERENT_CINEMATIC_2_PUBLISHED: document % (digest %) is already published; stop and review',
        v_current.id, v_current.configuration_digest;
    end if;
  end if;

  -- Document: reuse the one with this exact configuration, otherwise insert it as the next version.
  select * into v_existing from onzio.presentation_documents
    where club_id = v_club_id and template_id = 'cinematic' and template_version = 2 and configuration_digest = v_digest
    order by version desc limit 1;
  if found then
    if v_existing.configuration <> v_configuration then
      raise exception 'DIGEST_MATCH_CONFIGURATION_DIFFERS: document %', v_existing.id;
    end if;
    v_target := v_existing.id;
  else
    select coalesce(max(version), 0) + 1 into v_version from onzio.presentation_documents where club_id = v_club_id;
    insert into onzio.presentation_documents (id, club_id, version, schema_version, template_id, template_version, configuration, configuration_digest, created_by)
      values (v_document_id, v_club_id, v_version, 1, 'cinematic', 2, v_configuration, v_digest, v_actor);
    v_target := v_document_id;
    v_changes := v_changes || 'document inserted'::text;
  end if;

  -- Pointer: draft and published both on the target. A publication row records each actual publish.
  if not v_has_state then
    insert into onzio.presentation_state (club_id, draft_document_id, published_document_id, updated_by)
      values (v_club_id, v_target, v_target, v_actor);
    insert into onzio.presentation_publications (id, club_id, action, previous_document_id, next_document_id, next_configuration_digest, validation_result, created_by)
      values (gen_random_uuid(), v_club_id, 'publish', null, v_target, v_digest, ${jsonLiteral(validation, "val")}, v_actor);
    v_changes := v_changes || 'state inserted'::text || 'publication recorded'::text;
  elsif v_state.published_document_id is distinct from v_target or v_state.draft_document_id is distinct from v_target then
    if v_state.published_document_id is distinct from v_target then
      insert into onzio.presentation_publications (id, club_id, action, previous_document_id, next_document_id, next_configuration_digest, validation_result, created_by)
        values (gen_random_uuid(), v_club_id, 'publish', v_state.published_document_id, v_target, v_digest, ${jsonLiteral(validation, "val")}, v_actor);
      v_changes := v_changes || 'publication recorded'::text;
    end if;
    update onzio.presentation_state
      set draft_document_id = v_target, published_document_id = v_target, updated_by = v_actor, updated_at = now()
      where club_id = v_club_id;
    v_changes := v_changes || 'state updated'::text;
  end if;

  perform set_config('onzio_operator.result',
    case when cardinality(v_changes) = 0 then 'no-op' else 'changed: ' || array_to_string(v_changes, ', ') end, true);
end
$operator$;

-- Read-back.
select current_setting('onzio_operator.result', true) as result,
  s.published_document_id, s.draft_document_id,
  d.template_id || '@' || d.template_version as published_template, d.version as published_version,
  d.configuration_digest = ${quote(digest)} as digest_matches,
  (select count(*) from onzio.presentation_documents where club_id = s.club_id) as club_documents,
  (select count(*) from onzio.presentation_publications where club_id = s.club_id) as club_publications
from onzio.presentation_state s
join onzio.presentation_documents d on d.club_id = s.club_id and d.id = s.published_document_id
where s.club_id = ${quote(ROSE_CITY_CLUB_ID)};

${options.commit ? "commit;" : "rollback;"}
`;
}

export function buildPresentationInputsSql(options: { inputs: PresentationInputs; commit: boolean }): string {
  const { inputs } = options;
  for (const { key } of PRESENTATION_ARTWORK) assertUuid(inputs[key], `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  const ids = PRESENTATION_ARTWORK.map(({ key }) => inputs[key]);
  if (new Set(ids).size !== ids.length) throw new Error("The four artwork asset IDs must be different.");
  for (const [sponsorId, treatment] of Object.entries(inputs.sponsorTreatments ?? {})) {
    assertUuid(sponsorId, "--sponsor-treatment");
    if (treatment !== "invert" && treatment !== "dark-lettering") throw new Error("--sponsor-treatment must be invert or dark-lettering.");
  }
  const config = presentationConfig(inputs);
  if (!/^[0-9a-f-]{1,64}$/i.test(config.heroVideoGuid) || !/^[0-9]{1,12}$/.test(config.heroVideoLibraryId)) {
    throw new Error("--hero-video-guid or --hero-video-library-id is malformed.");
  }
  const sponsorIds = Object.keys(config.sponsorTreatments);
  const videoUrl = episodeVideoUrl(inputs);
  const artworkRows = PRESENTATION_ARTWORK.map(({ key, column, kind }) => `(${quote(column)}, ${quote(inputs[key])}::uuid, ${quote(kind)})`).join(", ");
  return `${header("presentation-inputs", options.commit, [
    ...PRESENTATION_ARTWORK.map(({ key, column }) => `${column} = ${inputs[key]} (${key})`),
    `behind_the_rose_section.video_url = ${videoUrl}`,
  ])}

do $operator$
declare
  v_club_id constant uuid := ${quote(ROSE_CITY_CLUB_ID)};
  v_config constant jsonb := ${jsonLiteral(config, "cfg")};
  v_video_url constant text := ${quote(videoUrl)};
  v_club onzio.clubs;
  v_template text;
  v_row onzio.homepage_revamp_content;
  v_video onzio.behind_the_rose_section;
  v_count integer;
  v_check record;
  v_asset onzio.media_assets;
  v_changes text[] := '{}';
begin
${CLUB_GUARD}
  select d.template_id || '@' || d.template_version into v_template
    from onzio.presentation_state s join onzio.presentation_documents d on d.club_id = s.club_id and d.id = s.published_document_id
    where s.club_id = v_club_id;
  if v_template is distinct from 'cinematic@2' then
    raise exception 'RUN_STEP_A_FIRST: Rose City publishes %, not cinematic@2', coalesce(v_template, 'nothing');
  end if;
  select * into v_row from onzio.homepage_revamp_content where club_id = v_club_id for update;
  if not found then
    raise exception 'SAVE_THE_CINEMATIC_HOMEPAGE_FIRST: Rose City has no homepage_revamp_content row yet';
  end if;
  select * into v_video from onzio.behind_the_rose_section where club_id = v_club_id for update;
  if not found then
    raise exception 'SAVE_THE_HOMEPAGE_VIDEO_SECTION_FIRST: Rose City has no behind_the_rose_section row yet';
  end if;
  if v_video_url !~ ${quote(EPISODE_VIDEO_SQL_PATTERN)} then
    raise exception 'EPISODE_VIDEO_NOT_YOUTUBE_EMBED: %', v_video_url;
  end if;
  -- Each artwork must be a published Rose City homepage asset of the kind its slot renders.
  for v_check in select * from (values ${artworkRows}) as t(column_name, asset_id, kind) loop
    select * into v_asset from onzio.media_assets where club_id = v_club_id and id = v_check.asset_id;
    if not found then
      raise exception 'ASSET_NOT_ROSE_CITY: % = % is not a Rose City media asset', v_check.column_name, v_check.asset_id;
    end if;
    if v_asset.status <> 'published' or v_asset.deleted_at is not null or v_asset.storage_bucket <> 'onzio-media' then
      raise exception 'ASSET_NOT_PUBLISHED: % = % (status %, bucket %)', v_check.column_name, v_check.asset_id, v_asset.status, v_asset.storage_bucket;
    end if;
    if v_asset.surface <> 'homepage' then
      raise exception 'ASSET_WRONG_SURFACE: % = % is on %, not homepage', v_check.column_name, v_check.asset_id, v_asset.surface;
    end if;
    if v_asset.media_kind <> v_check.kind then
      raise exception 'ASSET_WRONG_KIND: % = % is a %, expected %', v_check.column_name, v_check.asset_id, v_asset.media_kind, v_check.kind;
    end if;
  end loop;
${sponsorIds.length ? `  select count(*) into v_count from onzio.site_sponsor_logos where club_id = v_club_id and id = any(array[${sponsorIds.map(quote).join(", ")}]::uuid[]);
  if v_count <> ${sponsorIds.length} then raise exception 'SPONSOR_NOT_ROSE_CITY: a --sponsor-treatment ID is not a Rose City sponsor logo'; end if;` : "  -- No sponsor treatments requested."}

  if v_row.header_partner_media_asset_id is not distinct from ${quote(inputs.headerPartner)}::uuid
    and v_row.hero_poster_media_asset_id is not distinct from ${quote(inputs.heroPoster)}::uuid
    and v_row.seats_background_media_asset_id is not distinct from ${quote(inputs.seatsBackground)}::uuid
    and v_row.episode_poster_media_asset_id is not distinct from ${quote(inputs.episodePoster)}::uuid
    and v_row.presentation_config = v_config then
    null;
  else
    update onzio.homepage_revamp_content
      set header_partner_media_asset_id = ${quote(inputs.headerPartner)}::uuid,
          hero_poster_media_asset_id = ${quote(inputs.heroPoster)}::uuid,
          seats_background_media_asset_id = ${quote(inputs.seatsBackground)}::uuid,
          episode_poster_media_asset_id = ${quote(inputs.episodePoster)}::uuid,
          presentation_config = v_config
      where club_id = v_club_id;
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'EXPECTED_ONE_ROW: updated %', v_count; end if;
    v_changes := v_changes || 'homepage presentation inputs updated'::text;
  end if;

  if v_video.video_url is distinct from v_video_url then
    update onzio.behind_the_rose_section set video_url = v_video_url where club_id = v_club_id;
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'EXPECTED_ONE_ROW: updated %', v_count; end if;
    v_changes := v_changes || 'episode video updated'::text;
  end if;

  perform set_config('onzio_operator.result',
    case when cardinality(v_changes) = 0 then 'no-op' else 'changed: ' || array_to_string(v_changes, ', ') end, true);
end
$operator$;

-- Read-back.
select current_setting('onzio_operator.result', true) as result,
  r.header_partner_media_asset_id, r.hero_poster_media_asset_id, r.seats_background_media_asset_id, r.episode_poster_media_asset_id,
  r.presentation_config = ${jsonLiteral(config, "cfg")} as config_matches,
  r.presentation_config->>'heroVideoGuid' as hero_video_guid,
  v.video_url as episode_video_url,
  v.video_url = ${quote(videoUrl)} as episode_video_matches,
  (select revision from onzio_private.homepage_revisions where club_id = r.club_id) as homepage_revision
from onzio.homepage_revamp_content r
join onzio.behind_the_rose_section v on v.club_id = r.club_id
where r.club_id = ${quote(ROSE_CITY_CLUB_ID)};

${options.commit ? "commit;" : "rollback;"}
`;
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}.`);
    if (arg === "--commit") { flags.add(arg); continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
    values.set(arg, [...(values.get(arg) ?? []), value]);
  }
  const one = (name: string, required = true) => {
    const list = values.get(name) ?? [];
    if (list.length > 1) throw new Error(`${name} given more than once.`);
    if (required && !list[0]) throw new Error(`${name} is required.`);
    return list[0];
  };
  const known = new Set(["--step", "--actor", "--out", "--header-partner", "--hero-poster", "--seats-background", "--episode-poster", "--hero-video-guid", "--hero-video-library-id", "--sponsor-treatment", "--episode-video-url"]);
  for (const name of values.keys()) if (!known.has(name)) throw new Error(`Unknown option ${name}.`);
  return { values, commit: flags.has("--commit"), one };
}

function main() {
  const { values, commit, one } = parseArgs(process.argv.slice(2));
  const step = one("--step");
  let sql: string;
  if (step === "publish") {
    sql = buildPublishSql({ actorId: one("--actor")!, commit });
  } else if (step === "presentation-inputs") {
    if (values.has("--actor")) throw new Error("--actor is only for --step publish.");
    const sponsorTreatments = Object.fromEntries((values.get("--sponsor-treatment") ?? []).map((pair) => {
      const [id, treatment] = pair.split("=");
      return [id, treatment as "invert" | "dark-lettering"];
    }));
    sql = buildPresentationInputsSql({
      commit,
      inputs: {
        headerPartner: one("--header-partner")!, heroPoster: one("--hero-poster")!,
        seatsBackground: one("--seats-background")!, episodePoster: one("--episode-poster")!,
        heroVideoGuid: one("--hero-video-guid", false), heroVideoLibraryId: one("--hero-video-library-id", false),
        sponsorTreatments, episodeVideoUrl: one("--episode-video-url", false),
      },
    });
  } else {
    throw new Error("--step must be publish or presentation-inputs.");
  }
  const out = one("--out", false);
  if (out) {
    writeFileSync(resolve(out), sql, { encoding: "utf8", flag: "wx" });
    console.error(`Wrote ${out} (${commit ? "ends in COMMIT" : "rehearsal, ends in ROLLBACK"}). Review it before running.`);
  } else {
    process.stdout.write(sql);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}
