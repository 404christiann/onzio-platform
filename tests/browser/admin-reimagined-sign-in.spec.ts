import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { createLocalClients } from "../helpers/supabase";

// ADMIN-RE-18 (screen): "Who can sign in" on local Alpha (switched to
// 'reimagined' by admin-reimagined.global-setup.ts), at phone and laptop width.
//
// Two kinds of check. The list-level ones (worst case, no helpers, many helpers,
// never signed in, a rate-limited resend) answer the page's own members request in
// the browser and touch no database row and send no email. The real ones (add,
// send again, remove, undo, add a name) use the local stack only: the spec refuses
// to run unless Supabase Auth's mail goes to the local Mailpit container, so no
// email can leave this machine. Fixture people are removed in a finally block, and
// their audit rows by local-test-data-cleanup.global-setup.ts. Screenshots land in
// test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const MAILPIT = "http://127.0.0.1:54324";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const DAY = 86_400_000;

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

/** Refuses anything but the isolated local stack, whose Auth mail goes only to the local Mailpit. */
function assertLocalMailOnly() {
  if (new URL(process.env.SUPABASE_TEST_URL ?? "http://invalid").origin !== "http://127.0.0.1:54321") {
    throw new Error("Refusing a non-local Auth target.");
  }
  const project = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([a-z0-9-]+)"/m)?.[1];
  if (project !== "onzio-platform-contracts") throw new Error("Refusing a different Docker project.");
  const environment = (name: string): string[] =>
    JSON.parse(execFileSync("docker", ["inspect", name, "--format", "{{json .Config.Env}}"], { encoding: "utf8" }));
  const auth = environment(`supabase_auth_${project}`);
  const mailbox = environment(`supabase_inbucket_${project}`);
  if (!auth.includes(`GOTRUE_SMTP_HOST=supabase_inbucket_${project}`) || !auth.includes("GOTRUE_SMTP_PORT=1025")) {
    throw new Error("Refusing Auth SMTP that does not point to the local Mailpit container.");
  }
  if (mailbox.some((value) => /^MP_SMTP_(RELAY|FORWARD)/.test(value) && value.split("=").slice(1).join("=").trim())) {
    throw new Error("Refusing a Mailpit mailbox configured for outbound relay or forwarding.");
  }
}

type Message = { ID: string; Subject: string; To: Array<{ Address: string }> };
async function mailTo(email: string): Promise<Message[]> {
  const response = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const body = (await response.json()) as { messages: Message[] };
  return body.messages.filter((message) => message.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()));
}

type Person = {
  userId: string;
  email: string;
  displayName: string | null;
  lastSignInAt: string | null;
  status?: string;
  createdAt?: string;
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const owner = (overrides: Partial<Person> = {}): Person & { isYou: boolean } => ({
  userId: OWNER_ID,
  email: "owner@alpha.example",
  displayName: "Marco Alvarez",
  lastSignInAt: ago(0),
  isYou: true,
  ...overrides,
});

const helper = (n: number, overrides: Partial<Person> = {}): Person => ({
  userId: uuid(n),
  email: `helper${n}@alpha.example`,
  displayName: `Helper ${n}`,
  lastSignInAt: ago(3),
  ...overrides,
});

/** Answers the page's own list request with `body`; any POST must be answered by the test. */
async function showMembers(page: Page, body: { owners: unknown[]; admins: unknown[] }) {
  await page.route("**/api/admin/members", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "UNMOCKED_POST" }) });
  });
}

async function openPage(page: Page) {
  await page.goto("/admin/members");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[hidden][id^='S:']")).toHaveCount(0);
}

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

const rows = (page: Page) => main(page).getByTestId("sign-in-row");
const rowFor = (page: Page, text: string | RegExp) => rows(page).filter({ hasText: text });

