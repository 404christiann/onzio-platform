import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import {
  parsePresentationDocument,
  switchPresentationTemplate,
  type PresentationDocument,
  type TemplateId,
} from "@/packages/presentation";

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

const TEMPLATE_IDS: TemplateId[] = [
  "academy",
  "editorial",
  "clubhouse",
  "cinematic",
  "heritage",
];

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

async function publishFixture(
  db: Client,
  source: PresentationDocument,
  templateId: TemplateId,
  createdBy: string,
) {
  const switched = switchPresentationTemplate(source, { id: templateId, version: 1 });
  const id = randomUUID();
  const configuration = parsePresentationDocument(switched.document, { surface: "production" });
  const digest = createHash("sha256")
    .update(JSON.stringify(configuration))
    .digest("hex");
  const versionResult = await db.query(
    "select coalesce(max(version), 0) + 1 as version from onzio.presentation_documents where club_id = $1",
    [ALPHA_CLUB_ID],
  );
  const version = Number(versionResult.rows[0].version);
  await db.query(
    `insert into onzio.presentation_documents
      (id, club_id, version, schema_version, template_id, template_version,
       configuration, configuration_digest, created_by)
     values ($1, $2, $3, 1, $4, 1, $5::jsonb, $6, $7)`,
    [id, ALPHA_CLUB_ID, version, templateId, JSON.stringify(configuration), digest, createdBy],
  );
  await db.query(
    `update onzio.presentation_state
     set published_document_id = $1, updated_by = $2
     where club_id = $3`,
    [id, createdBy, ALPHA_CLUB_ID],
  );
  return { id, document: configuration };
}

const expectedPieces: Record<TemplateId, string[]> = {
  academy: [
    "hero.eyebrow", "hero.heading", "hero.intro", "hero.cta",
    "story.text", "story.cta",
  ],
  editorial: ["hero.heading", "hero.intro", "hero.cta", "photos"],
  clubhouse: ["hero.heading", "hero.intro", "hero.cta", "photos"],
  cinematic: ["hero.eyebrow", "hero.heading", "hero.intro", "hero.cta", "photos", "video"],
  heritage: ["hero.eyebrow", "hero.heading", "hero.intro", "hero.cta", "photos", "video"],
};

