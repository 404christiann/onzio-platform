import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-RE-15 (decision 0007): each sponsor is one row with Homepage and Footer
// switches and an optional website. Each test runs in a transaction that is
// rolled back.

const MIGRATION = resolve(__dirname, "../../supabase/migrations/20261110150000_sponsors_one_list.sql");
const ALPHA = CLUB_IDS.alpha;
const BRAVO = CLUB_IDS.bravo;

let db: Client;

async function rejects(sql: string, values: unknown[], message: string) {
  await db.query("savepoint expected_failure");
  try {
    await expect(db.query(sql, values)).rejects.toThrow(message);
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
}

async function asOwner(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}

async function asset(club: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
     values($1,$2,'onzio-media',$3,'branding','graphic','image/png',100,50,50,$4,'published',now())`,
    [id, club, `${club}/branding/${id}.png`, "c".repeat(64)],
  );
  return id;
}

type Sponsor = { name: string; show_on_homepage: boolean; show_in_footer: boolean; sort_order: number };

async function sponsors(club: string): Promise<Sponsor[]> {
  return (await db.query(
    "select name, show_on_homepage, show_in_footer, sort_order from onzio.site_sponsor_logos where club_id=$1 order by sort_order",
    [club],
  )).rows;
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  await db.query("delete from onzio.site_sponsor_logos where club_id in ($1,$2)", [ALPHA, BRAVO]);
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("one row per sponsor", () => {
  it("starts with both switches off and no website", async () => {
    await db.query(
      "insert into onzio.site_sponsor_logos (club_id,name,logo_url) values ($1,'Kim''s Hardware','/kim.png')",
      [ALPHA],
    );
    const row = (await db.query(
      "select placement, show_on_homepage, show_in_footer, website_url from onzio.site_sponsor_logos where club_id=$1",
      [ALPHA],
    )).rows[0];
    expect(row).toEqual({ placement: null, show_on_homepage: false, show_in_footer: false, website_url: null });
  });

  it("keeps names to 60 characters, counted as characters, and never blank", async () => {
    await db.query("insert into onzio.site_sponsor_logos (club_id,name,logo_url) values ($1,$2,'/a.png')", [ALPHA, "x".repeat(60)]);
    await db.query("insert into onzio.site_sponsor_logos (club_id,name,logo_url) values ($1,$2,'/b.png')", [ALPHA, "ś".repeat(60)]);
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id,name,logo_url) values ($1,$2,'/c.png')",
      [ALPHA, "x".repeat(61)],
      "site_sponsor_logos_name_length",
    );
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id,name,logo_url) values ($1,'   ','/d.png')",
      [ALPHA],
      "site_sponsor_logos_name_filled",
    );
  });

  it.each([
    ["https://kimshardware.com", true],
    ["http://kimshardware.com/sponsors?ref=club", true],
    [`https://example.com/${"a".repeat(2028)}`, true],
    [`https://example.com/${"a".repeat(2029)}`, false],
    ["kimshardware.com", false],
    ["javascript:alert(1)", false],
    ["https://kims hardware.com", false],
    ["", false],
  ])("website %#: %s is %s", async (url, allowed) => {
    const sql = "insert into onzio.site_sponsor_logos (club_id,name,logo_url,website_url) values ($1,'Kim','/k.png',$2)";
    if (allowed) await db.query(sql, [ALPHA, url]);
    else await rejects(sql, [ALPHA, url], "site_sponsor_logos_website_url_shape");
  });
});

describe("code written before the switches", () => {
  it("gets the switch for the placement it still writes", async () => {
    await db.query("insert into onzio.site_sponsor_logos (club_id,placement,name,logo_url,sort_order) values ($1,'carousel','Home','/h.png',0)", [ALPHA]);
    await db.query("insert into onzio.site_sponsor_logos (club_id,placement,name,logo_url,sort_order) values ($1,'footer','Foot','/f.png',1)", [ALPHA]);
    expect(await sponsors(ALPHA)).toEqual([
      { name: "Home", show_on_homepage: true, show_in_footer: false, sort_order: 0 },
      { name: "Foot", show_on_homepage: false, show_in_footer: true, sort_order: 1 },
    ]);
  });

  it("leaves the switches alone when the writer set them", async () => {
    await db.query(
      "insert into onzio.site_sponsor_logos (club_id,placement,name,logo_url,show_in_footer) values ($1,'carousel','Both set','/s.png',true)",
      [ALPHA],
    );
    expect(await sponsors(ALPHA)).toEqual([{ name: "Both set", show_on_homepage: false, show_in_footer: true, sort_order: 0 }]);
  });

  it("works for a signed-in owner through RLS", async () => {
    await asOwner();
    await db.query(
      "insert into onzio.site_sponsor_logos (club_id,placement,name,logo_url) values ($1,'carousel','Owner added','/o.png')",
      [ALPHA],
    );
    await db.query(
      "insert into onzio.site_sponsor_logos (club_id,name,logo_url,show_on_homepage,show_in_footer,website_url) values ($1,'New page','/n.png',true,true,'https://n.example')",
      [ALPHA],
    );
    await db.query("reset role");
    const rows = (await db.query(
      "select name, show_on_homepage, show_in_footer, website_url from onzio.site_sponsor_logos where club_id=$1 order by name",
      [ALPHA],
    )).rows;
    expect(rows).toEqual([
      { name: "New page", show_on_homepage: true, show_in_footer: true, website_url: "https://n.example" },
      { name: "Owner added", show_on_homepage: true, show_in_footer: false, website_url: null },
    ]);
  });

  it("still lets nobody else write a club's sponsors", async () => {
    await db.query("set local role anon");
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id,name,logo_url,show_on_homepage) values ($1,'Anon','/x.png',true)",
      [ALPHA],
      "permission denied",
    );
    await db.query("reset role");
    await asOwner(USER_IDS.unaffiliated);
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id,name,logo_url,show_on_homepage) values ($1,'Stranger','/x.png',true)",
      [ALPHA],
      "row-level security",
    );
  });
});