for (const width of [390, 1440]) {
  const phone = width < 640;

  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("one helper who has signed in, one who has not: words, buttons and what an owner cannot do", async ({ page }) => {
      await showMembers(page, {
        owners: [owner()],
        admins: [
          helper(1, { displayName: "Dana Ruiz", email: "dana.ruiz@alpha.example", lastSignInAt: ago(3) }),
          helper(2, { displayName: "Sam Okafor", email: "sam.okafor@alpha.example", lastSignInAt: null }),
        ],
      });
      await openPage(page);
      await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Who can sign in");
      await expect(main(page).getByRole("heading", { level: 1, name: "Who can sign in" })).toBeVisible();
      await expect(main(page).getByRole("list", { name: "People who can sign in, 3" })).toBeVisible();

      // Every owner is listed, with no Remove and no menu.
      const you = rowFor(page, "Marco Alvarez");
      await expect(you).toContainText("You · owner");
      await expect(you).toContainText("Only Onzio can change the owner");
      await expect(you.getByTestId("sign-in-menu")).toHaveCount(0);
      await expect(you.getByRole("button")).toHaveCount(0);

      // "Signed in Tue" for someone who has, "Hasn't signed in yet" and the way to send it again for someone who has not.
      await expect(rowFor(page, "Dana Ruiz").getByTestId("sign-in-status")).toHaveText(/^Signed in (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
      await expect(rowFor(page, "Dana Ruiz").getByTestId("sign-in-resend")).toHaveCount(0);
      const sam = rowFor(page, "Sam Okafor");
      await expect(sam.getByTestId("sign-in-status")).toContainText("Hasn’t signed in yet");
      await expect(sam.getByRole("button", { name: "Send the code again to Sam Okafor" })).toBeVisible();

      await expect(page.getByTestId("sign-in-help")).toContainText("Helpers can: enter scores, add games, edit the website, see registrations");
      await expect(page.getByTestId("sign-in-help")).toContainText("Helpers can’t: see payments or change who can sign in");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/sign-in-list-${width}.png`, fullPage: true });

      // The row menu has both actions, for a person who has signed in too.
      await rowFor(page, "Dana Ruiz").getByTestId("sign-in-menu").click();
      await expect(page.getByRole("menuitem", { name: "Send the code again" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Remove access" })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/sign-in-menu-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menuitem", { name: "Remove access" })).toHaveCount(0);
    });

    test("worst case: long, one-letter, non-Latin and unbreakable names and emails, a person with no name", async ({ page }) => {
      const unbreakable = "Wolfeschlegelsteinhausenbergerdorff".repeat(4);
      await showMembers(page, {
        owners: [
          owner({
            displayName: "Konstantin Oberhauser-Wettstein of the Greater Portland Metropolitan Youth Soccer Association",
            email: "konstantin.oberhauser-wettstein@eastside-united-youth-soccer-association.example.org",
          }),
          { ...owner({ displayName: null, email: "second.owner@alpha.example", lastSignInAt: ago(1) }), userId: uuid(90), isYou: false },
        ],
        admins: [
          helper(1, { displayName: "Jo", email: "a@b.co" }),
          helper(2, { displayName: unbreakable, email: `${unbreakable}@${unbreakable}.example.com`, lastSignInAt: null }),
          helper(3, { displayName: "王秀英", email: "wang.xiuying@example.com", lastSignInAt: ago(1) }),
          helper(4, { displayName: "🦊 Fox", email: "fox@example.org", lastSignInAt: ago(20) }),
          helper(5, { displayName: null, email: "first.last+billing-notifications@example.com", lastSignInAt: ago(400) }),
          helper(6, { displayName: "Ólafur Darri Ólafsson", email: "olafur@example.test", lastSignInAt: null }),
          helper(7, { displayName: "J", email: "j@example.test" }),
        ],
      });
      await openPage(page);
      await expect(rows(page)).toHaveCount(9);
      await expectNoSideScroll(page, width);

      // Nothing sticks out of the card, however long the unbroken word.
      const outside = await rows(page).evaluateAll((elements) =>
        elements.filter((element) => {
          const card = element.parentElement!.getBoundingClientRect();
          return [...element.querySelectorAll("*")].some((child) => {
            const box = child.getBoundingClientRect();
            return box.width > 0 && (box.right > card.right + 1 || box.left < card.left - 1);
          });
        }).length,
      );
      expect(outside).toBe(0);

      // The full name and email stay one hover away when the visible text is cut.
      await expect(main(page).getByTitle(unbreakable).first()).toBeVisible();
      await expect(main(page).getByTestId("sign-in-email").first()).toHaveAttribute("title", /konstantin\.oberhauser-wettstein@eastside-united-youth-soccer-association\.example\.org/);

      // A one-letter name and an emoji name still get a plain disc; a missing name offers "Add a name".
      await expect(rowFor(page, "wang.xiuying@example.com").getByTestId("sign-in-name")).toHaveText("王秀英");
      await expect(rowFor(page, "first.last+billing").getByRole("button", { name: /Add a name for first\.last/ })).toBeVisible();
      await expect(rowFor(page, "second.owner@alpha.example").getByRole("button", { name: /Add a name for second\.owner/ })).toBeVisible();
      await expect(rowFor(page, "second.owner@alpha.example")).toContainText("Owner");
      await expect(rowFor(page, "fox@example.org").getByTestId("sign-in-status")).toHaveText(/^Signed in [A-Z][a-z]{2} \d{1,2}$/);
      await expect(rowFor(page, "first.last+billing").getByTestId("sign-in-status")).toHaveText(/^Signed in [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
      await page.screenshot({ path: `${SHOTS}/sign-in-worst-${width}.png`, fullPage: true });
    });

    test("no helpers: a plain empty line, the box that says what helpers can do, and Add someone", async ({ page }) => {
      await showMembers(page, { owners: [owner()], admins: [] });
      await openPage(page);
      await expect(rows(page)).toHaveCount(1);
      await expect(page.getByTestId("sign-in-empty")).toContainText("No helpers yet");
      await expect(page.getByTestId("sign-in-help")).toBeVisible();
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/sign-in-empty-${width}.png`, fullPage: true });
      await page.getByTestId("sign-in-add").click();
      await expect(page.getByRole("dialog", { name: "Add someone" })).toBeVisible();
    });

    test("many helpers: every one is listed, counted, and nothing scrolls sideways", async ({ page }) => {
      const admins = Array.from({ length: 60 }, (_, index) =>
        helper(index + 1, { lastSignInAt: index % 3 === 0 ? null : ago(index % 9) }),
      );
      await showMembers(page, { owners: [owner()], admins });
      await openPage(page);
      await expect(rows(page)).toHaveCount(61);
      await expect(main(page).getByRole("list", { name: "People who can sign in, 61" })).toBeVisible();
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/sign-in-many-${width}.png` });
    });

    test("send the code again: a rate limit says wait a minute and changes nothing; a success says Code sent", async ({ page }) => {
      const posts: Array<Record<string, unknown>> = [];
      let limited = true;
      await page.route("**/api/admin/members", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              owners: [owner()],
              admins: [helper(1, { displayName: "Sam Okafor", email: "sam.okafor@alpha.example", lastSignInAt: null })],
            }),
          });
          return;
        }
        posts.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill(
          limited
            ? { status: 429, contentType: "application/json", body: JSON.stringify({ error: "AUTH_CODE_RATE_LIMITED" }) }
            : { status: 200, contentType: "application/json", body: JSON.stringify({ userId: uuid(1), codeSent: true }) },
        );
      });
      await openPage(page);
      const sam = rowFor(page, "Sam Okafor");
      await sam.getByTestId("sign-in-resend").click();
      const notice = page.getByTestId("sign-in-notice");
      await expect(notice).toContainText("A code was sent to Sam a moment ago. Wait a minute, then send it again.");
      await expect(notice).not.toContainText("AUTH_CODE_RATE_LIMITED");
      await expect(sam.getByTestId("sign-in-status")).toContainText("Hasn’t signed in yet");
      await expect(sam.getByTestId("sign-in-resend")).toBeEnabled();
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/sign-in-rate-limited-${width}.png`, fullPage: true });

      limited = false;
      await sam.getByTestId("sign-in-resend").click();
      await expect(sam.getByTestId("sign-in-status")).toContainText("Code sent · hasn’t signed in yet");
      await expect(sam.getByTestId("sign-in-resend")).toHaveCount(0);
      await expect(page.getByTestId("sign-in-toast").first()).toContainText("Code sent to sam.okafor@alpha.example");
      expect(posts).toEqual([
        { action: "resend-code", userId: uuid(1) },
        { action: "resend-code", userId: uuid(1) },
      ]);
    });

    test("add someone: the button stays muted until name and email are good, a name is counted, a repeat is caught", async ({ page }) => {
      await showMembers(page, { owners: [owner()], admins: [helper(1, { email: "dana.ruiz@alpha.example" })] });
      await openPage(page);
      await page.getByTestId("sign-in-add").click();
      const dialog = page.getByRole("dialog", { name: "Add someone" });
      const send = dialog.getByRole("button", { name: "Send sign-in code" });
      await expect(dialog).toContainText("We’ll email them a sign-in code. They can’t see payments.");
      await expect(send).toBeDisabled();

      await dialog.getByLabel("Their name").fill("Jordan Lee");
      await expect(send).toBeDisabled();
      await dialog.getByLabel("Their email").fill("not-an-email");
      await dialog.getByLabel("Their email").blur();
      await expect(dialog).toContainText("That doesn’t look like an email address.");
      await expect(send).toBeDisabled();

      await dialog.getByLabel("Their email").fill("Dana.Ruiz@alpha.example");
      await expect(dialog).toContainText("That person can already sign in.");
      await expect(send).toBeDisabled();

      await dialog.getByLabel("Their email").fill("jordan.lee@alpha.example");
      await expect(send).toBeEnabled();

      // A long pasted name stops at 120 characters and shows the count.
      await dialog.getByLabel("Their name").fill("x".repeat(300));
      await expect(dialog.getByLabel("Their name")).toHaveValue("x".repeat(120));
      await expect(dialog).toContainText("120 / 120");
      await expectNoSideScroll(page, width);
      await page.screenshot({ path: `${SHOTS}/sign-in-add-dialog-${width}.png` });

      // Cancel sends nothing (an unmocked POST would answer 500 and show up below).
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("dialog", { name: "Add someone" })).toHaveCount(0);
    });
  });
}