test("homepage editor mirrors each published template and keeps public pages unannotated", async ({ page }, info) => {
  test.setTimeout(120_000);
  expect(new URL(process.env.HOMEPAGE_BASE_URL ?? "http://alpha.localhost:3110").hostname).toBe("alpha.localhost");
  const db = localDb();
  await db.connect();
  try {
  const club = await db.query("select slug from onzio.clubs where id=$1", [ALPHA_CLUB_ID]);
  expect(club.rows[0]?.slug).toBe("alpha");
  const stateResult = await db.query<OriginalState & { configuration: PresentationDocument }>(
    `select s.draft_document_id, s.published_document_id, s.updated_by,
            d.configuration
       from onzio.presentation_state s
       left join onzio.presentation_documents d
         on d.club_id = s.club_id and d.id = s.published_document_id
      where s.club_id = $1`,
    [ALPHA_CLUB_ID],
  );
  const original = stateResult.rows[0];
  if (!original?.configuration) throw new Error("Alpha has no published presentation fixture.");
  assertSeededPresentation(original.published_document_id);
  const source = parsePresentationDocument(original.configuration, { surface: "production" });

  try {
    for (const templateId of TEMPLATE_IDS) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await publishFixture(db, source, templateId, original.updated_by);

      await page.goto("/admin/homepage");
      await expect(page.getByText("Preview · Changes appear on your website after you save.")).toBeVisible();
      const preview = page.frameLocator('iframe[title="Homepage preview"]');
      await expect(preview.locator("h1").first()).toBeVisible();
      await preview.locator("html").evaluate(async () => { await document.fonts.ready; });
      const frameWidth = await preview.locator("html").evaluate((element) => element.clientWidth);
      const headingText = await preview.locator("h1").first().textContent();
      const headingClass = await preview.locator("h1").first().getAttribute("class");
      const frameFont = await preview.locator("h1").first().evaluate((element) => getComputedStyle(element).fontFamily);
      expect(frameWidth).toBeGreaterThan(0);
      expect(frameFont).toBeTruthy();
      await page.screenshot({ path: info.outputPath(`${templateId}-editor.png`), fullPage: true });
      expect((await (await page.request.get("/api/admin/homepage")).json()).design.templateKey).toBe(`${templateId}@1`);

      for (const piece of expectedPieces[templateId]) {
        await expect(preview.locator(`[data-homepage-piece="${piece}"]`)).toHaveCount(1);
      }
      if (templateId === "academy") {
        await expect(preview.locator('[data-homepage-piece="photos"]')).toHaveCount(0);
        await expect(preview.locator('[data-homepage-piece="video"]')).toHaveCount(0);
      }
      if (templateId === "editorial" || templateId === "clubhouse") {
        await expect(preview.locator('[data-homepage-piece="hero.eyebrow"]')).toHaveCount(0);
      }
      if (templateId === "cinematic" || templateId === "heritage") {
        await expect(preview.locator('[data-homepage-piece="hero.eyebrow"]')).toHaveCount(1);
        await expect(preview.locator('[data-homepage-piece="video"]')).toHaveCount(1);
      }

      await page.setViewportSize({ width: frameWidth, height: 900 });
      await page.goto("/");
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; });
      expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(frameWidth);
      expect(await page.locator("h1").first().evaluate((element) => getComputedStyle(element).fontFamily)).toBe(frameFont);
      await expect(page.locator("[data-homepage-piece]")).toHaveCount(0);
      await expect(page.locator("h1").first()).toHaveText(headingText ?? "");
      expect(await page.locator("h1").first().getAttribute("class")).toBe(headingClass);
      await page.screenshot({ path: info.outputPath(`${templateId}-public.png`), fullPage: true });
    }
  } finally {
    await db.query(
      `update onzio.presentation_state
       set draft_document_id = $1, published_document_id = $2, updated_by = $3
       where club_id = $4`,
      [original.draft_document_id, original.published_document_id, original.updated_by, ALPHA_CLUB_ID],
    );
  }
  } finally { await db.end(); }
});

