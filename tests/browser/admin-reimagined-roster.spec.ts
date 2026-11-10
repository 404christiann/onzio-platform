import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// ADMIN-RE-17: Team roster on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. The list-level
// checks (many, worst-case, none, one) answer the page's own players request
// in the browser, so they touch no database row. The one real edit seeds a
// single fixture player and removes it in a finally block. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const FIXTURE_NAME = "RE-17 Fixture Player";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

test.describe.configure({ mode: "serial" });

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const db = new Client(config);
  await db.connect();
  try {
    return (await db.query<T>(text, values)).rows;
  } finally {
    await db.end();
  }
}

async function setPortal(portal: "classic" | "reimagined"): Promise<string> {
  const [row] = await sql<{ admin_portal: string }>(
    "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
    [ALPHA, portal],
  );
  return row.admin_portal;
}

type Row = {
  id: string;
  number: number;
  name: string;
  caption: string | null;
  nationality: string;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
  height: string;
  weight: string;
  hometown: string;
  age: number;
  school: string | null;
  previous_club: string | null;
  photo_url: string;
  active: boolean;
  bio: string | null;
  pronunciation: string | null;
  foot: string | null;
};

function row(id: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    number: id,
    name: `Player ${id}`,
    caption: null,
    nationality: "United States",
    position: "Midfielder",
    height: "5'10\"",
    weight: "160 lbs",
    hometown: "Portland, OR",
    age: 24,
    school: null,
    previous_club: null,
    photo_url: "",
    active: true,
    bio: null,
    pronunciation: null,
    foot: null,
    ...overrides,
  };
}

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"] as const;

/** 64 players across the four positions (7, 19, 21, 17), the last five hidden. */
function bigSquad(): Row[] {
  const counts = [7, 19, 21, 17];
  let id = 1;
  return POSITIONS.flatMap((position, index) =>
    Array.from({ length: counts[index]! }, () => {
      const n = id;
      id += 1;
      return row(n, { position, active: n <= 59 });
    }),
  );
}

