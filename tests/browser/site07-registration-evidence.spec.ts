import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { expect, test, type Page } from "@playwright/test";
import { parsePresentationDocument, templateKey } from "../../packages/presentation";

const evidenceDir = process.env.SITE07_REGISTRATION_EVIDENCE_DIR;
const baseUrl = process.env.SITE07_REGISTRATION_BASE_URL;
const headUrl = process.env.SITE07_REGISTRATION_HEAD_URL;
const baseSha = process.env.SITE07_REGISTRATION_BASE_SHA;
const headSha = process.env.SITE07_REGISTRATION_HEAD_SHA;
const databaseUrl = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!evidenceDir || !baseUrl || !headUrl || !baseSha || !headSha || !databaseUrl || !serviceKey) {
  throw new Error("Registration evidence requires an output folder, two loopback build URLs and SHAs, and local test database configuration.");
}
if (new URL(databaseUrl).hostname !== "127.0.0.1") throw new Error("Registration fixtures require loopback Supabase.");
const builds = [{ name: "base", sha: baseSha, origin: baseUrl }, { name: "head", sha: headSha, origin: headUrl }];
for (const build of builds) {
  const url = new URL(build.origin);
  if (url.protocol !== "http:" || url.hostname !== "alpha.localhost" || url.pathname !== "/") {
    throw new Error("Registration evidence accepts only the synthetic alpha.localhost HTTP origin.");
  }
}
const client = createClient(databaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
}).schema("onzio");
const clubId = "11111111-1111-4111-8111-111111111111";
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fixtureTables = ["club_stripe_connect", "registration_forms", "registration_form_fields", "registration_price_options", "registrations"] as const;
const viewports = [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }];

