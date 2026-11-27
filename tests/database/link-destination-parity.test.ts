import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeLinkDestination, type LinkKind } from "@/lib/link-destination";
import { starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { GOLDEN_SAVED_LINKS, LINK_DESTINATION_RULES, type LinkDestinationCase } from "../fixtures/link-destinations";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";

// onzio_private.normalize_link_destination is the SQL copy of normalizeLinkDestination.
// The two must return the same output for every input, so each save path that checks a
// link in SQL accepts exactly what the application saves.

type Case = { input: string; allow?: readonly LinkKind[] };

const ALLOW_SETS: readonly (readonly LinkKind[] | undefined)[] = [
  undefined, ["https"], ["path"], ["email"], ["https", "email"], ["path", "email"], ["https", "path"], [],
];

const HOSTS = [
  "club.com", "www.Club.COM", "forms.gle", "a.b-c.example.org", "xn--caf-dma.com", "club.co1", "club.c-m",
  "localhost", "app.localhost", "APP.LocalHost", "club.local", "club.internal", "club.invalid", "club.test", "club.TEST",
  "club.example", "example", "example.com", "test.com", "notlocal.com", "club.testing", "127.0.0.1", "club", "club.9com",
  "club.com.", ".club.com", "a..b.com", "-bad.com", "bad-.com", "club.-com", "club.com-", "cl_ub.com", "user:pw@club.com",
  "user@club.com", `${"a".repeat(63)}.com`, `${"a.".repeat(125)}com`, `${"a.".repeat(125)}comm`, `${"a.".repeat(124)}abcd`,
];
const PORTS = ["", ":80", ":8443", ":65535", ":65536", ":00080", ":99999", ":123456", ":", ":8a", ":-1"];
const TAILS = [
  "", "/", "/path", "/Path/To?x=1&y=2#frag", "?q=1", "#frag", "/a%20b", "/a b", "/a\\b", "/<x>", "/a[b]", "/a'b", "/~u/(x)*+,;=:@!$&",
  "//double", "/café", "/a\"b", "/a`b", "/{x}", "/a|b", "/a^b", "/a\tb",
];
const PREFIXES = [
  "", "https://", "http://", "HTTPS://", "HtTp://", "https:", "https:/", "https:///", "//", "/", "/\\", "mailto:", "MAILTO:", "MailTo:",
  "mailto://", "mailto:mailto:", "ftp://", "javascript:", "JaVaScRiPt:", "data:", "tel:", "x-y+z:", "1http://", ":", "@", "#", "?",
];
const LOCALS = ["info", "Info.Desk", "a+b", "a!$%&'*=_~-z", "a b", "a\"b", "", "a@b", "a/b", "a:b", "a#b", "a?b", "a(b)", "a,b", "café"];
const MAIL_QUERIES = ["", "?", "?subject=Hi", "?subject=Hi%20there&cc=x@club.com", "?a/b?c", "?a#b", "#x", "?a b", "?a[b]", "?a'b"];
const PATHS = [
  "/", "/tickets", "/club/about", "/shop?variant=home#kit", "//evil.com", "///x", "/\\evil.com", "/a b", "/a%20b", "/~u/(x)*+,;=:@!$&'",
  "/a[b]", "/café", "/x\ny", "/@club", "/mailto:x@club.com", "/https://club.com", "/#", "/?", "/a\"b", "/a<b", "/a{b}", "/a|b", "/a^b", "/a`b",
];
const JUNK = [
  "club", "has space.com", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "tel:+15551234567",
  "https://", "http://", "https:", "mailto:", "mailto:?subject=x", "@", "a@", "@club.com", "a@b", "a@b@club.com", "a@club.com@club.com",
  "x:y@club.com", "x/y@club.com", "x?y@club.com", "x#y@club.com", "club.com/@handle", "club.com?x=@y", "club.com#@y", "club.com:80@x",
  "http:club.com", "http:/club.com", "https://club.com:", "https://:80", "https://?x", "https://#x", "https:///path", "..", ".", "a.b",
  " club.com", "club.com ", " club.com", "﻿club.com", "club.com\u0085", "\u{1f600}.com", "ınfo@club.com",
];
const EDGES: readonly (readonly [string, string])[] = [
  ["", ""], [" ", ""], ["", " "], ["\t\n", "\r\n"], ["\f\v ", " \v\f"], [" ", ""], ["", " "], ["﻿", ""], ["\u000b", "\u000c"], ["\u001f", ""], ["", "\u007f"],
];

/** Fixed-seed generator: the same variants on every run. */
function sequence(seed: number) {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  };
}

function mixCase(value: string, next: (bound: number) => number) {
  return [...value].map(ch => (next(2) ? ch.toUpperCase() : ch.toLowerCase())).join("");
}