test.describe("remove and Undo, with the answers given by the test", () => {
  test("Undo that fails once stays on screen and works the second time; a later toast does not push it away; a double click sends one request", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const people = [
      helper(1, { displayName: "Sam Okafor", email: "sam@alpha.example" }),
      helper(2, { displayName: "Dana Ruiz", email: "dana@alpha.example", lastSignInAt: null }),
    ];
    let admins = [...people];
    const posts: Array<Record<string, unknown>> = [];
    let undoAttempts = 0;
    await page.route("**/api/admin/members", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ owners: [owner()], admins }) });
        return;
      }
      const body = route.request().postDataJSON() as { action: string; userId: string };
      posts.push(body);
      if (body.action === "remove") {
        admins = admins.filter((admin) => admin.userId !== body.userId);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ userId: body.userId, status: "removed", undoUntil: new Date(Date.now() + 600_000).toISOString() }) });
      } else if (body.action === "undo-remove") {
        undoAttempts += 1;
        if (undoAttempts === 1) {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "MEMBERSHIP_MUTATION_FAILED" }) });
          return;
        }
        admins = [...people];
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ userId: body.userId, status: "active" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ userId: body.userId, codeSent: true }) });
      }
    });
    await openPage(page);

    await rowFor(page, "Sam Okafor").getByTestId("sign-in-menu").click();
    await page.getByRole("menuitem", { name: "Remove access" }).dblclick();
    const undoToast = page.getByTestId("sign-in-toast").filter({ hasText: "Sam can’t sign in any more" });
    await expect(undoToast).toBeVisible();
    expect(posts.filter((post) => post.action === "remove")).toHaveLength(1);

    // Three more toasts later, Sam's Undo is still there.
    for (let index = 0; index < 3; index += 1) {
      const resend = rowFor(page, "Dana Ruiz").getByTestId("sign-in-resend");
      if (await resend.count()) await resend.click();
      else break;
    }
    await expect(undoToast).toBeVisible();

    await undoToast.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("sign-in-notice")).toContainText("Nothing changed");
    await expect(undoToast).toBeVisible();
    await undoToast.getByRole("button", { name: "Undo" }).click();
    await expect(rowFor(page, "Sam Okafor")).toBeVisible();
    await expect(undoToast).toHaveCount(0);
    expect(undoAttempts).toBe(2);
  });
});

