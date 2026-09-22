import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import {
  parsePresentationDocument,
  switchPresentationTemplate,
  type PresentationDocument,
} from "@/packages/presentation";

// Clubhouse is used (rather than the default academy fixture) because its
// shared "shared.story" shortcut renders unconditionally; academy's shared
// shop/programs pieces depend on home-surface content Alpha's fixture does
// not currently populate, per the existing template matrix spec.
const ALPHA_CLUB_ID = "11111111-1111-4111-8111-111111111111";
/** seed.sql publishes exactly this Academy document for Alpha. Every spec here
 * republishes Alpha's presentation fixture and restores it in `finally`, but a
 * crashed or interrupted run cannot reach that `finally` — and because each run
 * captures "whatever is published now" as its baseline, a leak then becomes the
 * new baseline and stays forever. Fail loudly instead of inheriting it. */
const ALPHA_SEEDED_PRESENTATION_ID = "88888888-8888-4888-8888-888888888804";

function assertSeededPresentation(publishedDocumentId: string | null) {
  if (publishedDocumentId !== ALPHA_SEEDED_PRESENTATION_ID) {
    throw new Error(
      `Alpha's published presentation fixture is ${publishedDocumentId}, not the seeded ` +
      `${ALPHA_SEEDED_PRESENTATION_ID}. An earlier browser run was interrupted before it ` +
      "restored the fixture. Run `npm run fixture:homepage:restore:local` first.",
    );
  }
}


type OriginalState = {
  draft_document_id: string | null;
  published_document_id: string | null;
  updated_by: string;
};