function generatedCases(): Case[] {
  const cases: Case[] = [];
  const next = sequence(20261127);
  const pick = <T,>(items: readonly T[]) => items[next(items.length)];
  const add = (input: string, allow?: readonly LinkKind[]) => cases.push(allow ? { input, allow } : { input });

  // Every fixture row under every allow set.
  for (const [input] of [...GOLDEN_SAVED_LINKS, ...LINK_DESTINATION_RULES]) for (const allow of ALLOW_SETS) add(input, allow);

  // Every prefix on every host, with rotating port and tail.
  for (const prefix of PREFIXES) for (const host of HOSTS) {
    add(`${prefix}${host}`);
    add(`${prefix}${host}${pick(PORTS)}${pick(TAILS)}`, pick(ALLOW_SETS));
  }
  // Every port and every tail on a good and a private host.
  for (const host of ["club.com", "app.localhost"]) for (const port of PORTS) for (const tail of TAILS) {
    add(`https://${host}${port}${tail}`);
    add(`${host}${port}${tail}`, pick(ALLOW_SETS));
  }
  // Emails: every local part, host and query, bare and with mailto.
  for (const local of LOCALS) for (const host of HOSTS) {
    add(`${local}@${host}`);
    add(`${pick(["mailto:", "MAILTO:", "mailto://", ""])}${local}@${host}${pick(MAIL_QUERIES)}`, pick(ALLOW_SETS));
  }
  for (const query of MAIL_QUERIES) for (const prefix of ["", "mailto:"]) add(`${prefix}info@club.com${query}`);
  // Paths and junk under every allow set and prefix.
  for (const path of PATHS) for (const allow of ALLOW_SETS) add(path, allow);
  for (const junk of JUNK) for (const allow of ALLOW_SETS) add(junk, allow);
  for (const prefix of PREFIXES) for (const path of PATHS) add(`${prefix}${path}`);

  // Every character the database can store up to U+017F, in each position that has its own rule.
  for (let code = 1; code <= 0x17f; code++) {
    const ch = String.fromCharCode(code);
    for (const input of [ch, `${ch}club.com`, `club.com${ch}`, `clu${ch}b.com`, `club.com/${ch}`, `/x${ch}`, `in${ch}fo@club.com`, `info@club.com?${ch}`, `ht${ch}tp://club.com`, `club.com:8${ch}`]) add(input);
  }

  // Edge whitespace, mixed case and random splices over everything so far.
  const base = cases.length;
  for (let index = 0; index < base; index += 7) {
    const { input, allow } = cases[index];
    const [before, after] = pick(EDGES);
    add(`${before}${input}${after}`, allow);
    add(mixCase(input, next), allow);
  }
  for (let index = 0; index < 600; index++) {
    const pieces = [pick(PREFIXES), pick([...HOSTS, ...LOCALS]), pick(["", "@", ":", "/", "?", "#", "."]), pick(HOSTS), pick(PORTS), pick([...TAILS, ...MAIL_QUERIES])];
    add(pieces.join(""), pick(ALLOW_SETS));
  }
  return cases;
}

const fromTypeScript = ({ input, allow }: Case) => normalizeLinkDestination(input, allow ? { allow } : {});

