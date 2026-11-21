import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const NAME = "20261117010000_cinematic_shop_jersey_options.sql";
const read = (name: string) => readFileSync(resolve(MIGRATIONS, name), "utf8").replace(/\r\n/g, "\n");
const migration = read(NAME);
// Newest definitions on main (6b9a7d07) and on the Rose City branch that this migration starts from.
const mainShop = read("20261022193528_shop_content_policy.sql");
const mainAssignment = read("20261021181721_homepage_assignment_saves.sql");
const mainHomepage = read("20261022183955_homepage_content_policy.sql");
const branchShop = read("20261112130000_cinematic_shop_update.sql");
const branchHomepage = read("20261112110000_cinematic_footer_logo.sql");

const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  expect(i, start).toBeGreaterThanOrEqual(0);
  return text.slice(i, text.indexOf(end, i) + end.length);
};
// From the function name to the end of its body (main created homepage_binding_identity with plain "create function").
const fn = (text: string, name: string) => between(text, `function ${name}(`, name === "onzio_private.homepage_snapshot" ? "\n$$;\n" : "\nend $$;\n");
const lines = (text: string) => text.split("\n");

/** Replaces each listed block of migration lines (found exactly once, in order) with what main had there. */
function withoutAdditions(body: string, edits: ReadonlyArray<readonly [added: readonly string[], main: readonly string[]]>): string[] {
  let result = lines(body);
  let from = 0;
  for (const [added, original] of edits) {
    const matches = (i: number) => added.every((line, k) => result[i + k] === line);
    const at = result.findIndex((_, i) => i >= from && matches(i));
    expect(at, added.join("\n")).toBeGreaterThanOrEqual(from);
    expect(result.findIndex((_, i) => i > at && matches(i)), added.join("\n")).toBe(-1);
    result = [...result.slice(0, at), ...original, ...result.slice(at + added.length)];
    from = at + original.length;
  }
  return result;
}

/** A contiguous block of migration lines, asserted to be copied unchanged from the branch definition. */
function blockFrom(body: string, first: string, last: string, branchBody: string): string[] {
  const all = lines(body);
  const start = all.indexOf(first);
  const end = all.indexOf(last, start);
  expect(start, first).toBeGreaterThanOrEqual(0);
  expect(end, last).toBeGreaterThan(start);
  const block = all.slice(start, end + 1);
  expect(branchBody).toContain(block.join("\n"));
  return block;
}

const SIX = [
  "onzio_private.validate_cinematic_shop_section",
  "onzio_private.validate_cinematic_shop_content",
  "onzio.save_shop_page",
  "onzio_private.homepage_binding_identity",
  "onzio_private.homepage_snapshot",
  "onzio.save_homepage",
];