const localDb = () => new Client({
  host: "127.0.0.1",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

async function readOriginalState(db: Client): Promise<OriginalState & { configuration: PresentationDocument }> {
  const stateResult = await db.query<OriginalState & { configuration: PresentationDocument }>(
    `select s.draft_document_id, s.published_document_id, s.updated_by, d.configuration
       from onzio.presentation_state s
       left join onzio.presentation_documents d
         on d.club_id = s.club_id and d.id = s.published_document_id
      where s.club_id = $1`,
    [ALPHA_CLUB_ID],
  );
  const original = stateResult.rows[0];
  if (!original?.configuration) throw new Error("Alpha has no published presentation fixture.");
  assertSeededPresentation(original.published_document_id);
  return original;
}

async function publishClubhouse(db: Client, source: PresentationDocument, createdBy: string) {
  const switched = switchPresentationTemplate(source, { id: "clubhouse", version: 1 });
  const id = randomUUID();
  const configuration = parsePresentationDocument(switched.document, { surface: "production" });
  const digest = createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
  const versionResult = await db.query(
    "select coalesce(max(version), 0) + 1 as version from onzio.presentation_documents where club_id = $1",
    [ALPHA_CLUB_ID],
  );
  const version = Number(versionResult.rows[0].version);
  await db.query(
    `insert into onzio.presentation_documents
      (id, club_id, version, schema_version, template_id, template_version,
       configuration, configuration_digest, created_by)
     values ($1, $2, $3, 1, 'clubhouse', 1, $4::jsonb, $5, $6)`,
    [id, ALPHA_CLUB_ID, version, JSON.stringify(configuration), digest, createdBy],
  );
  await db.query(
    `update onzio.presentation_state
     set published_document_id = $1, updated_by = $2
     where club_id = $3`,
    [id, createdBy, ALPHA_CLUB_ID],
  );
}

async function restoreTemplate(db: Client, original: OriginalState) {
  await db.query(
    `update onzio.presentation_state
     set draft_document_id = $1, published_document_id = $2, updated_by = $3
     where club_id = $4`,
    [original.draft_document_id, original.published_document_id, original.updated_by, ALPHA_CLUB_ID],
  );
}

test.describe("homepage editor local draft recovery", () => {
  test("an unsaved draft survives a reload, and Leave without saving discards it", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    // A fixed marker cannot be re-typed once a crashed run leaves it behind:
    // the field would already hold it, nothing would be dirty, and Save would
    // stay disabled forever. Keep every assertion, make the value unique.
    const marker = `Saved, not recovered ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await publishClubhouse(db, source, original.updated_by);
      const baseline = await (await page.request.get("/api/admin/homepage")).json();
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const heading = frame.locator('[data-homepage-piece="hero.heading"]');
      await heading.click();
      await heading.click();
      await page.getByLabel("Line one", { exact: true }).fill("Recovered after reload");
      await expect(page.getByRole("status").filter({ hasText: "Not saved yet" })).toBeVisible();

      // Recovery is written on a 500ms debounce; give it time to land before reloading.
      await page.waitForTimeout(900);
      await page.reload();
      await expect(page.getByText("Restored an unsaved draft from before.", { exact: false })).toBeVisible();
      await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText("Recovered after reload");
      const stillUnsaved = await (await page.request.get("/api/admin/homepage")).json();
      expect(stillUnsaved.content.hero).toEqual(baseline.content.hero);

      // Shared content left the editing canvas; the editor's explicit shortcut
      // is now what raises the unsaved-changes guard.
      await page.getByRole("button", { name: "Edit in About" }).filter({ visible: true }).click();
      await page.getByRole("button", { name: "Leave without saving" }).click();
      await expect(page).toHaveURL(/\/admin\/about$/);

      await page.goto("/admin/homepage");
      await expect(page.getByText("Restored an unsaved draft from before.", { exact: false })).toHaveCount(0);
      await expect(frame.locator('[data-homepage-piece="hero.heading"]')).not.toContainText("Recovered after reload");
      const afterDiscard = await (await page.request.get("/api/admin/homepage")).json();
      expect(afterDiscard.content.hero).toEqual(baseline.content.hero);
    } finally {
      const current = await (await page.request.get("/api/admin/homepage")).json();
      if (current.content.hero.headline_line_one === "Recovered after reload") {
        // Clubhouse does not expose "eyebrow" as an editable hero field;
        // resubmitting it here is rejected with FIELD_UNAVAILABLE.
        const { eyebrow: _eyebrow, ...restorableHero } = current.content.hero;
        const restore = await page.request.post("/api/admin/homepage", { data: { operationId: crypto.randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { hero: { ...restorableHero, headline_line_one: "" } } } });
        if (!restore.ok()) throw new Error(`Failed to restore Alpha's hero content: ${await restore.text()}`);
      }
      await restoreTemplate(db, original);
      await db.end();
    }
  });

  test("a save clears the recovery draft so a later reload finds nothing to restore", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    // A fixed marker cannot be re-typed once a crashed run leaves it behind:
    // the field would already hold it, nothing would be dirty, and Save would
    // stay disabled forever. Keep every assertion, make the value unique.
    const marker = `Saved, not recovered ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await publishClubhouse(db, source, original.updated_by);
      const baseline = await (await page.request.get("/api/admin/homepage")).json();
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const heading = frame.locator('[data-homepage-piece="hero.heading"]');
      await heading.click();
      await heading.click();
      await page.getByLabel("Line one", { exact: true }).fill(marker);
      await page.waitForTimeout(900);
      await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      await expect(page.getByText("Saved. Your homepage is updated.", { exact: true })).toBeVisible();

      await page.reload();
      await expect(page.getByText("Restored an unsaved draft from before.", { exact: false })).toHaveCount(0);
      await expect(frame.locator('[data-homepage-piece="hero.heading"]')).toContainText(marker);
    } finally {
      const current = await (await page.request.get("/api/admin/homepage")).json();
      if (current.content.hero.headline_line_one === marker) {
        const { eyebrow: _eyebrow, ...restorableHero } = current.content.hero;
        const restore = await page.request.post("/api/admin/homepage", { data: { operationId: crypto.randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { hero: { ...restorableHero, headline_line_one: "" } } } });
        if (!restore.ok()) throw new Error(`Failed to restore Alpha's hero content: ${await restore.text()}`);
      }
      await restoreTemplate(db, original);
      await db.end();
    }
  });
});
