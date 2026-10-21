import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { homepageSaveRequestSchema, type HomepageSaveRequest } from "@/lib/homepage-editor/contract";

const clubId = "11111111-1111-4111-8111-111111111111";
const seededDocument = "88888888-8888-4888-8888-888888888804";

async function reassignAndReturn() {
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  try {
    await db.query("begin");
    const original = await db.query("select c.kind,s.published_document_id from onzio.clubs c join onzio.presentation_state s on s.club_id=c.id where c.id=$1", [clubId]);
    expect(original.rows).toEqual([{ kind: "test", published_document_id: seededDocument }]);
    const other = randomUUID();
    await db.query(`insert into onzio.presentation_documents
      (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      select $2,club_id,(select max(version)+1 from onzio.presentation_documents where club_id=$1),
        schema_version,template_id,template_version,configuration,configuration_digest,created_by
      from onzio.presentation_documents where club_id=$1 and id=$3`, [clubId, other, seededDocument]);
    for (const id of [other, seededDocument]) {
      await db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [clubId, id]);
    }
    await db.query("commit");
  } finally {
    await db.query("rollback");
    await db.end();
  }
}

async function openHeading(page: Page) {
  await page.goto("/admin/homepage");
  const heading = page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.heading"]');
  await expect(heading).toBeVisible();
  await heading.click();
  await page.getByRole("button", { name: "Change the words", exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel("Line one", { exact: true })).toBeVisible();
  return heading;
}

for (const width of [1440, 390]) {
  test(`assignment ABA rejects an old homepage save and keeps its words at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const baseline = await (await page.request.get("/api/admin/homepage")).json();
    const marker = `Unsaved assignment draft ${randomUUID().slice(0, 8)}`;
    await openHeading(page);
    await page.getByLabel("Line one", { exact: true }).fill(marker);
    await reassignAndReturn();
    const response = page.waitForResponse(reply => reply.url().endsWith("/api/admin/homepage") && reply.request().method() === "POST");
    await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
    const rejected = await response;
    expect(rejected.status()).toBe(409);
    expect(await rejected.json()).toMatchObject({ error: { code: "DESIGN_CHANGED" } });
    await expect(page.locator(".hp-error").filter({ visible: true })).toContainText("Your website design changed");
    const notice = page.locator(".hp-error").filter({ visible: true });
    const text = await notice.locator("p").boundingBox();
    const actions = await notice.locator(".hp-notification-actions").boundingBox();
    if (!text || !actions) throw new Error("Conflict notification is not visible");
    expect(actions.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
    await expect(page.getByLabel("Line one", { exact: true })).toHaveValue(marker);
    const current = await (await page.request.get("/api/admin/homepage")).json();
    expect(current.revision).toBe(baseline.revision);
    expect(current.designRevision).not.toBe(baseline.designRevision);
    expect(current.content).toEqual(baseline.content);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: info.outputPath(`assignment-conflict-${width}.png`), fullPage: true });
    await page.waitForTimeout(900);
    await page.reload();
    await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
    await expect(review).toContainText(marker);
    await expect(review).toContainText("The website design changed");
    await expect(review.getByRole("button", { name: "Use recovered changes", exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`assignment-draft-retained-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("a committed response lost before reassignment reconciles without another browser POST", async ({ page }, info) => {
  const baseline = await (await page.request.get("/api/admin/homepage")).json();
  const marker = `Committed assignment save ${randomUUID().slice(0, 8)}`;
  let submitted: HomepageSaveRequest | undefined;
  let committed: unknown;
  let posts = 0;
  let receiptChecks = 0;
  page.on("request", request => {
    if (request.method() === "GET" && request.url().includes("/api/admin/homepage?operationId=")) receiptChecks += 1;
  });
  await page.route("**/api/admin/homepage", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    submitted = homepageSaveRequestSchema.parse(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committed = await response.json();
    await route.abort("connectionreset");
  });
  try {
    const heading = await openHeading(page);
    await page.getByLabel("Line one", { exact: true }).fill(marker);
    await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(".hp-error").filter({ visible: true })).toContainText("Your changes are still here");
    await reassignAndReturn();
    expect(submitted).toBeDefined();
    const replay = await page.request.post("/api/admin/homepage", { data: submitted });
    expect(replay.ok()).toBe(true);
    expect(await replay.json()).toEqual(committed);
    await page.reload();
    await expect(heading).toContainText(marker);
    await expect(page.getByText("Nothing to save yet.", { exact: true })).toBeVisible();
    expect(posts).toBe(1);
    expect(receiptChecks).toBe(1);
    await page.screenshot({ path: info.outputPath("assignment-receipt-reconciled.png"), fullPage: true });
  } finally {
    const current = await (await page.request.get("/api/admin/homepage")).json();
    if (current.content.hero.headline_line_one === marker) {
      const restored = await page.request.post("/api/admin/homepage", { data: {
        operationId: randomUUID(), expectedRevision: current.revision,
        designRevision: current.designRevision, sections: { hero: baseline.content.hero },
      } });
      expect(restored.ok()).toBe(true);
    }
  }
});