describe("Rose City shop and homepage migration, reconciled with main", () => {
  it("is additive only: six create-or-replace functions, their grants and a schema reload, nothing else", () => {
    const sql = lines(migration).filter((line) => !line.startsWith("--")).join("\n");
    const statements = lines(sql).filter((line) => /^\S/.test(line) && !/^(declare|begin|end \$\$;|\$\$;|language )/.test(line));
    expect(statements).toEqual([
      "create or replace function onzio_private.validate_cinematic_shop_section(p_section jsonb) returns void",
      "revoke all on function onzio_private.validate_cinematic_shop_section(jsonb) from public,anon;",
      "grant execute on function onzio_private.validate_cinematic_shop_section(jsonb) to authenticated;",
      "create or replace function onzio_private.validate_cinematic_shop_content(p_club_id uuid,p_content jsonb) returns void",
      "revoke all on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) from public,anon;",
      "grant execute on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) to authenticated,service_role;",
      "create or replace function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb",
      "revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;",
      "grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;",
      "create or replace function onzio_private.homepage_binding_identity(p_design jsonb) returns jsonb",
      "revoke all on function onzio_private.homepage_binding_identity(jsonb) from public,anon,authenticated,service_role;",
      "create or replace function onzio_private.homepage_snapshot(p_club_id uuid) returns jsonb",
      "create or replace function onzio.save_homepage(p_club_id uuid,p_request jsonb) returns jsonb",
      "revoke all on function onzio.save_homepage(uuid,jsonb) from public,anon;",
      "grant execute on function onzio.save_homepage(uuid,jsonb) to authenticated;",
      "notify pgrst,'reload schema';",
    ]);
    expect(sql.match(/create or replace function/g)).toHaveLength(6);
    expect(sql).not.toMatch(/^\s*create function/im);
    expect(sql).not.toMatch(/\b(drop|rename|alter|truncate)\b/i);
    // Every write lives inside a function body: outside the $$ bodies there is no DML at all.
    const outside = sql.replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
    expect(outside).not.toMatch(/\b(insert|update|delete|copy)\b/i);
    expect(migration.trimEnd().endsWith("notify pgrst,'reload schema';")).toBe(true);
    // Grants are re-applied exactly as main or the branch first granted them.
    for (const [grant, origin] of [
      ["revoke all on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) from public,anon;", "20261112020000_cinematic_shop_page_content.sql"],
      ["grant execute on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) to authenticated,service_role;", "20261112020000_cinematic_shop_page_content.sql"],
      ["revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;", "20261022193528_shop_content_policy.sql"],
      ["grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;", "20261022193528_shop_content_policy.sql"],
      ["revoke all on function onzio_private.homepage_binding_identity(jsonb) from public,anon,authenticated,service_role;", "20261021181721_homepage_assignment_saves.sql"],
      ["revoke all on function onzio.save_homepage(uuid,jsonb) from public,anon;", "20261022183955_homepage_content_policy.sql"],
      ["grant execute on function onzio.save_homepage(uuid,jsonb) to authenticated;", "20261022183955_homepage_content_policy.sql"],
    ] as const) {
      expect(read(origin), grant).toContain(grant);
    }
    // The header names every function it defines.
    const header = lines(migration).filter((line) => line.startsWith("--")).join("\n");
    for (const name of SIX) expect(header, name).toContain(name);
  });

  it("is dated after every main migration, and no later migration redefines its functions, so its definitions are final", () => {
    const others = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql") && file !== NAME);
    // Main's newest migration at the merge (6b9a7d07).
    expect(others).toContain("20261111080000_purge_archived_club.sql");
    const later = others.filter((file) => file > NAME);
    // Only Rose City's own later migrations may sort after it (today: the archived-club purge tables),
    // plus main packages named here, which the loop below checks do not redefine its functions.
    // TELEMETRY-01's page telemetry redefines only the archived-club purge.
    const laterMainPackages = ["20261118200000_media_upload_quota.sql", "20261119010000_sponsor_and_news_caps.sql", "20261119090000_staging_insert_requires_reservation.sql", "20261119120000_media_orphan_sweep.sql", "20261120230000_hero_video_swap.sql", "20261121060000_page_telemetry.sql"]; // RC-ADMIN-10b, 10a, 10c, 10d, RC-HERO-VIDEO-SWAP (defines only hero_video functions), TELEMETRY-01
    expect(later.every((file) => file.includes("_cinematic_") || laterMainPackages.includes(file)), later.join(", ")).toBe(true);
    const ours = /function (onzio_private\.validate_cinematic_shop_section|onzio\.save_shop_page|onzio_private\.validate_cinematic_shop_content|onzio_private\.homepage_binding_identity|onzio_private\.homepage_snapshot|onzio\.save_homepage)\(/;
    for (const file of later) expect(ours.test(readFileSync(resolve(MIGRATIONS, file), "utf8")), file).toBe(false);
  });

  it("does not redefine main's validate_shop_section and never calls the unused 2-argument version", () => {
    expect(migration).not.toMatch(/function\s+onzio_private\.validate_shop_section\b/);
    expect(migration).not.toMatch(/validate_shop_section\(section,/);
    expect(migration).not.toContain("p_editorial");
  });

  it("allows ten bullets only for cinematic@2, checking every bullet with main's rules", () => {
    const section = fn(migration, "onzio_private.validate_cinematic_shop_section");
    expect(section).toContain("language plpgsql immutable security invoker set search_path='' as $$");
    expect(section).toContain("if jsonb_typeof(bullets)='array' and jsonb_array_length(bullets)>8 then");
    expect(section).toContain("if jsonb_array_length(bullets)>10 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;");
    expect(section).toContain("where b.position<=8)));");
    expect(section).toContain("where b.position>8)));");
    expect(section.match(/perform onzio_private\.validate_shop_section\(/g)).toHaveLength(3);
    // The only caller is save_shop_page (Shop page and homepage jersey), and only when the template is cinematic@2.
    expect(migration.match(/onzio_private\.validate_cinematic_shop_section\(section\)/g)).toHaveLength(1);
    expect(fn(migration, "onzio.save_shop_page")).toContain(
      "    if template='cinematic@2' then perform onzio_private.validate_cinematic_shop_section(section);\n    else perform onzio_private.validate_shop_section(section); end if;",
    );
  });

  it("accepts the 'cinematic' slideshow only together with templateKey cinematic@2", () => {
    const binding = fn(migration, "onzio_private.homepage_binding_identity");
    expect(binding).toContain("not in ('none','editorial','matchday','legacy','cinematic')");
    expect(binding).toContain("or ((p_design->>'slideshowVariant')='cinematic' and k is distinct from 'cinematic@2') then\n    raise exception 'INVALID_HOMEPAGE_BINDING'");
  });

  it("validate_cinematic_shop_content is the branch definition plus the heading and a third jersey option", () => {
    const before = lines(fn(branchShop, "onzio_private.validate_cinematic_shop_content"));
    const after = lines(fn(migration, "onzio_private.validate_cinematic_shop_content"));
    expect(after).toHaveLength(before.length);
    const changed = before.map((line, i) => [line, after[i]] as const).filter(([a, b]) => a !== b);
    expect(changed.map(([, b]) => b.trim())).toEqual([
      "added text[]:=array['editions','detailsHeading','details','cardIcons','attributes','sizeChart','mapHeading','editionsHeading'];",
      "when 'detailsHeading' then 120 when 'mapHeading' then 120 when 'editionsHeading' then 80 else 160 end) then",
      "-- Jersey options (Home, Away, Third kits): up to three, each with a label, price, line and optional http(s) purchase link.",
      "if jsonb_typeof(p_content->'editions') is distinct from 'array' or jsonb_array_length(p_content->'editions')>3 then raise exception 'INVALID_SHOP_PRESENTATION' using errcode='22023'; end if;",
    ]);
    // The heading is optional (not in the required legacy list), so saves without it keep working.
    expect(after).toContain("  perform onzio_private.check_shop_object(p_content,legacy||added,legacy);");
  });

  it("save_shop_page is main's definition plus the branch's cinematic presentation and the cinematic@2 bullet check", () => {
    const body = fn(migration, "onzio.save_shop_page");
    const branch = fn(branchShop, "onzio.save_shop_page");
    expect(body.startsWith("function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb\nlanguage plpgsql security invoker set search_path='' as $$\n")).toBe(true);
    const validatePresentation = blockFrom(body, "  if presentation is not null then", "  end if;", branch);
    const savePresentation = blockFrom(body, "    select c.map_media_asset_id,onzio_private.cinematic_shop_detail_assets(c) into old_map,old_details", "    end loop;", branch);
    expect(validatePresentation).toHaveLength(4);
    expect(savePresentation).toHaveLength(16);
    const reverted = withoutAdditions(body, [
      [["  template text; presentation jsonb; old_map uuid; old_details uuid[]:='{}'; new_details uuid[]; kept uuid[]; old_asset uuid;"], []],
      [["  perform onzio_private.check_shop_object(p_request,array['operationId','surface','expectedRevision','designRevision','variants','photoRows','purchase','presentation'],"],
        ["  perform onzio_private.check_shop_object(p_request,array['operationId','surface','expectedRevision','designRevision','variants','photoRows','purchase'],"]],
      [["  initial:=onzio_private.shop_page_snapshot(p_club_id,page_surface); template:=initial->>'templateKey';"],
        ["  initial:=onzio_private.shop_page_snapshot(p_club_id,page_surface);"]],
      [["  variants:=p_request->'variants'; photo_rows:=p_request->'photoRows'; purchase:=p_request->'purchase'; presentation:=p_request->'presentation';"],
        ["  variants:=p_request->'variants'; photo_rows:=p_request->'photoRows'; purchase:=p_request->'purchase';"]],
      [["  if variants='{}'::jsonb and photo_rows is null and purchase is null and presentation is null then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;"],
        ["  if variants='{}'::jsonb and photo_rows is null and purchase is null then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;"]],
      [validatePresentation, []],
      [["    if template='cinematic@2' then perform onzio_private.validate_cinematic_shop_section(section);", "    else perform onzio_private.validate_shop_section(section); end if;"],
        ["    perform onzio_private.validate_shop_section(section);"]],
      [["  if presentation is not null then", ...savePresentation, "  end if;"], []],
    ]);
    expect(reverted).toEqual(lines(fn(mainShop, "onzio.save_shop_page")));
    // Main's content policy: no template rules for kits or photo rows, so a third kit and third photo row are allowed.
    expect(body).not.toMatch(/variants \? 'third' then raise/);
    expect(body).not.toMatch(/photo_rows \? 'third'/);
    expect(body).toContain("if page_surface='home' and (variants ? 'third' or variants ? 'away') then raise exception 'SECTION_UNAVAILABLE'");
    // Presentation content stays cinematic@2 Shop page only.
    expect(validatePresentation[1]).toBe("    if page_surface<>'shop' or template is distinct from 'cinematic@2' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;");
  });

  it("homepage_binding_identity is main's definition plus cinematic@2 and its slideshow", () => {
    const body = fn(migration, "onzio_private.homepage_binding_identity");
    expect(body.startsWith("function onzio_private.homepage_binding_identity(p_design jsonb) returns jsonb\nlanguage plpgsql immutable security definer set search_path='' as $$\n")).toBe(true);
    expect(withoutAdditions(body, [
      [["  if (k is not null and k not in ('academy@1','editorial@1','clubhouse@1','cinematic@1','heritage@1','cinematic@2'))"],
        ["  if (k is not null and k not in ('academy@1','editorial@1','clubhouse@1','cinematic@1','heritage@1'))"]],
      [["    or (p_design->>'slideshowVariant') is null or (p_design->>'slideshowVariant') not in ('none','editorial','matchday','legacy','cinematic')",
        "    or ((p_design->>'slideshowVariant')='cinematic' and k is distinct from 'cinematic@2') then"],
        ["    or (p_design->>'slideshowVariant') is null or (p_design->>'slideshowVariant') not in ('none','editorial','matchday','legacy') then"]],
    ])).toEqual(lines(fn(mainAssignment, "onzio_private.homepage_binding_identity")));
  });

  it("homepage_snapshot is main's definition plus the branch's cinematic content and artwork media", () => {
    const body = fn(migration, "onzio_private.homepage_snapshot");
    const branch = fn(branchHomepage, "onzio_private.homepage_snapshot");
    const revamp = " || case when onzio_private.cinematic_homepage_json(p_club_id) is null then '{}'::jsonb else jsonb_build_object('revamp',onzio_private.cinematic_homepage_json(p_club_id)) end,";
    const artwork = "        or exists(select 1 from onzio.homepage_revamp_content r where r.club_id=p_club_id and m.id=any(array[r.raffle_media_asset_id,r.ticket_media_asset_id,r.trophy_media_asset_id,r.header_partner_media_asset_id,r.hero_poster_media_asset_id,r.seats_background_media_asset_id,r.episode_poster_media_asset_id,r.footer_logo_media_asset_id])))),'[]'::jsonb)";
    expect(branch).toContain(revamp);
    expect(branch).toContain(artwork);
    expect(withoutAdditions(body, [
      [[`          from onzio.homepage_slideshow_photos p where p.club_id=p_club_id),'[]'::jsonb)))${revamp}`],
        ["          from onzio.homepage_slideshow_photos p where p.club_id=p_club_id),'[]'::jsonb))),"]],
      [["      and (exists(select 1 from onzio.homepage_slideshow_photos p where p.club_id=p_club_id and p.media_asset_id=m.id)", artwork],
        ["      and exists(select 1 from onzio.homepage_slideshow_photos p where p.club_id=p_club_id and p.media_asset_id=m.id)),'[]'::jsonb)"]],
    ])).toEqual(lines(fn(mainAssignment, "onzio_private.homepage_snapshot")));
  });

  it("save_homepage is main's definition plus the branch's cinematic@2 section and seven-photo slideshow", () => {
    const body = fn(migration, "onzio.save_homepage");
    const branch = fn(branchHomepage, "onzio.save_homepage");
    const revampCheck = [
      "    if section='revamp' and coalesce(template,'')<>'cinematic@2' then raise exception 'SECTION_UNAVAILABLE' using errcode='22023'; end if;",
      "    if section='revamp' then",
      "      perform onzio_private.check_cinematic_homepage(fields);",
      "      continue;",
      "    elsif section='hero' then",
    ];
    // The branch's cinematic@2 gate, without the per-template rules main's content policy removed.
    expect(branch).toContain("    if (section='revamp' and coalesce(template,'')<>'cinematic@2') or ");
    expect(branch).toContain(revampCheck.slice(1).join("\n"));
    const revampSave = blockFrom(body, "  if sections ? 'revamp' then", "  end if;", branch);
    expect(revampSave).toHaveLength(14);
    expect(withoutAdditions(body, [
      [["  op uuid; saved_hash text; request_hash text; receipt jsonb; maximum integer; template text;"],
        ["  op uuid; saved_hash text; request_hash text; receipt jsonb; maximum integer;"]],
      [["  initial:=onzio_private.homepage_snapshot(p_club_id); template:=initial#>>'{design,templateKey}';"],
        ["  initial:=onzio_private.homepage_snapshot(p_club_id);"]],
      [["  perform onzio_private.check_homepage_object(sections,array['hero','photos','story','video','revamp']);"],
        ["  perform onzio_private.check_homepage_object(sections,array['hero','photos','story','video']);"]],
      [revampCheck, ["    if section='hero' then"]],
      [["    if jsonb_typeof(sections#>'{photos,items}') is distinct from 'array' or jsonb_array_length(sections#>'{photos,items}')>(case when template='cinematic@2' then 7 else 6 end) then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;"],
        ["    if jsonb_typeof(sections#>'{photos,items}') is distinct from 'array' or jsonb_array_length(sections#>'{photos,items}')>6 then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;"]],
      [revampSave, []],
    ])).toEqual(lines(fn(mainHomepage, "onzio.save_homepage")));
  });
});
