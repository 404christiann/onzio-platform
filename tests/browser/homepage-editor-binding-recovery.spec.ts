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
    for (const id of [other, seededDocument]) await db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [clubId, id]);
    await db.query("commit");
  } finally {
    await db.query("rollback");
    await db.end();
  }
}

async function editHeading(page: Page, marker: string) {
  await page.goto("/admin/homepage");
  const heading = page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.heading"]');
  await heading.click();
  await page.getByRole("button", { name: "Change the words", exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Line one", { exact: true }).fill(marker);
  await page.waitForTimeout(900);
  return heading;
}

for (const width of [1440, 390]) {
  test(`equal binding meaning permits reviewed recovery after assignment change at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const baseline = await (await page.request.get("/api/admin/homepage")).json();
    const marker = `Reviewed recovery ${randomUUID().slice(0, 8)}`;
    const otherText = `Current server paragraph ${randomUUID().slice(0, 8)}`;
    let posts = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/admin/homepage")) posts += 1; });
    try {
      const heading = await editHeading(page, marker);
      await reassignAndReturn();
      const assigned = await (await page.request.get("/api/admin/homepage")).json();
      const concurrentSave = await page.request.post("/api/admin/homepage", { data: {
        operationId: randomUUID(), expectedRevision: assigned.revision,
        designRevision: assigned.designRevision, sections: { hero: { intro: otherText } },
      } });
      expect(concurrentSave.ok()).toBe(true);
      const latest = await concurrentSave.json();
      await page.reload();
      await expect(heading).not.toContainText(marker);
      await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
      const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
      await expect(review).toContainText(marker);
      await expect(review.getByRole("button", { name: "Use recovered changes", exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`compatible-review-${width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await expect(review).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Review recovered draft", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
      await review.getByRole("button", { name: "Use recovered changes", exact: true }).click();
      await expect(heading).toContainText(marker);
      await expect(page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.intro"]')).toHaveText(otherText);
      expect(posts).toBe(0);
      const response = page.waitForResponse(reply => reply.url().endsWith("/api/admin/homepage") && reply.request().method() === "POST");
      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      const saved = await response;
      expect(saved.ok()).toBe(true);
      expect(saved.request().postDataJSON()).toMatchObject({ expectedRevision: latest.revision, designRevision: latest.designRevision });
      expect(posts).toBe(1);
      const current = await (await page.request.get("/api/admin/homepage")).json();
      expect(current.content.hero).toMatchObject({ headline_line_one: marker, intro: otherText });
      expect(errors).toEqual([]);
    } finally {
      const current = await (await page.request.get("/api/admin/homepage")).json();
      if (current.content.hero.headline_line_one === marker || current.content.hero.intro === otherText) {
        const restored = await page.request.post("/api/admin/homepage", { data: {
          operationId: randomUUID(), expectedRevision: current.revision,
          designRevision: current.designRevision, sections: { hero: baseline.content.hero },
        } });
        expect(restored.ok()).toBe(true);
      }
    }
  });
}


test("an uncommitted uncertain save checks its receipt before assignment review", async ({ page }, info) => {
  const baseline = await (await page.request.get("/api/admin/homepage")).json();
  const marker = `Uncommitted recovery ${randomUUID().slice(0, 8)}`;
  let submitted: HomepageSaveRequest | undefined;
  let posts = 0;
  let receiptChecks = 0;
  page.on("request", request => {
    if (request.method() === "GET" && request.url().includes("/api/admin/homepage?operationId=")) receiptChecks += 1;
  });
  await page.route("**/api/admin/homepage", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    if (posts === 1) {
      submitted = homepageSaveRequestSchema.parse(route.request().postDataJSON());
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  try {
    const heading = await editHeading(page, marker);
    await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(".hp-error").filter({ visible: true })).toContainText("Your changes are still here");
    await reassignAndReturn();
    await page.reload();
    await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
    await expect(review).toContainText(marker);
    expect(receiptChecks).toBe(1);
    expect(posts).toBe(1);
    await expect(heading).not.toContainText(marker);
    await page.screenshot({ path: info.outputPath("uncommitted-assignment-review.png"), fullPage: true });
    await review.getByRole("button", { name: "Use recovered changes", exact: true }).click();
    const current = await (await page.request.get("/api/admin/homepage")).json();
    const response = page.waitForResponse(reply => reply.url().endsWith("/api/admin/homepage") && reply.request().method() === "POST");
    await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    if (!submitted) throw new Error("No uncertain operation was captured");
    expect(saved.request().postDataJSON()).toMatchObject({ expectedRevision: current.revision, designRevision: current.designRevision });
    expect(saved.request().postDataJSON().operationId).not.toBe(submitted.operationId);
    expect(posts).toBe(2);
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

async function readStoredRecord(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opened = indexedDB.open("onzio-homepage-editor");
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      const tx = db.transaction("drafts", "readonly");
      const request = tx.objectStore("drafts").getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result[0] ?? null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function changeStoredMeaning(page: Page, change: "revision" | "unknown" | "legacy") {
  return page.evaluate(mode => new Promise((resolve, reject) => {
    const opened = indexedDB.open("onzio-homepage-editor");
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const keys = store.getAllKeys();
      let changed: unknown;
      keys.onsuccess = () => {
        if (keys.result.length !== 1) { tx.abort(); return; }
        const request = store.get(keys.result[0]);
        request.onsuccess = () => {
          const record = request.result;
          if (record.schemaVersion !== 2 || !record.binding) { tx.abort(); return; }
          if (mode === "legacy") { record.schemaVersion = 1; delete record.binding; }
          else record.binding = mode === "unknown" ? { key: "uninstalled/homepage", revision: 1 } : { ...record.binding, revision: record.binding.revision + 1 };
          changed = record;
          store.put(record, keys.result[0]);
        };
      };
      tx.oncomplete = () => { db.close(); resolve(changed); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Expected one versioned homepage recovery record")); };
    };
  }), change);
}

for (const [width, change] of [[1440, "revision"], [390, "unknown"]] as const) {
  test(`incompatible ${change} meaning retains the original draft at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const baseline = await (await page.request.get("/api/admin/homepage")).json();
    const marker = `Incompatible words ${randomUUID().slice(0, 8)}`;
    const heading = await editHeading(page, marker);
    const original = await changeStoredMeaning(page, change);
    let posts = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/admin/homepage")) posts += 1; });
    await page.reload();
    await expect(heading).not.toContainText(marker);
    await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
    await expect(review).toContainText(marker);
    await expect(review.getByRole("button", { name: "Use recovered changes", exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`incompatible-review-${width}.png`), fullPage: true });
    await review.getByRole("button", { name: "Keep reviewing later", exact: true }).click();
    expect(await readStoredRecord(page)).toEqual(original);
    await page.reload();
    await expect(page.getByRole("button", { name: "Review recovered draft", exact: true })).toBeVisible();
    expect(await readStoredRecord(page)).toEqual(original);
    expect(posts).toBe(0);
    const current = await (await page.request.get("/api/admin/homepage")).json();
    expect(current.content).toEqual(baseline.content);
    expect(current.revision).toBe(baseline.revision);
    expect(current.designRevision).toBe(baseline.designRevision);
  });
}

test("a legacy draft after assignment change remains review-only without invented binding metadata", async ({ page }, info) => {
  const marker = `Legacy recovery ${randomUUID().slice(0, 8)}`;
  await editHeading(page, marker);
  const original = await changeStoredMeaning(page, "legacy");
  await reassignAndReturn();
  await page.reload();
  await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
  await expect(review).toContainText(marker);
  await expect(review.getByRole("button", { name: "Use recovered changes", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("legacy-review.png"), fullPage: true });
  await page.keyboard.press("Escape");
  expect(await readStoredRecord(page)).toEqual(original);
  await page.reload();
  await expect(page.getByRole("button", { name: "Review recovered draft", exact: true })).toBeVisible();
  expect(await readStoredRecord(page)).toEqual(original);
});

test("storage upgrade preserves legacy records and files while older clients cannot clear new drafts", async ({ page, context }) => {
  const baseline = await (await page.request.get("/api/admin/homepage")).json();
  const marker = `Upgraded legacy draft ${randomUUID().slice(0, 8)}`;
  const fileKey = randomUUID();
  await page.goto("/admin");
  const original = await page.evaluate(({ content, revision, designRevision, marker, fileKey }) => new Promise((resolve, reject) => {
    const opened = indexedDB.open("onzio-homepage-editor", 1);
    opened.onupgradeneeded = () => {
      opened.result.createObjectStore("drafts");
      opened.result.createObjectStore("files");
    };
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      const scopeKey = "11111111-1111-4111-8111-111111111111:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
      const draft = structuredClone(content);
      draft.hero.headline_line_one = marker;
      const record = {
        schemaVersion: 1,
        scope: { origin: window.location.origin, clubId: "11111111-1111-4111-8111-111111111111", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" },
        savedAt: new Date().toISOString(), baseRevision: revision, designRevision,
        baseline: content, draft, submitted: null,
      };
      const tx = db.transaction(["drafts", "files"], "readwrite");
      tx.objectStore("drafts").put(record, scopeKey);
      tx.objectStore("files").put({ scopeKey, file: new File(["synthetic pending file"], "pending-photo.png", { type: "image/png" }) }, fileKey);
      tx.oncomplete = () => { db.close(); resolve(record); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), { content: baseline.content, revision: baseline.revision, designRevision: baseline.designRevision, marker, fileKey });
  const older = await context.newPage();
  await older.goto("/admin");
  await older.evaluate(() => new Promise<void>((resolve, reject) => {
    const opened = indexedDB.open("onzio-homepage-editor", 1);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      window.addEventListener("release-recovery-database", () => opened.result.close(), { once: true });
      resolve();
    };
  }));
  try {
    await page.goto("/admin/homepage");
    await expect(page.getByRole("alert").filter({ hasText: "Browser recovery is unavailable" })).toBeVisible();
  } finally {
    await older.evaluate(() => window.dispatchEvent(new Event("release-recovery-database")));
    await older.close();
  }
  await page.reload();
  const heading = page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.heading"]');
  await expect(heading).toContainText(marker);
  await page.waitForTimeout(900);
  expect(await readStoredRecord(page)).toEqual(original);
  await heading.click();
  await page.getByRole("button", { name: "Change the words", exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Line one", { exact: true }).fill(`${marker} edited`);
  await page.waitForTimeout(900);
  const versioned = await readStoredRecord(page);
  expect(versioned).toMatchObject({ schemaVersion: 2, draft: { hero: { headline_line_one: `${marker} edited` } } });
  const oldClient = await page.evaluate(() => new Promise((resolve, reject) => {
    const opened = indexedDB.open("onzio-homepage-editor", 1);
    opened.onerror = () => resolve(opened.error?.name);
    opened.onsuccess = () => { opened.result.close(); reject(new Error("An older client could open the new recovery database")); };
  }));
  expect(oldClient).toBe("VersionError");
  expect(await readStoredRecord(page)).toEqual(versioned);
  const retainedFile = await page.evaluate(key => new Promise<{ version: number; name: string; body: string }>((resolve, reject) => {
    const opened = indexedDB.open("onzio-homepage-editor");
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      const request = db.transaction("files", "readonly").objectStore("files").get(key);
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = async () => {
        try { resolve({ version: db.version, name: request.result.file.name, body: await request.result.file.text() }); }
        catch (error) { reject(error); }
        finally { db.close(); }
      };
    };
  }), fileKey);
  expect(retainedFile).toEqual({ version: 2, name: "pending-photo.png", body: "synthetic pending file" });
});

test("a committed receipt wins over incompatible recovery metadata and keeps later server edits", async ({ page }, info) => {
  const baseline = await (await page.request.get("/api/admin/homepage")).json();
  const marker = `Committed recovery ${randomUUID().slice(0, 8)}`;
  const otherText = `Later server edit ${randomUUID().slice(0, 8)}`;
  let posts = 0;
  let receiptChecks = 0;
  page.on("request", request => {
    if (request.method() === "GET" && request.url().includes("/api/admin/homepage?operationId=")) receiptChecks += 1;
  });
  await page.route("**/api/admin/homepage", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("connectionreset");
  });
  try {
    const heading = await editHeading(page, marker);
    await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(".hp-error").filter({ visible: true })).toContainText("Your changes are still here");
    await changeStoredMeaning(page, "revision");
    await reassignAndReturn();
    const assigned = await (await page.request.get("/api/admin/homepage")).json();
    const later = await page.request.post("/api/admin/homepage", { data: {
      operationId: randomUUID(), expectedRevision: assigned.revision,
      designRevision: assigned.designRevision, sections: { hero: { intro: otherText } },
    } });
    expect(later.ok()).toBe(true);
    await page.reload();
    await expect(heading).toContainText(marker);
    await expect(page.frameLocator('iframe[title="Homepage preview"]').locator('[data-homepage-piece="hero.intro"]')).toHaveText(otherText);
    await expect(page.getByText("Nothing to save yet.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review recovered draft", exact: true })).toHaveCount(0);
    expect(posts).toBe(1);
    expect(receiptChecks).toBe(1);
    expect(await readStoredRecord(page)).toBeNull();
    await page.screenshot({ path: info.outputPath("committed-current-content.png"), fullPage: true });
  } finally {
    const current = await (await page.request.get("/api/admin/homepage")).json();
    if (current.content.hero.headline_line_one === marker || current.content.hero.intro === otherText) {
      const restored = await page.request.post("/api/admin/homepage", { data: {
        operationId: randomUUID(), expectedRevision: current.revision,
        designRevision: current.designRevision, sections: { hero: baseline.content.hero },
      } });
      expect(restored.ok()).toBe(true);
    }
  }
});

test("reviewed apply cannot consume a recovery copy replaced by another tab", async ({ page, context }, info) => {
  const baseline = await (await page.request.get("/api/admin/homepage")).json();
  const marker = `Owned recovery ${randomUUID().slice(0, 8)}`;
  const heading = await editHeading(page, marker);
  await reassignAndReturn();
  await page.reload();
  await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
  const second = await context.newPage();
  try {
    await second.goto("/admin");
    const protectedRecord = await changeStoredMeaning(second, "revision");
    await review.getByRole("button", { name: "Use recovered changes", exact: true }).click();
    await expect(review.getByRole("alert")).toContainText("The draft is still stored");
    await expect(review.getByRole("alert")).toBeInViewport({ ratio: 1 });
    await expect(review).toBeVisible();
    await expect(heading).not.toContainText(marker);
    expect(await readStoredRecord(page)).toEqual(protectedRecord);
    expect((await (await page.request.get("/api/admin/homepage")).json()).content).toEqual(baseline.content);
    await page.screenshot({ path: info.outputPath("review-apply-newer-tab.png"), fullPage: true });
  } finally { await second.close(); }
});

for (const version of [1, 2]) {
  test(`version-${version} uncommitted recovery retries the original save payload after reload`, async ({ page }) => {
    const baseline = await (await page.request.get("/api/admin/homepage")).json();
    const marker = `Exact recovery retry ${randomUUID().slice(0, 8)}`;
    const submitted: HomepageSaveRequest[] = [];
    let receiptChecks = 0;
    page.on("request", request => {
      if (request.method() === "GET" && request.url().includes("/api/admin/homepage?operationId=")) receiptChecks += 1;
    });
    await page.route("**/api/admin/homepage", async route => {
      if (route.request().method() !== "POST") return route.continue();
      submitted.push(homepageSaveRequestSchema.parse(route.request().postDataJSON()));
      if (submitted.length === 1) return route.abort("connectionreset");
      return route.continue();
    });
    try {
      const heading = await editHeading(page, marker);
      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      await expect(page.locator(".hp-error").filter({ visible: true })).toContainText("Your changes are still here");
      if (version === 1) await changeStoredMeaning(page, "legacy");
      await page.reload();
      await expect(heading).toContainText(marker);
      expect(submitted).toHaveLength(1);
      expect(receiptChecks).toBe(1);
      const response = page.waitForResponse(reply => reply.url().endsWith("/api/admin/homepage") && reply.request().method() === "POST");
      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      expect((await response).ok()).toBe(true);
      expect(submitted).toHaveLength(2);
      expect(submitted[1]).toEqual(submitted[0]);
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
}
