import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8").replace(/\r\n/g, "\n");
const migration = read("20261117010000_cinematic_shop_jersey_options.sql");
const source = read("20261104040000_cinematic_shop_update.sql");
const between = (text: string, start: string, end: string) => { const i = text.indexOf(start); return text.slice(i, text.indexOf(end, i) + end.length); };
const validate = (text: string) => between(text, "create or replace function onzio_private.validate_cinematic_shop_content(", "end $$;\n");
const save = (text: string) => between(text, "create or replace function onzio.save_shop_page(", "grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;\n");
const THIRD_FOR_CINEMATIC_SHOP = "not (coalesce(template,'')='cinematic@2' and page_surface='shop')";

describe("Rose City jersey options migration", () => {
  it("caps jersey options at three and accepts an optional heading of up to 80 characters", () => {
    const body = validate(migration);
    expect(body).toContain("jsonb_array_length(p_content->'editions')>3 then raise exception 'INVALID_SHOP_PRESENTATION'");
    expect(body).not.toContain("jsonb_array_length(p_content->'editions')>2");
    expect(body).toContain("added text[]:=array['editions','detailsHeading','details','cardIcons','attributes','sizeChart','mapHeading','editionsHeading'];");
    expect(body).toContain("when 'mapHeading' then 120 when 'editionsHeading' then 80 else 160 end");
    // Still optional: settings saved without it keep loading.
    expect(body).toContain("perform onzio_private.check_shop_object(p_content,legacy||added,legacy);");
  });

  it("allows the Third kit and its photo row only on the cinematic@2 Shop page", () => {
    const body = save(migration);
    expect(body).toContain(`if coalesce(template,'') not in ('clubhouse@1','editorial@1') and ${THIRD_FOR_CINEMATIC_SHOP} and variants ? 'third' then raise exception 'SECTION_UNAVAILABLE'`);
    expect(body).toContain(`if photo_rows ? 'third' and ${THIRD_FOR_CINEMATIC_SHOP} then raise exception 'SECTION_UNAVAILABLE'`);
    // The homepage feature and academy@1 still accept only their home kit.
    expect(body).toContain("if (page_surface='home' or template='academy@1') and (variants ? 'third' or variants ? 'away') then raise exception 'SECTION_UNAVAILABLE'");
    expect(body).toContain("if (page_surface='home' or template in ('academy@1','clubhouse@1','editorial@1')) and (photo_rows is not null or purchase is not null) then");
  });

  it("copies the newest definitions exactly apart from the six listed replacements", () => {
    const lines = (text: string) => text.split("\n");
    const changed = (before: string, after: string) => {
      const a = lines(before), b = lines(after);
      expect(b).toHaveLength(a.length);
      return a.map((line, i) => [line, b[i]]).filter(([x, y]) => x !== y);
    };
    expect(changed(validate(source), validate(migration))).toHaveLength(4);
    expect(changed(save(source), save(migration))).toHaveLength(2);
    expect(save(migration)).toContain("language plpgsql security invoker set search_path='' as $$");
    expect(validate(migration)).toContain("language plpgsql stable security invoker set search_path='' as $$");
    expect(migration).toContain("revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;");
    expect(migration.trimEnd().endsWith("notify pgrst,'reload schema';")).toBe(true);
    for (let n = 1; n <= 6; n++) expect(migration).toMatch(new RegExp(`^--\\s+${n}\\. `, "m"));
  });

  it("is additive only: two create-or-replace functions with their old signatures and grants, nothing else", () => {
    const sql = migration.split("\n").filter(line => !line.startsWith("--")).join("\n");
    const statements = sql.split("\n").filter(line => /^\S/.test(line) && !/^(declare|begin|end \$\$;|language )/.test(line));
    expect(statements).toEqual([
      "create or replace function onzio_private.validate_cinematic_shop_content(p_club_id uuid,p_content jsonb) returns void",
      "revoke all on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) from public,anon;",
      "grant execute on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) to authenticated,service_role;",
      "create or replace function onzio.save_shop_page(p_club_id uuid,p_request jsonb) returns jsonb",
      "revoke all on function onzio.save_shop_page(uuid,jsonb) from public,anon;",
      "grant execute on function onzio.save_shop_page(uuid,jsonb) to authenticated;",
      "notify pgrst,'reload schema';",
    ]);
    expect(sql).not.toMatch(/\b(drop|rename|alter|truncate)\b/i);
    // The only writes are the ones save_shop_page already performed.
    expect([...sql.matchAll(/\binsert into ([\w.]+)/g)].map(match => match[1])).toEqual(["onzio.shop_kit_section", "onzio.shop_purchase_details", "onzio.cinematic_shop_content", "onzio_private.shop_page_receipts"]);
    expect(sql).not.toMatch(/\bupdate onzio/i);
    expect(sql).not.toMatch(/^\s*delete from/im);
    for (const grant of ["revoke all on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) from public,anon;", "grant execute on function onzio_private.validate_cinematic_shop_content(uuid,jsonb) to authenticated,service_role;"]) {
      expect(read("20261013224434_cinematic_shop_page_content.sql")).toContain(grant);
    }
  });

  it("still accepts today's saves unchanged: up to two options, no heading, Home and Away kits only", () => {
    const body = validate(migration), oldBody = validate(source);
    const list = (text: string, name: string) => [...text.match(new RegExp(`${name} text\\[\\]:=array\\[([^\\]]*)\\]`))![1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    // Required keys are unchanged; the heading is only optional, so payloads without it pass.
    expect(list(body, "legacy")).toEqual(list(oldBody, "legacy"));
    expect(list(body, "legacy")).not.toContain("editionsHeading");
    expect(list(body, "added")).toEqual([...list(oldBody, "added"), "editionsHeading"]);
    // Every rule an old payload meets is still the same rule, and two options stay under the cap of three.
    expect(body.replace(">3 then", ">2 then").replace(",'editionsHeading']", "]").replace(" when 'editionsHeading' then 80", "")
      .replace("-- Jersey options (Home, Away, Third kits): up to three,", "-- Authentic / Replica: up to two,")).toBe(oldBody);
    // save_shop_page only loosens the two 'third' checks; Home/Away saves follow the same path.
    const saveBody = save(migration);
    expect(saveBody.replaceAll(` and ${THIRD_FOR_CINEMATIC_SHOP}`, "")).toBe(save(source));
    expect(saveBody).toContain("perform onzio_private.check_shop_object(variants,array['home','third','away']);");
  });
});
