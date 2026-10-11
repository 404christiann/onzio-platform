import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ actionTimeout: 15_000 });

const ALPHA = "11111111-1111-4111-8111-111111111111";
const PLAYER = "55555555-5555-4555-8555-555555555551";
type Fixture = Record<string, unknown> & { id: string; club_id: string };
type Table = "players" | "staff" | "matches";

// This suite writes synthetic Alpha only. It deliberately never uses a hosted
// database URL or service key, and it must run after other Alpha-writing suites.
function localDb(baseURL: string | undefined): Client {
  if (!baseURL || new URL(baseURL).hostname !== "alpha.localhost") {
    throw new Error("Guided persistence requires the synthetic alpha.localhost tenant.");
  }
  return new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
}

async function snapshot(db: Client, table: Table, id: string): Promise<Fixture> {
  const result = await db.query<{ row: Fixture }>(`select to_jsonb(r) as row from onzio.${table} r where r.club_id=$1 and r.id=$2`, [ALPHA, id]);
  if (result.rows.length !== 1) throw new Error(`Missing isolated ${table} fixture ${id}.`);
  return result.rows[0].row;
}

// When browser cleanup fails, restore the exact original local row. Validated
// database column names come from the captured record, never from browser input.
async function exactRestore(db: Client, table: Table, original: Fixture): Promise<void> {
  const columns = Object.keys(original).filter(key => key !== "id" && key !== "club_id");
  if (!columns.every(key => /^[a-z_]+$/.test(key))) throw new Error("Unexpected fixture column name.");
  const names = columns.map(key => `"${key}"`).join(",");
  await db.query("begin");
  try {
    // Local session-only suppression lets fixture cleanup restore its original
    // updated_at as well. Never used by the application or a hosted database.
    await db.query("set local session_replication_role=replica");
    await db.query(`update onzio.${table} set (${names})=(select ${names} from jsonb_populate_record(null::onzio.${table},$1::jsonb)) where club_id=$2 and id=$3`, [JSON.stringify(original), ALPHA, original.id]);
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
  expect(await snapshot(db, table, original.id)).toEqual(original);
}

async function save(page: Page, dialog: Locator, table: Table, operation = "update", buttonName = "Save changes"): Promise<void> {
  const mutation = page.waitForResponse(response => {
    if (!response.url().endsWith("/api/admin/data") || response.request().method() !== "POST") return false;
    const request = response.request().postDataJSON() as { table?: string; operation?: string };
    return request.table === table && request.operation === operation;
  });
  await dialog.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await mutation;
  expect(response.ok()).toBe(true);
  const body = await response.json() as { error: unknown };
  expect(body.error).toBeNull();
  await expect(dialog).not.toBeVisible();
}

async function openPlayer(page: Page, name: string): Promise<Locator> {
  await page.goto("/admin/roster");
  await page.getByRole("searchbox", { name: "Search players by name or jersey number", exact: true }).fill(name);
  await page.getByRole("main").getByRole("button").filter({ hasText: name }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#player-hometown")).toBeVisible();
  return dialog;
}

async function matchFixture(db: Client): Promise<{ original: Fixture; created: boolean }> {
  const seasonResult = await db.query<{ id: string }>("select id from onzio.seasons where club_id=$1 and active=true order by id", [ALPHA]);
  if (seasonResult.rows.length !== 1) throw new Error("Alpha requires exactly one active synthetic season.");
  const seasonId = seasonResult.rows[0].id;
  const result = await db.query<{ row: Fixture }>("select to_jsonb(m) as row from onzio.matches m where club_id=$1 and season_id=$2 and trim(opponent) <> '' and trim(venue) <> '' and not exists(select 1 from onzio.matches other where other.club_id=m.club_id and other.season_id=m.season_id and other.opponent=m.opponent and other.id<>m.id) order by date,time,id limit 1", [ALPHA, seasonId]);
  if (result.rows[0]) return { original: result.rows[0].row, created: false };
  const id = randomUUID();
  const opponent = `Guided local ${id.slice(0, 8)}`;
  await db.query("insert into onzio.matches(id,club_id,season_id,date,time,opponent,home,venue) values($1,$2,$3,'2026-10-20','18:00',$4,true,'Local fixture field')", [id, ALPHA, seasonId, opponent]);
  try { return { original: await snapshot(db, "matches", id), created: true }; }
  catch (error) {
    await db.query("delete from onzio.matches where club_id=$1 and id=$2", [ALPHA, id]);
    throw error;
  }
}

async function openMatch(page: Page, original: Fixture): Promise<Locator> {
  await page.goto("/admin/schedule");
  await page.getByRole("combobox", { name: /View season/i }).selectOption(String(original.season_id));
  await page.getByRole("searchbox", { name: "Search matches by opponent or venue", exact: true }).fill(String(original.opponent));
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#match-opponent")).toHaveValue(String(original.opponent));
  const dateLabel = await page.evaluate(value => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day).toLocaleDateString(); }, String(original.date));
  await expect(dialog.locator("#match-date")).toHaveText(dateLabel);
  return dialog;
}