describe("link destination: SQL copy matches the TypeScript normalizer", () => {
  let db: Client;
  beforeAll(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); });
  afterAll(async () => { await db?.end(); });

  /** One query for all cases; rows come back in input order. */
  async function fromSql(cases: readonly Case[]): Promise<(string | null)[]> {
    const result = await db.query(
      `select case when item.value ? 'allow'
           then onzio_private.normalize_link_destination(item.value->>'input', array(select jsonb_array_elements_text(item.value->'allow')))
           else onzio_private.normalize_link_destination(item.value->>'input') end as output
         from jsonb_array_elements($1::jsonb) with ordinality as item(value, position)
        order by item.position`,
      [JSON.stringify(cases)],
    );
    return result.rows.map(row => row.output);
  }

  it("returns the fixture's expected value from both", async () => {
    const rows: readonly LinkDestinationCase[] = [...GOLDEN_SAVED_LINKS, ...LINK_DESTINATION_RULES];
    const cases = rows.map(([input, , allow]) => (allow ? { input, allow } : { input }));
    const sql = await fromSql(cases);
    expect(rows.length).toBeGreaterThan(60);
    expect(cases.map(fromTypeScript)).toEqual(rows.map(([, expected]) => expected));
    expect(sql.map((output, index) => [rows[index][0], output])).toEqual(rows.map(([input, expected]) => [input, expected]));
  });

  it("returns the same output for every generated variant", async () => {
    const cases = generatedCases();
    const sql = await fromSql(cases);
    expect(sql).toHaveLength(cases.length);
    expect(cases.length).toBeGreaterThan(5000);
    const mismatches = cases.flatMap((item, index) => {
      const typescript = fromTypeScript(item);
      return typescript === sql[index] ? [] : [{ input: item.input, allow: item.allow ?? "default", typescript, sql: sql[index] }];
    });
    expect(mismatches).toEqual([]);
    // The variants must exercise both outcomes of every kind, or the comparison proves little.
    const outputs = new Set(sql.map(output => (output === null ? "rejected" : output === "" ? "blank" : output.split(/[:/]/)[0] || "path")));
    expect([...outputs].sort()).toEqual(["blank", "https", "mailto", "path", "rejected"]);
    console.info(`[link-destination-parity] compared ${cases.length} generated cases, ${mismatches.length} mismatches`);
  });

  it("is idempotent: a normalized value normalizes to itself", async () => {
    const cases = generatedCases();
    const normalized = (await fromSql(cases)).flatMap((output, index) => (output === null ? [] : [{ input: output, allow: cases[index].allow }]));
    expect(await fromSql(normalized)).toEqual(normalized.map(item => item.input));
  });

  it("treats NULL input as rejected and a NULL allow list as the default", async () => {
    const row = (await db.query(
      `select onzio_private.normalize_link_destination(null) as missing,
              onzio_private.normalize_link_destination('club.com', null) as defaulted`,
    )).rows[0];
    expect(row).toEqual({ missing: null, defaulted: "https://club.com" });
  });

  it("is immutable and callable only by the roles that write club content", async () => {
    const row = (await db.query(
      `select p.provolatile, p.proparallel, p.prosecdef, p.proconfig,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p where p.oid = 'onzio_private.normalize_link_destination(text,text[])'::regprocedure`,
    )).rows[0];
    expect(row).toEqual({ provolatile: "i", proparallel: "s", prosecdef: false, proconfig: ['search_path=""'], authenticated: true, service_role: true, anon: false });
  });
});