async function checkResult(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

async function snapshotRegistrationRows() {
  const rows: Record<string, unknown[]> = {};
  for (const table of fixtureTables) {
    const response = await client.from(table).select("*").eq("club_id", clubId);
    await checkResult(response);
    rows[table] = (response.data ?? []).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return rows;
}

async function registrationFixtures() {
  const club = await client.from("clubs").select("id,slug,kind").eq("id", clubId).single();
  await checkResult(club);
  expect(club.data).toEqual({ id: clubId, slug: "alpha", kind: "test" });
  const published = await client.from("presentation_state").select("published_document_id").eq("club_id", clubId).maybeSingle();
  await checkResult(published);
  let documentQuery = client.from("presentation_documents").select("configuration").eq("club_id", clubId);
  documentQuery = published.data?.published_document_id
    ? documentQuery.eq("id", published.data.published_document_id)
    : documentQuery.order("version", { ascending: false }).limit(1);
  const document = await documentQuery.maybeSingle();
  await checkResult(document);
  expect(templateKey(parsePresentationDocument(document.data?.configuration, { surface: "production" }).template), "the browser proof must exercise Academy dispatch").toBe("academy@1");
  const original = await snapshotRegistrationRows();
  const originalConnect = original.club_stripe_connect as Array<Record<string, unknown>>;
  if (originalConnect.some(row => row.environment !== "test")) {
    throw new Error("Registration browser fixtures cannot replace a non-test Connect row.");
  }
  const formId = randomUUID(), priceId = randomUUID();
  const slug = `site52-${formId.slice(0, 8)}`;
  const restore = async () => {
    for (const table of ["registrations", "registration_form_fields", "registration_price_options", "registration_forms"]) {
      await checkResult(await client.from(table).delete().eq("club_id", clubId).eq(table === "registration_forms" ? "id" : "form_id", formId));
    }
    await checkResult(await client.from("club_stripe_connect").delete().eq("club_id", clubId));
    if (originalConnect.length) await checkResult(await client.from("club_stripe_connect").insert(originalConnect));
    const restored = await snapshotRegistrationRows();
    expect(digest(JSON.stringify(restored)), "exact original registration, dependent, and Connect rows including timestamps").toBe(digest(JSON.stringify(original)));
  };
  try {
    await checkResult(await client.from("club_stripe_connect").upsert({ club_id: clubId,
      stripe_account_id: "acct_site52SyntheticTest", environment: "test", charges_enabled: true,
      details_submitted: true, payouts_enabled: true }));
    await checkResult(await client.from("registration_forms").insert({ id: formId, club_id: clubId, slug,
      title: "Academy registration evidence", description: "Synthetic local registration evidence.",
      status: "draft", participant_mode: "adult_only", waiver_text: "I accept the synthetic registration waiver." }));
    const fields = [
      ["registrant_name", "Registrant name", "name", "adult"],
      ["registrant_email", "Registrant email", "email", "adult"],
      ["registrant_phone", "Registrant phone", "phone", "adult"],
      ["emergency_contact_name", "Emergency contact name", "name", "all"],
      ["emergency_contact_phone", "Emergency contact phone", "phone", "all"],
      ["consent_signature", "Consent signature", "signature", "all"],
    ].map(([field_key, label, field_type, participant_scope], position) => ({
      id: randomUUID(), club_id: clubId, form_id: formId, field_key, label, field_type,
      participant_scope, position, is_core: field_key !== "consent_signature", required: true,
    }));
    await checkResult(await client.from("registration_form_fields").insert(fields));
    await checkResult(await client.from("registration_price_options").insert({ id: priceId, club_id: clubId, form_id: formId, label: "Synthetic player fee", amount_cents: 1250, position: 0, active: true }));
    await checkResult(await client.from("registration_forms").update({ status: "open" }).eq("club_id", clubId).eq("id", formId));
  } catch (error) {
    await restore();
    throw error;
  }
  return { formId, priceId, slug, restore };
}

async function fillRegistration(page: Page) {
  for (const [label, value] of [
    ["Registrant name", "Alex Evidence"], ["Registrant email", "alex@evidence.test"],
    ["Registrant phone", "555-0100"], ["Emergency contact name", "Pat Evidence"],
    ["Emergency contact phone", "555-0101"],
  ]) await page.getByLabel(label, { exact: false }).fill(value);
  const canvas = page.getByLabel("Signature drawing area");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Signature canvas is missing.");
  await page.mouse.move(bounds.x + 20, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 50, { steps: 5 });
  await page.mouse.move(bounds.x + 95, bounds.y + 25, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("checkbox", { name: "I accept the synthetic registration waiver." }).check();
}

test("registration, waiver, signature and test-payment browser transport remain equivalent", async ({ browser }) => {
  test.setTimeout(240_000);
  await mkdir(evidenceDir, { recursive: true });
  const fixture = await registrationFixtures();
  const records: Array<Record<string, unknown>> = [];
  type Resources = { fonts: { count: number; body: number; transfer: number }; restReads: Record<string, number> };
  const baseline = new Map<string, { markup: string; resources: Resources; screenshot: string }>();
  try {
    for (const build of builds) for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block", reducedMotion: "reduce" });
      const blocked: string[] = [], pageErrors: string[] = [], resourceErrors: string[] = [];
      const expectedStatusResponses: Array<{ status: number; path: string; token: string }> = [];
      const restReads: Record<string, number> = {};
      let submission: Record<string, unknown> | null = null;
      await context.routeWebSocket("**/*", socket => socket.close());
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === "checkout.stripe.test" && request.method() === "GET") {
          return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Synthetic Stripe test checkout destination</h1>" });
        }
        const loopback = url.hostname.endsWith(".localhost") || ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
        if (!loopback || !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      await context.route("**/_vercel/insights/script.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
      await context.route("**/api/register", async route => {
        expect(route.request().method()).toBe("POST");
        submission = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { checkoutUrl: "https://checkout.stripe.test/cs_test_site52" } });
      });
      await context.route("**/api/register/status?**", route => {
        const token = new URL(route.request().url()).searchParams.get("token");
        const status = token?.replace("site52-", "") ?? "unknown";
        return route.fulfill({ status: status === "unknown" ? 404 : 200, json: { status } });
      });
      const page = await context.newPage();
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("response", response => {
        if (response.status() < 400) return;
        const url = new URL(response.url());
        if (response.status() === 404 && url.pathname === "/api/register/status" && url.searchParams.get("token") === "site52-unknown") {
          expectedStatusResponses.push({ status: 404, path: url.pathname, token: "site52-unknown" });
        } else resourceErrors.push(`${response.status()} ${url.pathname}`);
      });
      page.on("requestfinished", request => {
        const table = new URL(request.url()).pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
        if (request.method() === "GET" && table) restReads[table] = (restReads[table] ?? 0) + 1;
      });
      const capture = async (state: string) => {
        await page.evaluate(() => document.fonts.ready);
        const content = await page.evaluate(() => ({
          markup: document.querySelector("main")?.outerHTML ?? "",
          dialog: document.querySelector('[role="dialog"]')?.outerHTML ?? "",
          fonts: performance.getEntriesByType("resource").filter((r): r is PerformanceResourceTiming => new URL(r.name).pathname.endsWith(".woff2")).reduce((total, r) => ({ count: total.count + 1, body: total.body + r.decodedBodySize, transfer: total.transfer + r.transferSize }), { count: 0, body: 0, transfer: 0 }),
        }));
        const markup = `${content.markup}${content.dialog}`.replaceAll(new URL(build.origin).origin, "http://alpha.localhost").replace(/headlessui-[^"\s]+/g, "headlessui-id");
        const resources = { fonts: content.fonts, restReads: { ...restReads } };
        const screenshotName = `${build.name}-${viewport.name}-${state}.jpg`;
        const screenshot = digest(await page.screenshot({ path: join(evidenceDir, screenshotName), type: "jpeg", quality: 62, fullPage: true, animations: "disabled" }));
        const key = `${viewport.name}-${state}`;
        if (build.name === "base") baseline.set(key, { markup: digest(markup), resources, screenshot });
        else {
          expect(digest(markup), `${key} markup`).toBe(baseline.get(key)?.markup);
          const expected = baseline.get(key)?.resources;
          expect(resources.restReads, `${key} resource reads`).toEqual(expected?.restReads);
          expect(resources.fonts.count, `${key} font count`).toBeLessThanOrEqual(expected?.fonts.count ?? 0);
          expect(resources.fonts.body, `${key} font bytes`).toBeLessThanOrEqual(expected?.fonts.body ?? 0);
          expect(resources.fonts.transfer, `${key} font transfer`).toBeLessThanOrEqual(expected?.fonts.transfer ?? 0);
          expect(screenshot, `${key} screenshot`).toBe(baseline.get(key)?.screenshot);
        }
        records.push({ build: build.name, sha: build.sha, viewport, state, markupSha256: digest(markup), resources, expectedStatusResponses: [...expectedStatusResponses], screenshot: screenshotName, screenshotSha256: screenshot });
      };
      const response = await page.goto(new URL(`/register/${fixture.slug}?checkout=cancelled`, build.origin).toString(), { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Academy registration evidence" })).toBeVisible();
      await expect(page.getByRole("status")).toHaveText("Checkout was cancelled. Your registration was not completed.");
      await capture("registration");
      await page.getByRole("button", { name: "Register now", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "Submit registration", exact: true })).toBeDisabled();
      await fillRegistration(page);
      await expect(page.getByRole("button", { name: "Submit registration", exact: true })).toBeEnabled();
      await capture("waiver-and-signature");
      await page.getByRole("button", { name: "Submit registration", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Synthetic Stripe test checkout destination" })).toBeVisible();
      const payload = submission as Record<string, unknown> | null;
      expect(payload).toMatchObject({ formSlug: fixture.slug, priceOptionId: fixture.priceId, participantType: "adult", waiverAccepted: true });
      expect(payload?.answers).toMatchObject({ registrant_name: "Alex Evidence", registrant_email: "alex@evidence.test", consent_signature: expect.stringMatching(/^data:image\/png;base64,/) });
      expect(Object.keys(payload ?? {}).sort()).toEqual(["answers", "formSlug", "participantType", "priceOptionId", "waiverAccepted"]);
      for (const [status, heading] of [
        ["pending", "Confirming registration"], ["paid", "Registration confirmed"],
        ["refunded", "Registration refunded"], ["expired", "Registration expired"],
        ["unknown", "Registration not found"], ["missing-token", "Registration not found"],
      ]) {
        const tokenQuery = status === "missing-token" ? "" : `?token=site52-${status}`;
        await page.goto(new URL(`/register/${fixture.slug}/confirmation${tokenQuery}`, build.origin).toString(), { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        await capture(`confirmation-${status}`);
      }
      await checkResult(await client.from("registration_forms").update({ status: "closed" }).eq("club_id", clubId).eq("id", fixture.formId));
      await page.goto(new URL(`/register/${fixture.slug}`, build.origin).toString(), { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Registration closed", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Register now", exact: true })).toHaveCount(0);
      await capture("registration-closed");
      await checkResult(await client.from("registration_forms").update({ status: "open" }).eq("club_id", clubId).eq("id", fixture.formId));
      expect(expectedStatusResponses).toEqual([{ status: 404, path: "/api/register/status", token: "site52-unknown" }]);
      expect(pageErrors).toEqual([]); expect(resourceErrors).toEqual([]); expect(blocked).toEqual([]);
      await context.close();
    }
  } finally {
    await fixture.restore();
  }
  await writeFile(join(evidenceDir, "registration-capture.json"), `${JSON.stringify({ builds: builds.map(({ name, sha }) => ({ name, sha })), records,
    limits: ["Synthetic Alpha test club only, loopback Supabase. Unique form fixtures are removed and the original test Connect row is restored. Exact original registration and dependent rows, including timestamps, are checked by hash.", "Registration submission response, Stripe test checkout destination, and paid status response are browser interceptions. No Stripe or email API is contacted.", "Real SQL ledger behavior is verified separately by the registration database suites; this browser proof does not establish hosted Checkout or webhook acceptance."],
  }, null, 2)}\n`);
});