for (const width of [390, 1440]) {
  test(`${width}px: player edit saves through the real boundary and survives reload`, async ({ page, baseURL }) => {
    const db = localDb(baseURL);
    await db.connect();
    let original: Fixture | undefined;
    const marker = `Guided player ${randomUUID().slice(0, 8)}`;
    let mutated = false;
    try {
      original = await snapshot(db, "players", PLAYER);
      expect(original.name).toBe("Alpha Keeper");
      await page.setViewportSize({ width, height: 844 });
      let dialog = await openPlayer(page, String(original.name));
      await expect(dialog.locator("#player-height")).not.toHaveValue("");
      await expect(dialog.locator("#player-weight")).not.toHaveValue("");
      await dialog.locator("#player-hometown").fill(marker);
      mutated = true;
      await save(page, dialog, "players");
      expect((await snapshot(db, "players", PLAYER)).hometown).toBe(marker);
      await page.reload();
      dialog = await openPlayer(page, String(original.name));
      await expect(dialog.locator("#player-hometown")).toHaveValue(marker);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    } finally {
      try {
        if (original && mutated && (await snapshot(db, "players", PLAYER)).hometown === marker) {
          try {
            const dialog = await openPlayer(page, String(original.name));
            await dialog.locator("#player-hometown").fill(String(original.hometown));
            await save(page, dialog, "players");
            expect((await snapshot(db, "players", PLAYER)).hometown).toBe(original.hometown);
          } finally { await exactRestore(db, "players", original); }
        }
      } finally { await db.end(); }
    }
  });

  test(`${width}px: match edit saves through the real boundary and survives reload`, async ({ page, baseURL }) => {
    const db = localDb(baseURL);
    await db.connect();
    let fixture: Awaited<ReturnType<typeof matchFixture>> | undefined;
    const marker = `Guided match ${randomUUID().slice(0, 8)}`;
    let mutated = false;
    try {
      fixture = await matchFixture(db);
      const original = fixture.original;
      await page.setViewportSize({ width, height: 844 });
      let dialog = await openMatch(page, original);
      await dialog.locator("#match-venue").fill(marker);
      mutated = true;
      await save(page, dialog, "matches");
      expect((await snapshot(db, "matches", original.id)).venue).toBe(marker);
      await page.reload();
      dialog = await openMatch(page, original);
      await expect(dialog.locator("#match-venue")).toHaveValue(marker);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    } finally {
      try {
        const original = fixture?.original;
        if (fixture?.created && original) {
          await db.query("delete from onzio.matches where club_id=$1 and id=$2", [ALPHA, original.id]);
        } else if (original && mutated && (await snapshot(db, "matches", original.id)).venue === marker) {
          try {
            const dialog = await openMatch(page, original);
            await dialog.locator("#match-venue").fill(String(original.venue));
            await save(page, dialog, "matches");
            expect((await snapshot(db, "matches", original.id)).venue).toBe(original.venue);
          } finally { await exactRestore(db, "matches", original); }
        }
      } finally { await db.end(); }
    }
  });
}

const fixtureTables = ["players", "staff", "matches", "player_photos", "player_match_stats", "goalkeeper_match_stats", "player_season_stats", "goalkeeper_season_stats"] as const;
type FixtureSnapshot = Record<(typeof fixtureTables)[number], Fixture[]>;

async function captureFixtures(db: Client): Promise<FixtureSnapshot> {
  const captured = {} as FixtureSnapshot;
  for (const table of fixtureTables) {
    const result = await db.query<{ row: Fixture }>(`select to_jsonb(r) as row from onzio.${table} r where club_id=$1 order by to_jsonb(r)::text`, [ALPHA]);
    captured[table] = result.rows.map(result => result.row);
  }
  return captured;
}

async function findCreated(db: Client, table: Table, marker: string): Promise<Fixture[]> {
  const column = table === "matches" ? "opponent" : "name";
  const result = await db.query<{ row: Fixture }>(`select to_jsonb(r) as row from onzio.${table} r where club_id=$1 and ${column}=$2 order by id`, [ALPHA, marker]);
  return result.rows.map(result => result.row);
}

