import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOMEPAGE_SLIDESHOW_PHOTO_LIMITS } from "@/lib/homepage-content";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";

// RC-ADMIN-10a: the sponsor caps (30 total, 10 homepage, 6 footer) and the News cap (200 live
// articles) enforced by row triggers that refuse increases only. Each test runs in a transaction
// that is rolled back, except the two parallel tests, which commit on their own connections and
// clean up after themselves.

const ALPHA = CLUB_IDS.alpha;
const CHARLIE = CLUB_IDS.charlie;

let db: Client;

async function rejects(sql: string, values: unknown[], message: string) {
  await db.query("savepoint expected_failure");
  try {
    await expect(db.query(sql, values)).rejects.toThrow(message);
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
}

async function asOwner(client: Client = db) {
  await client.query("reset role");
  const second = Number((await client.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await client.query("set local role authenticated");
}

/** Inserts sponsors as the database owner; `homepage`/`footer` say how many of them get each switch. */
async function seedSponsors(client: Client, club: string, total: number, homepage = 0, footer = 0) {
  await client.query(
    `insert into onzio.site_sponsor_logos (club_id, name, logo_url, sort_order, show_on_homepage, show_in_footer)
     select $1, 'Sponsor ' || g, '/sponsor-' || g || '.png', g, g <= $3, g <= $4
     from generate_series(1, $2) g`,
    [club, total, homepage, footer],
  );
}

async function sponsorIds(club: string, where = "true"): Promise<string[]> {
  return (await db.query(`select id from onzio.site_sponsor_logos where club_id = $1 and ${where} order by sort_order`, [club]))
    .rows.map((row) => row.id);
}

const newsContent = JSON.stringify({
  category: "news",
  cardHeading: "Club news",
  title: "A news article",
  subtitle: "",
  coverAlt: "",
  paragraphs: ["One paragraph."],
  actionLabel: "",
  actionHref: "",
});

async function cinematicDesign(club: string) {
  const id = randomUUID();
  await db.query(
    "insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',2,$3,$4,$5)",
    [id, club, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version: 2 }, navigation: { groups: [{ routes: ["home"] }] } }), "a".repeat(64), USER_IDS.ownerAal2],
  );
  await db.query(
    "insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2",
    [club, id, USER_IDS.ownerAal2],
  );
}