// Compare every rendered text block, link and image, beyond the original hero
// checks. Synthetic Alpha temporarily exercises the existing Rose City branch;
// this never connects to or copies data from the production tenant.
test("clean preview matches full public content and typography, including the legacy branch", async ({ page, context }, info) => {
  test.setTimeout(240_000);
  const db = localDb();
  await db.connect();
  const original = (await db.query<OriginalState & { configuration: PresentationDocument }>(
    `select s.draft_document_id,s.published_document_id,s.updated_by,d.configuration from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id where s.club_id=$1`, [ALPHA_CLUB_ID],
  )).rows[0];
  assertSeededPresentation(original.published_document_id);
  const publicPage = await context.newPage();
  const localCookies = await context.cookies("http://alpha.localhost:3110");
  await context.addCookies(localCookies.map(cookie => ({ ...cookie, domain: "rose-city.localhost" })));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await publicPage.emulateMedia({ reducedMotion: "reduce" });
  const signature = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,p,a,img,video")).map(element => {
    const style = getComputedStyle(element);
    // Compare layout positions rather than transient GSAP transforms. Public
    // entrance animations may remain at translateY(30px) until ScrollTrigger
    // refreshes; preview content is intentionally always visible.
    let x = 0, y = 0;
    for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop; }
    return { bounds: [x, y, element.offsetWidth, element.offsetHeight], tag: ["IMG", "VIDEO"].includes(element.tagName) ? "MEDIA" : element.tagName, text: element.textContent?.replace(/\s+/g, " ").trim(), href: element.getAttribute("href"), src: element.getAttribute("poster") ?? element.getAttribute("src"), alt: element.getAttribute("alt") ?? (element.tagName === "VIDEO" ? element.getAttribute("aria-label") : null), font: style.fontFamily, size: style.fontSize, weight: style.fontWeight, color: style.color };
  });
  try {
    for (const template of [...TEMPLATE_IDS, "legacy" as const]) {
      await db.query("update onzio.clubs set slug=$1 where id=$2", [template === "legacy" ? "rose-city" : "alpha", ALPHA_CLUB_ID]);
      await publishFixture(db, original.configuration, template === "legacy" ? "cinematic" : template, original.updated_by);
      const origin = template === "legacy" ? "http://rose-city.localhost:3110" : "http://alpha.localhost:3110";
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${origin}/admin/homepage`);
        const preview = page.frameLocator('iframe[title="Homepage preview"]');
        await expect(preview.locator(template === "legacy" ? "main section" : "h1").first()).toBeVisible();
        await page.getByRole("button", { name: "Playback preview", exact: true }).click();
        await expect(preview.locator("[data-homepage-piece]")).toHaveCount(0);
        const size = await preview.locator("html").evaluate(() => ({ width: innerWidth, height: innerHeight }));
        expect(await preview.locator("html").evaluate(() => document.compatMode)).toBe("CSS1Compat");
        await publicPage.setViewportSize(size);
        await publicPage.goto(`${origin}/`);
        await expect(publicPage.locator(template === "legacy" ? "main section" : "h1").first()).toBeVisible();
        await preview.locator("html").evaluate(async () => { await document.fonts.ready; });
        await publicPage.evaluate(async () => { await document.fonts.ready; });
        await expect(async () => {
          const contentOnly = (items: ReturnType<typeof signature>) => items.map(({ bounds, ...item }) => { void bounds; return item; });
          expect(contentOnly(await preview.locator("main").evaluate(signature))).toEqual(contentOnly(await publicPage.locator("main").evaluate(signature)));
        }).toPass({ timeout: 15000 });
        // Reveal public scroll-triggered sections before comparing their final
        // layout with the editor's always-visible content. Some legacy public
        // entrance animations predate reduced-motion handling.
        const reveal = async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(200, innerHeight / 2)) {
            scrollTo({ top: y, behavior: "instant" });
            await new Promise(resolve => setTimeout(resolve, 40));
          }
          scrollTo({ top: 0, behavior: "instant" });
          await new Promise(resolve => setTimeout(resolve, 1200));
        };
        await preview.locator("html").evaluate(reveal);
        await publicPage.evaluate(reveal);
        // Wait for both public data trees to settle rather than comparing only
        // server markup or excluding slower shared sections.
        await expect(async () => { expect(await preview.locator("main").evaluate(signature)).toEqual(await publicPage.locator("main").evaluate(signature)); }).toPass({ timeout: 15000 });
        const headerSignature = (element: HTMLElement) => ({ home: element.dataset.home, scrolled: element.dataset.scrolled, background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color, height: Math.round(element.getBoundingClientRect().height) });
        await expect(async () => { expect(await preview.locator("header").first().evaluate(headerSignature)).toEqual(await publicPage.locator("header").first().evaluate(headerSignature)); }).toPass({ timeout: 15000 });
        await expect(publicPage.locator("[data-homepage-piece]")).toHaveCount(0);
        await page.screenshot({ path: info.outputPath(`${template}-${width}-clean-editor.png`), fullPage: true });
        await publicPage.screenshot({ path: info.outputPath(`${template}-${width}-full-public.png`), fullPage: true });
      }
    }
  } finally {
    await db.query("update onzio.clubs set slug='alpha' where id=$1", [ALPHA_CLUB_ID]);
    await db.query("update onzio.presentation_state set draft_document_id=$1,published_document_id=$2,updated_by=$3 where club_id=$4", [original.draft_document_id, original.published_document_id, original.updated_by, ALPHA_CLUB_ID]);
    await publicPage.close(); await db.end();
  }
});