describe("the migration on rows that were there before it", () => {
  // Put the table back to how production is, load rows shaped like today's
  // (one row per placement), run the migration file, and read what it did.
  async function stepBack() {
    await db.query("drop trigger site_sponsor_logo_placement_switches on onzio.site_sponsor_logos");
    await db.query("drop function onzio_private.site_sponsor_logo_placement_switches()");
    await db.query(
      `alter table onzio.site_sponsor_logos
         drop constraint site_sponsor_logos_name_length,
         drop constraint site_sponsor_logos_name_filled,
         drop constraint site_sponsor_logos_website_url_shape,
         drop column show_on_homepage,
         drop column show_in_footer,
         drop column website_url,
         alter column placement set not null`,
    );
  }

  async function legacy(club: string, placement: "carousel" | "footer", name: string, order: number, media: string | null) {
    await db.query(
      "insert into onzio.site_sponsor_logos (club_id,placement,name,logo_url,media_asset_id,sort_order) values ($1,$2,$3,$4,$5,$6)",
      [club, placement, name, `/${name}.png`, media, order],
    );
  }

  it("merges a logo shown in both places into one row and keeps both orders", async () => {
    const kim = await asset(ALPHA);
    const lake = await asset(ALPHA);
    const north = await asset(ALPHA);
    const bravoKim = await asset(BRAVO);
    await stepBack();
    // Homepage: Lake, Kim, Old (no file record). Footer: Kim (named differently), North.
    await legacy(ALPHA, "carousel", "Lake", 0, lake);
    await legacy(ALPHA, "carousel", "Kim", 1, kim);
    await legacy(ALPHA, "carousel", "Old", 2, null);
    await legacy(ALPHA, "footer", "North", 0, north);
    await legacy(ALPHA, "footer", "Kim footer", 1, kim);
    // Bravo has its own copy of a file; it never merges with Alpha's.
    await legacy(BRAVO, "carousel", "Bravo Kim", 3, bravoKim);
    await legacy(BRAVO, "footer", "Bravo Kim", 5, bravoKim);

    await db.query(readFileSync(MIGRATION, "utf8"));

    expect(await sponsors(ALPHA)).toEqual([
      { name: "Lake", show_on_homepage: true, show_in_footer: false, sort_order: 0 },
      { name: "Kim", show_on_homepage: true, show_in_footer: true, sort_order: 1 },
      { name: "Old", show_on_homepage: true, show_in_footer: false, sort_order: 2 },
      { name: "North", show_on_homepage: false, show_in_footer: true, sort_order: 3 },
    ]);
    expect(await sponsors(BRAVO)).toEqual([
      { name: "Bravo Kim", show_on_homepage: true, show_in_footer: true, sort_order: 0 },
    ]);
    // What visitors see is unchanged: the homepage in its order, the footer in its order.
    const homepage = (await sponsors(ALPHA)).filter((row) => row.show_on_homepage).map((row) => row.name);
    const footer = (await sponsors(ALPHA)).filter((row) => row.show_in_footer).map((row) => row.name);
    expect(homepage).toEqual(["Lake", "Kim", "Old"]);
    expect(footer).toEqual(["Kim", "North"]);
  });

  it("merges two footer rows for the same file into the first", async () => {
    const file = await asset(ALPHA);
    await stepBack();
    await legacy(ALPHA, "footer", "Second", 4, file);
    await legacy(ALPHA, "footer", "First", 2, file);
    await db.query(readFileSync(MIGRATION, "utf8"));
    expect(await sponsors(ALPHA)).toEqual([{ name: "First", show_on_homepage: false, show_in_footer: true, sort_order: 0 }]);
  });

  it("leaves rows without a file record alone, even when two share a logo link", async () => {
    await stepBack();
    // Lions' import gave several sponsors one placeholder link and no file record.
    await db.query(
      `insert into onzio.site_sponsor_logos (club_id,placement,name,logo_url,sort_order)
       values ($1,'carousel','Highbank Credit Union','',0), ($1,'footer','Midwest Supply','',0), ($1,'footer','Franklinton Works','/f.png',1)`,
      [ALPHA],
    );
    await db.query(readFileSync(MIGRATION, "utf8"));
    expect(await sponsors(ALPHA)).toEqual([
      { name: "Highbank Credit Union", show_on_homepage: true, show_in_footer: false, sort_order: 0 },
      { name: "Midwest Supply", show_on_homepage: false, show_in_footer: true, sort_order: 1 },
      { name: "Franklinton Works", show_on_homepage: false, show_in_footer: true, sort_order: 2 },
    ]);
  });

  it("stops when a name is over 60 characters", async () => {
    await stepBack();
    await legacy(ALPHA, "carousel", "x".repeat(61), 0, null);
    await expect(db.query(readFileSync(MIGRATION, "utf8"))).rejects.toThrow("over 60 characters");
  });

  it("stops when a name is blank", async () => {
    await stepBack();
    await legacy(ALPHA, "carousel", "  ", 0, null);
    await expect(db.query(readFileSync(MIGRATION, "utf8"))).rejects.toThrow("has no name");
  });
});