/** Inserts news articles as the database owner; the first `removed` of them are removed. */
async function seedNews(client: Client, club: string, total: number, removed = 0, prefix = "article") {
  await client.query(
    `insert into onzio.cinematic_news_articles (club_id, slug, content, published_at, removed_at)
     select $1, $5 || '-' || g, $2::jsonb, now(), case when g <= $4 then now() end
     from generate_series(1, $3) g`,
    [club, newsContent, total, removed, prefix],
  );
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  await db.query("delete from onzio.site_sponsor_logos where club_id in ($1, $2)", [ALPHA, CHARLIE]);
  await db.query("delete from onzio.cinematic_news_articles where club_id in ($1, $2)", [ALPHA, CHARLIE]);
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("sponsor caps", () => {
  it("lets a club list 30 sponsors and refuses the 31st", async () => {
    await seedSponsors(db, ALPHA, 29);
    await asOwner();
    await db.query("insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, 'Thirtieth', '/30.png')", [ALPHA]);
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, 'Thirty-first', '/31.png')",
      [ALPHA],
      "SPONSOR_LIMIT_TOTAL",
    );
  });

  it("counts earlier rows of the same insert, so one 31-row insert is refused", async () => {
    await asOwner();
    await rejects(
      `insert into onzio.site_sponsor_logos (club_id, name, logo_url, sort_order)
       select $1, 'Sponsor ' || g, '/s' || g || '.png', g from generate_series(1, 31) g`,
      [ALPHA],
      "SPONSOR_LIMIT_TOTAL",
    );
    await db.query(
      `insert into onzio.site_sponsor_logos (club_id, name, logo_url, sort_order)
       select $1, 'Sponsor ' || g, '/s' || g || '.png', g from generate_series(1, 30) g`,
      [ALPHA],
    );
    expect(await sponsorIds(ALPHA)).toHaveLength(30);
  });

  it("caps the homepage at 10 and the footer at 6, for inserts and for switches turned on", async () => {
    await seedSponsors(db, ALPHA, 12, 10, 6);
    await asOwner();
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id, name, logo_url, show_on_homepage) values ($1, 'Eleventh', '/h11.png', true)",
      [ALPHA],
      "SPONSOR_LIMIT_HOMEPAGE",
    );
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id, name, logo_url, show_in_footer) values ($1, 'Seventh', '/f7.png', true)",
      [ALPHA],
      "SPONSOR_LIMIT_FOOTER",
    );
    // The old `placement` column still sets a switch, and the cap sees it.
    await rejects(
      "insert into onzio.site_sponsor_logos (club_id, name, logo_url, placement) values ($1, 'Old code', '/old.png', 'footer')",
      [ALPHA],
      "SPONSOR_LIMIT_FOOTER",
    );
    const [resting] = await sponsorIds(ALPHA, "not show_on_homepage");
    await rejects("update onzio.site_sponsor_logos set show_on_homepage = true where id = $1", [resting], "SPONSOR_LIMIT_HOMEPAGE");
    await rejects("update onzio.site_sponsor_logos set show_in_footer = true where id = $1", [resting], "SPONSOR_LIMIT_FOOTER");
  });

  it("allows a swap at the cap when the switch goes off first", async () => {
    await seedSponsors(db, ALPHA, 11, 10, 6);
    await asOwner();
    const [shown] = await sponsorIds(ALPHA, "show_on_homepage");
    const [resting] = await sponsorIds(ALPHA, "not show_on_homepage");
    await db.query("update onzio.site_sponsor_logos set show_on_homepage = false where id = $1", [shown]);
    await db.query("update onzio.site_sponsor_logos set show_on_homepage = true where id = $1", [resting]);
    expect(await sponsorIds(ALPHA, "show_on_homepage")).toHaveLength(10);
  });

  it("refuses increases only: a club over a cap can still edit, turn switches off and delete", async () => {
    // Over every cap, as only the database owner could make it (the guard stops the migration
    // on real data like this).
    await db.query("alter table onzio.site_sponsor_logos disable trigger site_sponsor_logos_caps");
    await seedSponsors(db, ALPHA, 32, 12, 8);
    await db.query("alter table onzio.site_sponsor_logos enable trigger site_sponsor_logos_caps");
    await asOwner();
    const ids = await sponsorIds(ALPHA);
    await db.query("update onzio.site_sponsor_logos set name = 'Renamed', sort_order = 99, website_url = 'https://example.com' where id = $1", [ids[0]]);
    await db.query("update onzio.site_sponsor_logos set show_on_homepage = true, name = 'Still on' where id = $1", [ids[1]]);
    await db.query("update onzio.site_sponsor_logos set show_in_footer = false where id = $1", [ids[2]]);
    await db.query("delete from onzio.site_sponsor_logos where id = $1", [ids[3]]);
    await rejects("insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, 'More', '/more.png')", [ALPHA], "SPONSOR_LIMIT_TOTAL");
  });

  it("counts each club on its own", async () => {
    await seedSponsors(db, ALPHA, 30, 10, 6);
    await db.query("reset role");
    await db.query("insert into onzio.site_sponsor_logos (club_id, name, logo_url, show_on_homepage, show_in_footer) values ($1, 'Other club', '/b.png', true, true)", [CHARLIE]);
  });

  it("raises a check violation that names the cap", async () => {
    await seedSponsors(db, ALPHA, 30);
    await db.query("savepoint expected_failure");
    const error = await db.query("insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, 'x', '/x.png')", [ALPHA]).catch((cause) => cause);
    await db.query("rollback to savepoint expected_failure");
    expect(error).toMatchObject({ code: "23514", message: "SPONSOR_LIMIT_TOTAL" });
  });
});

describe("news cap", () => {
  beforeEach(async () => {
    await cinematicDesign(ALPHA);
  });

  it("allows 200 live articles and refuses the 201st; removed ones do not count", async () => {
    await seedNews(db, ALPHA, 230, 31);
    await asOwner();
    await db.query(
      "insert into onzio.cinematic_news_articles (club_id, slug, content, published_at) values ($1, 'two-hundredth', $2::jsonb, now())",
      [ALPHA, newsContent],
    );
    await rejects(
      "insert into onzio.cinematic_news_articles (club_id, slug, content, published_at) values ($1, 'one-too-many', $2::jsonb, now())",
      [ALPHA, newsContent],
      "NEWS_LIMIT_REACHED",
    );
    // A removed article can still be added, and a live one edited.
    await db.query("reset role");
    await db.query(
      "insert into onzio.cinematic_news_articles (club_id, slug, content, published_at, removed_at) values ($1, 'removed-draft', $2::jsonb, now(), now())",
      [ALPHA, newsContent],
    );
    await asOwner();
    await db.query("update onzio.cinematic_news_articles set published_at = now() - interval '1 day' where club_id = $1 and slug = 'two-hundredth'", [ALPHA]);
  });

  it("refuses a restore at the cap and allows it once an article is removed", async () => {
    await seedNews(db, ALPHA, 201, 1);
    await asOwner();
    await rejects(
      "update onzio.cinematic_news_articles set removed_at = null where club_id = $1 and slug = 'article-1'",
      [ALPHA],
      "NEWS_LIMIT_REACHED",
    );
    await db.query("update onzio.cinematic_news_articles set removed_at = now() where club_id = $1 and slug = 'article-2'", [ALPHA]);
    await db.query("update onzio.cinematic_news_articles set removed_at = null where club_id = $1 and slug = 'article-1'", [ALPHA]);
  });

  it("returns NEWS_LIMIT_REACHED through the save RPC", async () => {
    await seedNews(db, ALPHA, 200);
    await asOwner();
    await db.query("savepoint expected_failure");
    const error = await db.query("select onzio.save_cinematic_news_article($1, $2::jsonb)", [ALPHA, JSON.stringify({
      operationId: randomUUID(), action: "save", articleId: null, expectedRevision: "0", slug: "over-the-cap",
      publishedAt: "2026-11-20T20:00:00.000Z", coverAssetId: null, content: JSON.parse(newsContent),
    })]).catch((cause) => cause);
    await db.query("rollback to savepoint expected_failure");
    expect(error).toMatchObject({ code: "23514", message: "NEWS_LIMIT_REACHED" });
  });

  it("refuses increases only: a club over the cap can still edit and remove", async () => {
    await db.query("alter table onzio.cinematic_news_articles disable trigger cinematic_news_live_cap");
    await seedNews(db, ALPHA, 205);
    await db.query("alter table onzio.cinematic_news_articles enable trigger cinematic_news_live_cap");
    await asOwner();
    await db.query("update onzio.cinematic_news_articles set published_at = now() - interval '1 day' where club_id = $1 and slug = 'article-1'", [ALPHA]);
    await db.query("update onzio.cinematic_news_articles set removed_at = now() where club_id = $1 and slug = 'article-2'", [ALPHA]);
    await rejects(
      "update onzio.cinematic_news_articles set removed_at = null where club_id = $1 and slug = 'article-2'",
      [ALPHA],
      "NEWS_LIMIT_REACHED",
    );
  });
});