test.describe("dark theme", () => {
  test("the list, the menu and a message read in the dark admin theme", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await showMembers(page, {
      owners: [owner()],
      admins: [
        helper(1, { displayName: "Dana Ruiz", email: "dana.ruiz@alpha.example" }),
        helper(2, { displayName: "Sam Okafor", email: "sam.okafor@alpha.example", lastSignInAt: null }),
      ],
    });
    await openPage(page);
    await page.evaluate(() => {
      document.querySelectorAll("[data-admin-theme]").forEach((element) => element.setAttribute("data-admin-theme", "dark"));
    });
    const card = main(page).getByTestId("sign-in-list");
    const background = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
    const [red, green, blue] = background.match(/\d+/g)!.map(Number);
    expect(red + green + blue).toBeLessThan(300);
    const waiting = rowFor(page, "Sam Okafor").getByTestId("sign-in-status").locator("span").first();
    const ink = await waiting.evaluate((element) => getComputedStyle(element).color);
    const [r, g, b] = ink.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeGreaterThan(450);
    await page.screenshot({ path: `${SHOTS}/sign-in-dark-390.png`, fullPage: true });
  });
});

test.describe("only an owner changes who can sign in", () => {
  const adminState = process.env.ADMIN_REIMAGINED_ADMIN_STORAGE_STATE;
  test.skip(!adminState, "Set ADMIN_REIMAGINED_ADMIN_STORAGE_STATE to the local administrator state.");
  test.use({ storageState: adminState });

  test("an administrator who opens the page by its address sees why, and nothing is asked of the server", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/admin/members")) requests.push(request.method());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page);
    await expect(page.getByTestId("sign-in-owner-only")).toContainText("Only a club owner can change who can sign in.");
    await expect(page.getByTestId("sign-in-add")).toHaveCount(0);
    await expect(page.getByTestId("sign-in-row")).toHaveCount(0);
    expect(requests).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/sign-in-admin-390.png` });
  });
});

test.describe("a club still on the classic admin keeps the Team access page", () => {
  test("the classic heading, form and Remove button are unchanged", async ({ page }) => {
    const previous = await setPortal("classic");
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/admin/members");
      await expect(page.getByRole("heading", { level: 1, name: "Team access" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send access code" })).toBeVisible();
      await expect(page.getByTestId("sign-in-people")).toHaveCount(0);
    } finally {
      await setPortal(previous as "classic" | "reimagined");
    }
  });
});

test.describe("the real thing, on the local stack only", () => {
  test.beforeAll(() => assertLocalMailOnly());

  test("add, send again, remove, undo and add a name, end to end", async ({ page }) => {
    test.setTimeout(150_000);
    const { service } = createLocalClients();
    const stamp = Date.now().toString(36);
    const email = `re18-added-${stamp}@example.test`;
    const bareEmail = `re18-bare-${stamp}@example.test`;
    const userIds: string[] = [];
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openPage(page);
      await expect(main(page).getByTestId("sign-in-list")).toBeVisible();

      // Add: name and email, a real code to the local mailbox only.
      await page.getByTestId("sign-in-add").click();
      const dialog = page.getByRole("dialog", { name: "Add someone" });
      await dialog.getByLabel("Their name").fill("Jordan Fixture");
      await dialog.getByLabel("Their email").fill(email);
      await dialog.getByRole("button", { name: "Send sign-in code" }).click();
      await expect(page.getByRole("dialog", { name: "Add someone" })).toHaveCount(0);
      const added = rowFor(page, "Jordan Fixture");
      await expect(added).toBeVisible();
      await expect(added).toContainText(email);
      await expect(added.getByTestId("sign-in-status")).toContainText("Code sent · hasn’t signed in yet");
      await expect(page.getByTestId("sign-in-toast").first()).toContainText(`Code sent to ${email}`);
      const [membership] = await sql<{ user_id: string; display_name: string | null; status: string }>(
        "select user_id, display_name, status from onzio.club_members m join auth.users u on u.id=m.user_id where m.club_id=$1 and lower(u.email)=lower($2)",
        [ALPHA, email],
      );
      expect(membership).toMatchObject({ display_name: "Jordan Fixture", status: "active" });
      userIds.push(membership.user_id);
      await expect.poll(async () => (await mailTo(email)).length, { timeout: 15_000 }).toBe(1);

      // Send again straight away: Supabase Auth allows one code a minute, and the screen says so.
      await page.reload();
      await page.waitForLoadState("networkidle");
      const again = rowFor(page, "Jordan Fixture");
      await again.getByTestId("sign-in-resend").click();
      await expect(page.getByTestId("sign-in-notice")).toContainText("A code was sent to Jordan a moment ago. Wait a minute, then send it again.");
      expect((await mailTo(email)).length).toBe(1);
      await page.screenshot({ path: "test-results/admin-reimagined/sign-in-real-rate-limited-1440.png" });

      // Once the minute has passed, send again: a second real code, to the local mailbox.
      await sql("update auth.users set recovery_sent_at = now() - interval '10 minutes', confirmation_sent_at = null where id=$1", [
        membership.user_id,
      ]);
      await again.getByTestId("sign-in-resend").click();
      await expect(again.getByTestId("sign-in-status")).toContainText("Code sent");
      await expect.poll(async () => (await mailTo(email)).length, { timeout: 15_000 }).toBe(2);

      // Remove in one tap, with Undo.
      await again.getByTestId("sign-in-menu").click();
      await page.getByRole("menuitem", { name: "Remove access" }).click();
      await expect(rowFor(page, "Jordan Fixture")).toHaveCount(0);
      const toast = page.getByTestId("sign-in-toast").filter({ hasText: "Jordan can’t sign in any more" });
      await expect(toast).toBeVisible();
      await page.screenshot({ path: "test-results/admin-reimagined/sign-in-real-removed-1440.png" });
      expect((await sql<{ status: string }>("select status from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, membership.user_id]))[0].status).toBe("removed");
      await toast.getByRole("button", { name: "Undo" }).click();
      await expect(rowFor(page, "Jordan Fixture")).toBeVisible();
      await expect(page.getByTestId("sign-in-toast").filter({ hasText: "Jordan can sign in again" })).toBeVisible();
      expect((await sql<{ status: string }>("select status from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, membership.user_id]))[0].status).toBe("active");

      // A helper added without a name (the classic page does this) offers "Add a name".
      const bare = await page.request.post("/api/admin/members", { data: { action: "add", email: bareEmail } });
      expect(bare.ok()).toBe(true);
      userIds.push(((await bare.json()) as { userId: string }).userId);
      await page.reload();
      await page.waitForLoadState("networkidle");
      const nameless = rowFor(page, bareEmail);
      await nameless.getByRole("button", { name: /Add a name for/ }).click();
      const nameDialog = page.getByRole("dialog", { name: "Add a name" });
      await expect(nameDialog.getByRole("button", { name: "Save name" })).toBeDisabled();
      await nameDialog.getByLabel("Name").fill("Pat Coach");
      await nameDialog.getByRole("button", { name: "Save name" }).click();
      await expect(rowFor(page, "Pat Coach")).toBeVisible();
      await expect(rowFor(page, "Pat Coach").getByRole("button", { name: /Add a name/ })).toHaveCount(0);
      expect((await sql<{ display_name: string }>("select display_name from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, userIds[1]]))[0].display_name).toBe("Pat Coach");

      // Phone width, the same list.
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoSideScroll(page, 390);
      await page.screenshot({ path: "test-results/admin-reimagined/sign-in-real-390.png", fullPage: true });
    } finally {
      for (const userId of userIds) {
        await sql("delete from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, userId]);
        await service.auth.admin.deleteUser(userId).catch(() => undefined);
      }
    }
  });
});