describe("link destination: save paths accept only the normalized form", () => {
  let db: Client;
  const clubId = CLUB_IDS.alpha;
  const REJECTED = ["//evil.com", "javascript:alert(1)", " https://x.com", "http://x.com", "x.com", "https://app.localhost/x", "https://club.internal"];

  async function actor() {
    await db.query("reset role");
    const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
      sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
    })]);
    await db.query("set local role authenticated");
  }
  async function design(template: string, version: number, routes?: string[]) {
    await db.query("reset role");
    const id = randomUUID();
    const configuration = { schemaVersion: 1, template: { id: template, version }, ...(routes ? { navigation: { groups: [{ routes }] } } : {}) };
    await db.query(`insert into onzio.presentation_documents
      (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values ($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,$4,$5,$6,$7)`,
    [id, clubId, template, version, JSON.stringify(configuration), "a".repeat(64), USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
      values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`, [clubId, id, USER_IDS.ownerAal2]);
    await actor();
  }
  async function rejects(action: () => Promise<unknown>, message: string) {
    await db.query("savepoint expected_failure");
    try { await expect(action()).rejects.toThrow(message); }
    finally { await db.query("rollback to savepoint expected_failure"); }
  }
  async function call(name: string, ...args: unknown[]) {
    const placeholders = args.map((arg, index) => (typeof arg === "object" && arg !== null ? `$${index + 1}::jsonb` : `$${index + 1}`));
    const values = args.map(arg => (typeof arg === "object" && arg !== null ? JSON.stringify(arg) : arg));
    return (await db.query(`select onzio.${name}(${placeholders.join(",")}) as data`, values)).rows[0].data;
  }

  beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); });
  afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

  it("Contact Information link: rejects unsafe and unnormalized values, saves an email link with a subject", async () => {
    await design("cinematic", 2, ["home", "contact"]);
    const request = async (informationHref: string) => {
      const snapshot = await call("load_cinematic_contact_editor", clubId, null);
      return { operationId: randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: { ...starterCinematicContactContent(), informationHref } };
    };
    for (const link of REJECTED) {
      const payload = await request(link);
      await rejects(() => call("save_cinematic_contact_editor", clubId, payload), "INVALID_CINEMATIC_CONTACT_PAYLOAD");
    }
    for (const link of ["mailto:info@club.com?subject=Hi", "https://forms.gle/aBcDeFgHiJkLmN0p1", "/tickets", ""]) {
      const saved = await call("save_cinematic_contact_editor", clubId, await request(link));
      expect(saved.content.informationHref).toBe(link);
    }
  });

  it("Shop kit buy link: rejects unsafe and unnormalized values, saves web, page and email links", async () => {
    await design("academy", 1);
    const request = async (cta_link: string) => {
      const before = await call("load_shop_page", clubId, "shop");
      const photo = randomUUID();
      await db.query("reset role");
      await db.query(`insert into onzio.media_assets
        (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
        values($1,$2,'onzio-media',$3,'shop','photograph','image/webp',100,100,100,$4,'published',now())`,
      [photo, clubId, `${clubId}/shop/${photo}.webp`, "b".repeat(64)]);
      await actor();
      return {
        operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
        variants: { home: {
          section: { eyebrow: "Official Club Store", title: "Match Jersey", description: "Our jersey", bullet_points: ["Match Jersey"], store_note: "Ask the club", cta_label: "Order", cta_link },
          photos: [{ rowId: null, assetId: photo, order: 0 }],
        } },
      };
    };
    for (const link of REJECTED) {
      const payload = await request(link);
      await rejects(() => call("save_shop_page", clubId, payload), "INVALID_SHOP_PAYLOAD");
    }
    for (const link of ["https://store.club.com/jersey", "/shop", "mailto:orders@club.org?subject=Jersey%20Order"]) {
      const saved = await call("save_shop_page", clubId, await request(link));
      expect(saved.sections.find((item: { kit_variant: string }) => item.kit_variant === "home").cta_link).toBe(link);
    }
  });

  it("Homepage hero buttons: the save function and the table accept only a page on the club's site", async () => {
    await design("academy", 1);
    const request = async (href: string) => {
      const baseline = await call("load_homepage", clubId);
      return { operationId: randomUUID(), expectedRevision: baseline.revision, designRevision: baseline.designRevision, sections: { hero: { primary_cta_href: href } } };
    };
    for (const link of [...REJECTED, "https://club.com", "mailto:info@club.com", " /tickets"]) {
      const payload = await request(link);
      await rejects(() => call("save_homepage", clubId, payload), "INVALID_HOMEPAGE_PAYLOAD");
    }
    for (const link of ["/tickets", "/shop?variant=home#kit", ""]) {
      const saved = await call("save_homepage", clubId, await request(link));
      expect(saved.content.hero.primary_cta_href).toBe(link);
    }
    await db.query("reset role");
    for (const column of ["primary_cta_href", "secondary_cta_href"]) {
      for (const link of ["//evil.com", "javascript:alert(1)", " /tickets", "https://club.com"]) {
        await rejects(() => db.query(`update onzio.homepage_hero_content set ${column}=$2 where club_id=$1`, [clubId, link]), `homepage_hero_content_${column}_check`);
      }
      expect((await db.query(`update onzio.homepage_hero_content set ${column}='/tickets' where club_id=$1`, [clubId])).rowCount).toBe(1);
    }
  });

  it("Social links: the table accepts only a normalized web link", async () => {
    const insert = (href: string) => db.query(
      "insert into onzio.site_social_links(club_id,id,label,href,icon) values($1,$2,'Profile',$3,'instagram')", [clubId, `link-${randomUUID()}`, href]);
    for (const link of [...REJECTED, "/tickets", "mailto:info@club.com", "info@club.com"]) await rejects(() => insert(link), "site_social_links_href_link");
    for (const link of ["https://www.instagram.com/club_fc/?hl=en", "https://www.tiktok.com/@clubfc", ""]) expect((await insert(link)).rowCount).toBe(1);
  });

  it("Match sponsor link: the table accepts NULL or a normalized link", async () => {
    const season = (await db.query("select id from onzio.seasons where club_id=$1 order by active desc limit 1", [clubId])).rows[0].id;
    const match = (await db.query(
      "insert into onzio.matches(club_id,season_id,date,time,opponent) values($1,$2,'2027-03-20','19:45','Sponsor link check') returning id", [clubId, season])).rows[0].id;
    const update = (link: string | null) => db.query("update onzio.matches set sponsor_link=$2 where id=$1", [match, link]);
    for (const link of REJECTED) await rejects(() => update(link), "matches_sponsor_link_link");
    for (const link of [null, "https://sponsor.club.com/offer", "/community/partnership", "mailto:info@club.com?subject=Hi"]) expect((await update(link)).rowCount).toBe(1);
  });

  it("Sponsor logo link: the table accepts NULL or a normalized link of at most 2048 characters, never an empty string", async () => {
    const insert = (link: string | null) => db.query(
      "insert into onzio.site_sponsor_logos(club_id,name,logo_url,website_url) values($1,'Sponsor','/s.png',$2)", [clubId, link]);
    for (const link of [...REJECTED, "", `https://club.com/${"a".repeat(2048)}`]) await rejects(() => insert(link), "site_sponsor_logos_website_url_shape");
    for (const link of [null, "https://sponsor.club.com", `https://club.com/${"a".repeat(2031)}`, "/community/partnership", "mailto:info@club.com"]) expect((await insert(link)).rowCount).toBe(1);
  });
});