/** Answers the page's own players request, and nothing else. */
async function showPlayers(page: Page, rows: Row[]) {
  await page.route("**/api/admin/data", async (route) => {
    const body = route.request().postDataJSON() as { table?: string; operation?: string } | null;
    if (body?.table === "players" && body.operation === "select") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows, count: null, error: null }),
      });
      return;
    }
    await route.fallback();
  });
}

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [390, 1440]) {
  const phone = width < 640;
  const railItem = (position: string) =>
    phone ? `[data-rail-tab="${position}"]` : `[data-rail-zone="${position}"]`;

  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("many players: counts, a jump that lands on its position, and no side scroll", async ({ page }) => {
      await showPlayers(page, bigSquad());
      await page.goto("/admin/roster");
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Team roster");
      await expect(main(page).getByRole("heading", { level: 1, name: /Your players/ })).toBeVisible();
      await expect(page.getByTestId("roster-count")).toHaveText("59");
      await expect(page.getByTestId("roster-summary")).toHaveText("5 hidden from your website");
      await expect(main(page).locator("[data-player-card]")).toHaveCount(64);
      await expectNoSideScroll(page, width);

      // The rail counts the players on the website, position by position: 7, 19, 21,
      // and 12 of the 17 forwards (the last five players are hidden).
      const expected = phone
        ? ["Keepers7", "Defense19", "Midfield21", "Forwards12"]
        : ["Goalkeepers · 7", "Defenders · 19", "Midfielders · 21", "Forwards · 12"];
      const rail = main(page).locator(phone ? "[data-rail-tab]" : "[data-rail-zone]");
      await expect(rail).toHaveCount(4);
      expect((await rail.allInnerTexts()).map((text) => text.replace(/\s+/g, ""))).toEqual(
        expected.map((text) => text.replace(/\s+/g, "")),
      );
      await page.screenshot({ path: `${SHOTS}/roster-many-top-${width}.png` });

      await main(page).locator(railItem("Midfielder")).click();
      const heading = main(page).getByRole("heading", { name: /^Midfielders/ });
      await expect(heading).toBeInViewport();
      const top = (await heading.boundingBox())!.y;
      // Under the sticky bar(s), not left far down the page.
      expect(top).toBeLessThan(phone ? 220 : 160);
      expect(top).toBeGreaterThan(40);
      await expect(main(page).locator(railItem("Midfielder"))).toHaveAttribute("aria-current", "true");
      await expect(main(page).locator(railItem("Goalkeeper"))).toHaveAttribute("aria-current", "false");
      await page.screenshot({ path: `${SHOTS}/roster-many-midfielders-${width}.png` });

      // Last position: the page cannot scroll its heading to the top, the rail still follows the click.
      await main(page).locator(railItem("Forward")).click();
      await expect(main(page).locator(railItem("Forward"))).toHaveAttribute("aria-current", "true");

      // Scrolling for yourself moves the rail with the page.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.wheel(0, 1);
      await expect(main(page).locator(railItem("Goalkeeper"))).toHaveAttribute("aria-current", "true");
      await expectNoSideScroll(page, width);
    });

    test("worst case: long, non-Latin and unbreakable names, missing photo and number", async ({ page }) => {
      const unbreakable = "Wolfeschlegelsteinhausenbergerdorff".repeat(3);
      await showPlayers(page, [
        row(1, { name: "Christopher Montgomery III of the Greater Portland Metropolitan Youth Soccer Association", position: "Goalkeeper" }),
        row(2, { name: unbreakable, position: "Goalkeeper", hometown: "A very long hometown name that should end in an ellipsis, Oregon" }),
        row(3, { name: "田中 太郎", position: "Defender", number: 0, hometown: "" }),
        row(4, { name: "Игорь Петров-Сидоров", position: "Defender", photo_url: "http://127.0.0.1:1/broken.jpg" }),
        row(5, { name: "J", position: "Midfielder" }),
        row(6, { name: "⚽ Ronaldo 👩🏽‍🦰", position: "Midfielder", active: false }),
        row(999, { name: "Last Number", position: "Forward" }),
      ]);
      await page.goto("/admin/roster");
      const cards = main(page).locator("[data-player-card]");
      await expect(cards).toHaveCount(7);

      // No name is taller than two lines, and none pushes the page sideways.
      const lines = await main(page).locator("[data-player-card] [title]").evaluateAll((elements) =>
        elements
          .filter((element) => element.className.includes("name"))
          .map((element) => {
            const style = getComputedStyle(element);
            return Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight));
          }),
      );
      expect(lines.length).toBe(7);
      for (const count of lines) expect(count).toBeLessThanOrEqual(2);
      await expect(main(page).getByTitle("Christopher Montgomery III of the Greater Portland Metropolitan Youth Soccer Association")).toBeVisible();
      await expectNoSideScroll(page, width);

      // Cards stay inside their column even with a name that has no break in it.
      const boxes = await main(page).locator("[data-player-card]").evaluateAll((elements) =>
        elements.map((element) => {
          const parent = element.parentElement!.getBoundingClientRect();
          const own = element.getBoundingClientRect();
          return own.right <= parent.right + 1 && own.left >= parent.left - 1;
        }),
      );
      expect(boxes.every(Boolean)).toBe(true);

      // A missing number is a dash, a missing or broken photo is initials, a hidden player says so.
      const noNumber = main(page).locator('[data-player-card]', { hasText: "田中 太郎" });
      await expect(noNumber).toContainText("–");
      await expect(noNumber).toContainText("田太");
      await expect(main(page).locator('[data-player-card]', { hasText: "Игорь" })).toContainText("ИП");
      await expect(main(page).locator('[data-player-card]', { hasText: "J" }).first()).toBeVisible();
      await expect(main(page).locator('[data-player-card][data-hidden]')).toHaveCount(1);
      await expect(main(page).locator('[data-player-card][data-hidden]')).toContainText("Hidden");
      await expect(page.getByTestId("roster-summary")).toHaveText("1 hidden from your website");
      await expect(main(page).locator('[data-player-card]', { hasText: "Last Number" })).toContainText("#999");
      await page.screenshot({ path: `${SHOTS}/roster-worst-${width}.png`, fullPage: true });
    });

    test("no players: a plain empty screen with an Add button that opens the form", async ({ page }) => {
      await showPlayers(page, []);
      await page.goto("/admin/roster");
      await expect(main(page).getByText("No players yet", { exact: true }).first()).toBeVisible();
      await expect(page.getByTestId("roster-count")).toHaveText("0");
      await expect(page.getByTestId("roster-summary")).toHaveText("No players yet");
      await expect(main(page).locator(`${phone ? "[data-rail-tab]" : "[data-rail-zone]"}`)).toHaveCount(0);
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/roster-empty-${width}.png`, fullPage: true });
      await main(page).getByRole("button", { name: "Add a player" }).last().click();
      await expect(page.getByRole("dialog", { name: "New player" })).toBeVisible();
    });

    test("one player: the rail is still whole, and an empty position offers to add one", async ({ page }) => {
      await showPlayers(page, [row(10, { name: "Marco Rossi", position: "Midfielder" })]);
      await page.goto("/admin/roster");
      await expect(main(page).locator("[data-player-card]")).toHaveCount(1);
      await expect(page.getByTestId("roster-count")).toHaveText("1");
      await expect(page.getByTestId("roster-summary")).toHaveText("Everyone is on your website");
      await expect(main(page).locator(`${phone ? "[data-rail-tab]" : "[data-rail-zone]"}`)).toHaveCount(4);
      await expect(main(page).getByText("No defenders yet")).toBeVisible();
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/roster-one-${width}.png`, fullPage: true });

      await main(page).getByRole("button", { name: "Add one" }).nth(1).click();
      const panel = page.getByRole("dialog", { name: "New player" });
      await expect(panel).toBeVisible();
      await expect(panel.getByLabel("Position")).toHaveValue("Defender");
    });

    test("find a player, and a search with no match says so", async ({ page }) => {
      await showPlayers(page, [
        row(1, { name: "Marco Rossi" }),
        row(2, { name: "Aiko Tanaka", position: "Forward" }),
      ]);
      await page.goto("/admin/roster");
      const search = main(page).getByRole("searchbox", { name: /Search players/ });
      await search.fill("aiko");
      await expect(main(page).locator("[data-player-card]")).toHaveCount(1);
      await expect(main(page).locator("[data-player-card]")).toContainText("Aiko Tanaka");
      await search.fill("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
      await expect(main(page).getByText(/No players match/)).toBeVisible();
      await expectNoSideScroll(page, width);
      await main(page).getByRole("button", { name: "Show everyone" }).click();
      await expect(main(page).locator("[data-player-card]")).toHaveCount(2);
    });

    test("open a card, change the name, save: the card and the database follow", async ({ page }) => {
      await sql("delete from onzio.players where club_id=$1 and name like 'RE-17 %'", [ALPHA]);
      await sql(
        `insert into onzio.players (club_id, number, name, position, age, nationality, hometown, height, weight)
         values ($1, 77, $2, 'Forward', 24, 'United States', 'Portland, OR', '5''10"', '160 lbs')`,
        [ALPHA, FIXTURE_NAME],
      );
      try {
        await page.goto("/admin/roster");
        // Plain CSS, not getByRole: while the edit panel is open the page behind it is hidden from the
        // accessibility tree, and the card's pressed state is exactly what is checked then.
        const card = page.locator("main [data-player-card]", { hasText: FIXTURE_NAME });
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute("aria-pressed", "false");
        await card.click();
        // The panel's name follows the name field as it is typed, so find it by role alone.
        const panel = page.getByRole("dialog");
        await expect(panel.getByRole("heading", { name: `Edit ${FIXTURE_NAME}` })).toBeVisible();
        await expect(card).toHaveAttribute("aria-pressed", "true");
        await page.screenshot({ path: `${SHOTS}/roster-edit-${width}.png` });
        await panel.getByLabel("Name").fill("RE-17 Renamed Player");
        await panel.getByRole("button", { name: "Save changes" }).click();
        await expect(panel).toBeHidden();
        await expect(main(page).locator("[data-player-card]", { hasText: "RE-17 Renamed Player" })).toBeVisible();
        const [saved] = await sql<{ name: string }>("select name from onzio.players where club_id=$1 and number=77 and name like 'RE-17 %'", [ALPHA]);
        expect(saved.name).toBe("RE-17 Renamed Player");
      } finally {
        await sql("delete from onzio.players where club_id=$1 and name like 'RE-17 %'", [ALPHA]);
      }
    });

    test("dark theme: the pitch, cards and tabs stay readable", async ({ page }) => {
      await page.context().addCookies([{ name: "onzio-admin-theme", value: "dark", domain: "alpha.localhost", path: "/admin" }]);
      try {
        await showPlayers(page, bigSquad());
        await page.goto("/admin/roster");
        await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", "dark");
        await expect(main(page).locator("[data-player-card]")).toHaveCount(64);
        await main(page).locator(railItem("Midfielder")).click();
        // The text on a card is light on a dark card, not dark on dark.
        const [cardBackground, nameColor] = await main(page)
          .locator("[data-player-card]")
          .first()
          .evaluate((element) => [
            getComputedStyle(element).backgroundColor,
            getComputedStyle(element.querySelector("[title]")!).color,
          ]);
        const lightness = (rgb: string) => rgb.match(/\d+/g)!.slice(0, 3).reduce((sum, value) => sum + Number(value), 0) / 3;
        expect(lightness(nameColor)).toBeGreaterThan(lightness(cardBackground) + 100);
        await page.screenshot({ path: `${SHOTS}/roster-dark-${width}.png` });
      } finally {
        await page.context().clearCookies({ name: "onzio-admin-theme" });
      }
    });

    test("Staff stays one tap away under the same title row", async ({ page }) => {
      await page.goto("/admin/roster");
      await main(page).getByRole("tab", { name: "Staff" }).click();
      await expect(main(page).getByRole("heading", { level: 1, name: /Your staff/ })).toBeVisible();
      await main(page).getByRole("button", { name: "Add staff" }).click();
      await expect(page.getByRole("dialog", { name: "New staff member" })).toBeVisible();
      await page.keyboard.press("Escape");
      await main(page).getByRole("tab", { name: "Players" }).click();
      await expect(main(page).getByRole("heading", { level: 1, name: /Your players/ })).toBeVisible();
      await expectNoSideScroll(page, width);
    });

    test("the home's Team roster row opens it", async ({ page }) => {
      await page.goto("/admin");
      await main(page).getByRole("link", { name: /Team roster/ }).click();
      await expect(page).toHaveURL(/\/admin\/roster$/);
      await expect(main(page).getByRole("heading", { level: 1, name: /Your players/ })).toBeVisible();
    });

    test("a club on the classic admin still gets the classic roster", async ({ page }) => {
      const previous = await setPortal("classic");
      try {
        await page.goto("/admin/roster");
        await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
        await expect(page.getByRole("tablist", { name: "Roster sections" })).toBeVisible();
        await expect(page.getByTestId("roster-pitch")).toHaveCount(0);
        await expect(page.locator("[data-player-card]")).toHaveCount(0);
      } finally {
        await setPortal(previous as "classic" | "reimagined");
      }
    });
  });
}