async function cleanupCreated(db: Client, table: Table, marker: string, before: FixtureSnapshot): Promise<void> {
  // Capture exact IDs even if a save committed before its browser response failed.
  // A name/marker is only used for this capture; cleanup mutations use these IDs.
  const rows = await findCreated(db, table, marker);
  const originalIds = new Set(before[table].map(row => row.id));
  const ids = rows.map(row => row.id);
  if (ids.some(id => originalIds.has(id))) throw new Error("Refusing to remove an original fixture.");
  if (ids.length) {
    await db.query("begin");
    try {
      if (table === "players" || table === "matches") {
        const childTables = table === "players" ? ["player_photos", "player_match_stats", "goalkeeper_match_stats", "player_season_stats", "goalkeeper_season_stats"] : ["player_match_stats", "goalkeeper_match_stats"];
        const column = table === "players" ? "player_id" : "match_id";
        for (const child of childTables) await db.query(`delete from onzio.${child} where club_id=$1 and ${column}=any($2::uuid[])`, [ALPHA, ids]);
      }
      await db.query(`delete from onzio.${table} where club_id=$1 and id=any($2::uuid[])`, [ALPHA, ids]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
  }
  expect(await captureFixtures(db)).toEqual(before);
}

async function openStaff(page: Page, name: string): Promise<Locator> {
  await page.goto("/admin/roster");
  await page.getByRole("tab", { name: "Staff", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search staff by name or role", exact: true }).fill(name);
  await page.getByRole("main").getByRole("button").filter({ hasText: name }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#staff-name")).toHaveValue(name);
  return dialog;
}

for (const width of [390, 1440]) {
  for (const kind of ["players", "staff", "matches"] as const) {
    test(`${width}px: ${kind} Add/Save/Reload${kind === "staff" ? " and Staff edit/save/reload" : ""} persists through the real boundary`, async ({ page, baseURL }) => {
      const db = localDb(baseURL);
      await db.connect();
      const marker = `Guided ${kind} ${randomUUID().slice(0, 8)}`;
      let before: FixtureSnapshot | undefined;
      try {
        before = await captureFixtures(db);
        expect(await findCreated(db, kind, marker)).toHaveLength(0);
        await page.setViewportSize({ width, height: 844 });
        await page.goto(kind === "matches" ? "/admin/schedule" : "/admin/roster");
        if (kind === "staff") await page.getByRole("tab", { name: "Staff", exact: true }).click();
        await page.getByRole("button", { name: kind === "players" ? "Add player" : kind === "staff" ? "Add staff" : /Add match/, exact: kind !== "matches" }).click();
        let dialog = page.getByRole("dialog");
        if (kind === "players") {
          await dialog.locator("#player-name").fill(marker);
          await dialog.locator("#player-number").fill("88");
          await dialog.locator("#player-position").selectOption("Forward");
          await dialog.locator("#player-nationality").click();
          await dialog.getByRole("textbox", { name: "Search nationalities", exact: true }).fill("American");
          await dialog.getByRole("option", { name: /American/ }).click();
          await dialog.locator("#player-height").fill("5'10\"");
          await dialog.locator("#player-weight").fill("165 lbs");
          await dialog.locator("#player-age").fill("22");
          await dialog.locator("#player-hometown").fill("Guided local hometown");
          await dialog.locator("#player-bio").fill("Synthetic local player creation check.");
        } else if (kind === "staff") {
          await dialog.locator("#staff-initials").fill("QA");
          await dialog.locator("#staff-name").fill(marker);
          await dialog.locator("#staff-role").fill("Local assistant coach");
          await dialog.locator("#staff-hometown").fill("Guided local hometown");
          await dialog.locator("#staff-bio").fill("Synthetic local staff creation check.");
        } else {
          const active = await db.query<{ id: string }>("select id from onzio.seasons where club_id=$1 and active=true", [ALPHA]);
          expect(active.rows).toHaveLength(1);
          await dialog.locator("#match-season").selectOption(active.rows[0].id);
          await dialog.locator("#match-home-away").selectOption("home");
          await dialog.locator("#match-date").click();
          const today = await page.evaluate(() => new Date().toLocaleDateString());
          await page.locator(`button[data-day="${today}"]`).click();
          await dialog.locator("#match-time").fill("18:00");
          await dialog.locator("#match-opponent").fill(marker);
          await dialog.locator("#match-venue").fill("Guided local creation field");
        }
        await save(page, dialog, kind, "insert", kind === "players" ? "Save player" : kind === "staff" ? "Save staff member" : "Save match");
        const created = await findCreated(db, kind, marker);
        expect(created).toHaveLength(1);
        expect(created[0].club_id).toBe(ALPHA);
        if (kind === "players") {
          const stats = await db.query("select player_id from onzio.player_season_stats where club_id=$1 and player_id=$2", [ALPHA, created[0].id]);
          expect(stats.rows).toHaveLength(1);
        }
        await page.reload();
        dialog = kind === "players" ? await openPlayer(page, marker) : kind === "staff" ? await openStaff(page, marker) : await openMatch(page, created[0]);
        await expect(dialog.locator(kind === "players" ? "#player-hometown" : kind === "staff" ? "#staff-hometown" : "#match-venue")).toHaveValue(kind === "matches" ? "Guided local creation field" : "Guided local hometown");
        if (kind === "staff") {
          const edited = "Guided edited staff hometown";
          await dialog.locator("#staff-hometown").fill(edited);
          await save(page, dialog, "staff", "update", "Save");
          expect((await snapshot(db, "staff", created[0].id)).hometown).toBe(edited);
          await page.reload();
          dialog = await openStaff(page, marker);
          await expect(dialog.locator("#staff-hometown")).toHaveValue(edited);
        }
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      } finally {
        try { if (before) await cleanupCreated(db, kind, marker, before); }
        finally { await db.end(); }
      }
    });
  }
}