describe("parallel writes cannot pass a cap together", () => {
  async function connection() {
    const client = new Client(localPostgresConfig());
    await client.connect();
    return client;
  }

  it("lets only one of two parallel inserts take the 30th sponsor slot", async () => {
    const setup = await connection();
    const first = await connection();
    const second = await connection();
    try {
      await setup.query("delete from onzio.site_sponsor_logos where club_id = $1", [CHARLIE]);
      await seedSponsors(setup, CHARLIE, 29);
      await first.query("begin");
      await second.query("begin");
      await first.query("insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, 'First', '/first.png')", [CHARLIE]);
      // The second insert waits on the club's lock until the first commits, then sees 30 rows.
      const racing = second.query("insert into onzio.site_sponsor_logos (club_id, name, logo_url) values ($1, 'Second', '/second.png')", [CHARLIE])
        .then(() => null, (cause: unknown) => cause);
      await new Promise((done) => setTimeout(done, 300));
      await first.query("commit");
      expect(await racing).toMatchObject({ message: "SPONSOR_LIMIT_TOTAL" });
      await second.query("rollback");
      const count = (await setup.query("select count(*)::int as n from onzio.site_sponsor_logos where club_id = $1", [CHARLIE])).rows[0].n;
      expect(count).toBe(30);
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      await setup.query("delete from onzio.site_sponsor_logos where club_id = $1", [CHARLIE]);
      await Promise.all([setup.end(), first.end(), second.end()]);
    }
  });

  it("lets only one of two parallel inserts take the 200th live article", async () => {
    // The outer transaction's delete holds the global News lock (734901401); let it go.
    await db.query("rollback");
    await db.query("begin");
    const setup = await connection();
    const first = await connection();
    const second = await connection();
    try {
      await setup.query("delete from onzio.cinematic_news_articles where club_id = $1", [CHARLIE]);
      await seedNews(setup, CHARLIE, 199, 0, "parallel");
      await first.query("begin");
      await second.query("begin");
      await first.query("insert into onzio.cinematic_news_articles (club_id, slug, content, published_at) values ($1, 'first', $2::jsonb, now())", [CHARLIE, newsContent]);
      const racing = second.query("insert into onzio.cinematic_news_articles (club_id, slug, content, published_at) values ($1, 'second', $2::jsonb, now())", [CHARLIE, newsContent])
        .then(() => null, (cause: unknown) => cause);
      await new Promise((done) => setTimeout(done, 300));
      await first.query("commit");
      expect(await racing).toMatchObject({ message: "NEWS_LIMIT_REACHED" });
      await second.query("rollback");
      const live = (await setup.query("select count(*)::int as n from onzio.cinematic_news_articles where club_id = $1 and removed_at is null", [CHARLIE])).rows[0].n;
      expect(live).toBe(200);
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      await setup.query("delete from onzio.cinematic_news_articles where club_id = $1", [CHARLIE]);
      await Promise.all([setup.end(), first.end(), second.end()]);
    }
  });
});

describe("slideshow limit", () => {
  it("is the same 7 / 6 in save_homepage as in the admin", async () => {
    const definition = (await db.query(
      "select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'onzio' and p.proname = 'save_homepage'",
    )).rows.map((row) => row.def as string);
    expect(definition).toHaveLength(1);
    expect(definition[0]).toContain("jsonb_array_length(sections#>'{photos,items}')>(case when template='cinematic@2' then 7 else 6 end)");
    expect(HOMEPAGE_SLIDESHOW_PHOTO_LIMITS).toEqual({ cinematic: 7, other: 6 });
  });
});
