import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { USER_IDS } from "../tests/fixtures/entities";
import { openCoordinationProof } from "../tests/helpers/site-coordination-proof";
import { createPilotSiteCoordinator, pilotRuntimeContract, type PilotSiteResolution } from "./pilot-site-coordination";
import { installPilotProofGuard, proofGet } from "./pilot-proof-network";
import { observePilotProofPage } from "./pilot-proof-page";
import { withPilotProofProxy } from "./pilot-proof-proxy";
import { withOwnedPilotServers } from "./pilot-proof-servers";
import { verifyPilotSource } from "./pilot-source-package";

const releaseSchema = z.object({ directory: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const inputSchema = z.object({
  roots: z.object({ oldA: z.string(), newA: z.string(), newB: z.string(), oldPlatform: z.string() }).strict(),
  releaseA: releaseSchema, releaseB: releaseSchema,
}).strict();
const { values } = parseArgs({ options: { config: { type: "string" } } });
assert(values.config, "config is required");
const input = inputSchema.parse(JSON.parse(readFileSync(resolve(values.config), "utf8")));
const acceptedA = verifyPilotSource(input.releaseA.directory, input.releaseA.digest);
const acceptedB = verifyPilotSource(input.releaseB.directory, input.releaseB.digest);
assert.notEqual(acceptedA.digest, acceptedB.digest, "A and B must be different accepted releases");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Site = Awaited<ReturnType<typeof createPilotSiteCoordinator>>;
type Published = Extract<PilotSiteResolution, { kind: "published" }>;
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function published(site: Site, worker?: string): Promise<Published> {
  const selected = await site.resolve(worker);
  assert.equal(selected.kind, "published");
  if (selected.kind !== "published") throw new Error("Assigned renderer is unavailable");
  return selected;
}

async function localLogin(base: string, signal: AbortSignal): Promise<StorageState> {
  signal.throwIfAborted();
  const supabaseUrl = new URL(z.string().parse(process.env.SUPABASE_TEST_URL));
  assert.equal(supabaseUrl.origin, "http://127.0.0.1:54321", "Login requires synthetic loopback Supabase");
  const client = createClient(supabaseUrl.href, z.string().parse(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.admin.getUserById(USER_IDS.ownerAal2);
  if (error) throw new Error("Local proof owner lookup failed");
  assert(data.user.email, "Synthetic owner email is required");
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP pilot.localhost 127.0.0.1, EXCLUDE 127.0.0.1"] });
  const abort = () => { void browser.close(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.routeWebSocket("**/*", socket => socket.close());
    await context.route("**/*", route => {
      const target = new URL(route.request().url());
      return [base, supabaseUrl.origin].includes(target.origin) && !target.pathname.startsWith("/_vercel/insights/")
        ? route.continue() : route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    const response = await page.goto(`${base}/admin/login`);
    assert.equal(response?.status(), 200, "Synthetic pilot login page must resolve before authentication");
    await page.getByLabel("Email address", { exact: true }).fill(data.user.email);
    await page.getByRole("button", { name: "Send sign-in code" }).click();
    await page.getByRole("heading", { name: "Enter your code" }).waitFor();
    let code: string | undefined;
    for (let attempt = 0; attempt < 30 && !code; attempt++) {
      const inbox = z.object({ messages: z.array(z.object({ To: z.array(z.object({ Address: z.string() })), Subject: z.string() })) }).parse(await (await fetch("http://127.0.0.1:54324/api/v1/messages")).json());
      code = inbox.messages.find(message => message.To.some(recipient => recipient.Address === data.user.email))?.Subject.match(/^(\d{6})\b/)?.[1];
      if (!code) await page.waitForTimeout(100);
    }
    assert(code, "Local sign-in code not found");
    await page.getByLabel("Sign-in code", { exact: true }).fill(code);
    await page.waitForURL(url => url.origin === base && url.pathname === "/admin");
    return await context.storageState();
  } finally { signal.removeEventListener("abort", abort); await browser.close(); }
}

async function run() {
  mkdirSync(resolve("test-results"), { recursive: true });
  const output = mkdtempSync(resolve("test-results/pilot-site-coordination-"));
  const proof = await openCoordinationProof();
  let outcome: unknown;
  try {
    outcome = await withOwnedPilotServers(input.roots, async scope => {
      const coordinator = await proof.connection("service_role");
      const site = await createPilotSiteCoordinator(scope, coordinator, {
        schema: proof.schema, clubId: proof.clubId, actorId: USER_IDS.ownerAal2,
        releases: [{ ...input.releaseA, documentId: proof.documents.a }, { ...input.releaseB, documentId: proof.documents.b }],
        workers: [{ name: "old", releases: { [acceptedA.digest]: "oldA" } }, { name: "new", releases: { [acceptedA.digest]: "newA", [acceptedB.digest]: "newB" } }],
        currentPlatformSlot: "newB", runtime: pilotRuntimeContract(input.roots.newB),
      });
      assert.equal((await site.resolve()).kind, "missing");
      await assert.rejects(site.commit({}), /INVALID_ACTIVATION_PLAN/);
      let state = await site.snapshot();
      await site.replaceTraffic(state.generation, ["old", "new"]);
      const legacy = await site.activate({ expected: null, target: { legacy: proof.documents.legacy } });
      assert.equal((await site.resolve()).kind, "legacy");
      let current = await site.activate({ expected: legacy, target: acceptedA.digest });
      const firstA = current;
      const actor = await proof.connection("authenticated");
      const second = Number((await proof.db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
      await actor.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
      const before = (await actor.query("select onzio.load_homepage($1) as data", [proof.clubId])).rows[0].data;
      const original = { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision,
        sections: { hero: { intro: "Assignment coordination committed receipt" } } };
      const receipt = (await actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, original])).rows[0].data;
      const auth = await localLogin(scope.servers.oldA.origin, scope.signal);
      scope.signal.throwIfAborted();
      const origins = Object.values(scope.servers).map(server => server.origin);
      return withPilotProofProxy(origins, async proxy => {
        const browser = await chromium.launch({ proxy: { server: proxy.server, bypass: "" } });
        const abort = () => { void browser.close(); };
        scope.signal.addEventListener("abort", abort, { once: true });
        const captures: Awaited<ReturnType<typeof capture>>[] = [];
        const retainedChecks: unknown[] = [];
        const controlChecks = ["missing-and-explicit-legacy-resolution", "manufactured-plan-rejection"];
        const routeErrors: string[] = [];
        const section = {
          id: "coordinated-home-kit", club_id: proof.clubId, surface: "home", kit_variant: "home", eyebrow: "Club store", title: "Home kit pilot",
          description: "The current home kit.", bullet_points: ["Club crest", "Match fit"], store_note: "Available from the club store.",
          cta_label: "View home kit", cta_link: "/shop", updated_at: "2026-10-20T00:00:00Z",
        };
        const photos = ["/images/shop/rosecityshirt1.webp", "/images/shop/rosecityshirt2.jpeg"].map((url, index) => ({ id: String(index), surface: "home", kit_variant: "home", url, sort_order: index, created_at: section.updated_at }));
        async function context(width: number, storageState: StorageState | undefined = auth) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, storageState, reducedMotion: "reduce", serviceWorkers: "block", proxy: { server: proxy.server, bypass: "" } });
          await installPilotProofGuard(context, origins, proxy, section, photos, routeErrors);
          await context.route("**/*", async route => {
            if (route.request().isNavigationRequest() && route.request().resourceType() === "document"
              && !await site.documentAllowed(new URL(route.request().url()).origin)) {
              return route.fulfill({ status: 503, contentType: "text/plain", body: "Document participant is not admitted" });
            }
            return route.fallback();
          });
          return context;
        }
        async function capture(label: string, width: number, selected: Published, changed: boolean) {
          const session = await context(width);
          try {
            const page = await session.newPage();
            const finish = observePilotProofPage(page, photos.map(photo => photo.url));
            assert.equal((await page.goto(selected.document("/")))?.status(), 200);
            await expect(page.locator("main h1").first()).toBeVisible();
            const feature = page.locator("section").filter({ has: page.getByRole("heading", { name: section.title, exact: true }) });
            await expect(feature).toBeVisible();
            await expect.poll(() => feature.locator("img").evaluateAll(items => items.length === 2 && items.every(item => item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0))).toBe(true);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForLoadState("networkidle");
            await expect(page.locator("[data-pilot-mutation]")).toHaveCount(changed ? 1 : 0);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
            const publicState = await page.locator("main h1").first().evaluate(element => ({ text: element.textContent, color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
            await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
            const screenshots = [join(output, `${label}-${width}-public.png`), join(output, `${label}-${width}-kit.png`), join(output, `${label}-${width}-editor.png`)];
            await page.screenshot({ path: screenshots[0], animations: "disabled" });
            await feature.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
            await feature.screenshot({ path: screenshots[1], animations: "disabled" });
            const editor = await published(site, selected.worker);
            assert.equal(editor.event.id, selected.event.id);
            assert.equal((await page.goto(editor.document("/admin/homepage")))?.status(), 200);
            const frame = page.frameLocator('iframe[title="Homepage preview"]');
            const heading = frame.locator('[data-homepage-piece="hero.heading"]');
            await expect(heading).toBeVisible();
            await heading.focus(); await heading.press("Enter"); await expect(heading).toHaveAttribute("aria-pressed", "true");
            await heading.press("Space");
            const field = page.getByLabel("Line one", { exact: true });
            await expect(field).toBeFocused(); await field.fill("Coordinated draft rehearsal");
            await expect(heading).toContainText("Coordinated draft rehearsal");
            await frame.locator("html").evaluate(() => document.fonts.ready);
            const preview = await heading.evaluate(element => ({ text: element.textContent, color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize, width: element.ownerDocument.documentElement.clientWidth }));
            await page.screenshot({ path: screenshots[2], animations: "disabled" });
            await field.press("Escape");
            await expect(page.getByRole("dialog", { name: "Main heading", exact: true })).toHaveCount(0);
            await expect(heading).toBeFocused();
            const observation = await finish();
            const manifest = changed ? acceptedB.manifest : acceptedA.manifest;
            const retained = new Set(manifest.files.map(file => file.sha256));
            assert(observation.css.length > 0 && observation.css.every(value => retained.has(value)), "Assigned styles differ from accepted bytes");
            assert(observation.fonts.length >= 3 && observation.fonts.every(value => retained.has(value)), "Assigned fonts differ from accepted bytes");
            assert(photos.every(photo => retained.has(observation.images[photo.url])), "Assigned kit images differ from accepted bytes");
            return { label, width, event: selected.event.id, digest: selected.event.digest, worker: selected.worker, origin: selected.origin,
              public: publicState, preview, screenshots, ...observation };
          } finally { await session.close(); }
        }
        try {
          scope.signal.throwIfAborted();
          for (const width of [1440, 390]) {
            const selectedA = await published(site, width === 1440 ? "old" : "new");
            const retainedContext = await context(width);
            try {
              const oldPage = await retainedContext.newPage();
              const requested = new Set<string>();
              oldPage.on("request", request => requested.add(new URL(request.url()).pathname));
              const finishRetained = observePilotProofPage(oldPage, []);
              assert.equal((await oldPage.goto(selectedA.document("/")))?.status(), 200);
              await expect(oldPage.locator("main h1").first()).toBeVisible();
              await oldPage.evaluate(() => document.fonts.ready);
              const oldTypography = await oldPage.locator("main h1").first().evaluate(element => ({ color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }));
              const lateFont = acceptedA.manifest.files.find(file => file.path.startsWith("emitted/static/media/") && file.path.endsWith(".woff2") && !requested.has(`/_next/${file.path.slice(8)}`));
              assert(lateFont, "A previously unloaded A font is required");
              captures.push(await capture("a", width, selectedA, false));
              if (width === 1440) {
                await assert.rejects(site.prepare({ expected: current, target: acceptedB.digest }), /RELEASE_UNAVAILABLE/);
                state = await site.snapshot(); await site.replaceTraffic(state.generation, ["new"]);
                const stale = await site.prepare({ expected: current, target: acceptedB.digest });
                state = await site.snapshot(); await site.replaceTraffic(state.generation, ["old", "new"]);
                await assert.rejects(site.commit(stale), /FLEET_CHANGED/);
                assert.equal((await site.snapshot()).event?.id, current);
                state = await site.snapshot(); await site.replaceTraffic(state.generation, ["new"]);
                const denied = await context(width);
                try {
                  const page = await denied.newPage();
                  assert.equal((await page.goto(selectedA.document("/")))?.status(), 503);
                } finally { await denied.close(); }
                assert.equal((await site.resolve("old")).kind, "unavailable");
                controlChecks.push("partial-rollout-rejection", "stale-generation-rejection", "drained-document-denial");
              }
              current = await site.activate({ expected: current, target: acceptedB.digest });
              const selectedB = await published(site, "new");
              captures.push(await capture("b", width, selectedB, true));
              assert.deepEqual(await oldPage.locator("main h1").first().evaluate(element => ({ color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize })), oldTypography);
              const late = await oldPage.evaluate(async path => {
                const response = await fetch(path);
                return { status: response.status, bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
              }, `/_next/${lateFont.path.slice(8)}`);
              assert.equal(late.status, 200); assert.equal(hash(Buffer.from(late.bytes)), lateFont.sha256);
              assert.deepEqual((await actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, original])).rows[0].data, receipt);
              await assert.rejects(actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, { ...original, operationId: randomUUID(), expectedRevision: receipt.revision }]), error => error instanceof Error && error.message === "DESIGN_CHANGED");
              await assert.rejects(actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, { ...original, sections: { hero: { intro: "Reused operation must fail" } } }]), error => error instanceof Error && error.message === "OPERATION_REUSED");
              current = await site.activate({ expected: current, target: acceptedA.digest, action: "rollback" });
              assert.notEqual(current, firstA);
              assert.deepEqual((await actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, original])).rows[0].data, receipt);
              await assert.rejects(actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, { ...original, operationId: randomUUID(), expectedRevision: receipt.revision }]), error => error instanceof Error && error.message === "DESIGN_CHANGED");
              captures.push(await capture("rollback-a", width, await published(site, "new"), false));
              const observation = await finishRetained();
              retainedChecks.push({ width, originalOrigin: selectedA.origin, font: lateFont.path, sha256: lateFont.sha256, oldTypography, ...observation });
            } finally { await retainedContext.close(); }
          }
          for (const width of [1440, 390]) {
            const a = captures.find(item => item.label === "a" && item.width === width);
            const b = captures.find(item => item.label === "b" && item.width === width);
            const rollback = captures.find(item => item.label === "rollback-a" && item.width === width);
            assert(a && b && rollback);
            assert.deepEqual(rollback.public, a.public); assert.deepEqual(rollback.preview, a.preview);
            assert.deepEqual(rollback.fonts, a.fonts); assert.deepEqual(rollback.css, a.css); assert.deepEqual(rollback.images, a.images);
            assert.notDeepEqual(b.public, a.public); assert.notDeepEqual(b.fonts, a.fonts); assert.notDeepEqual(b.images, a.images);
            assert(readFileSync(rollback.screenshots[1]).equals(readFileSync(a.screenshots[1])), "Rollback kit PNG differs");
          }
          const anonymous = await browser.newContext({ proxy: { server: proxy.server, bypass: "" } });
          try {
            for (const name of ["oldA", "newA", "newB"] as const) {
              const denied = await proofGet(anonymous, proxy, `${scope.servers[name].origin}/api/admin/homepage`);
              assert.equal(denied.status(), 401);
              assert.equal(denied.headers()["x-pilot-platform-revision"], "current-platform-b");
            }
          } finally { await anonymous.close(); }
          assert.deepEqual(routeErrors, []);
          await assert.rejects(site.prepare({ expected: firstA, target: acceptedB.digest }), /ASSIGNMENT_CHANGED/);
          controlChecks.push("authored-ABA-fresh-save-denial", "original-committed-receipt-replay", "operation-reuse-rejection", "current-platform-denial");
          return { accepted: { a: acceptedA.digest, b: acceptedB.digest }, servers: scope.servers, runtime: pilotRuntimeContract(input.roots.newB), captures, retainedChecks, controlChecks, routeErrors,
            limits: ["Finite trusted local document guard, not hosted traffic or production dispatch.", "Old document origins retain assets; new document navigation is checked separately.", "All roots share the same canonical prepared dependency tree; installed dependency bytes and native ABI are not attested.", "Owned locks and pre/post verification do not establish continuous or hostile-filesystem immutability.", "Populated home-kit GET data is controlled; content saves use the unmodified SQL RPC on the disposable club.", "External media is blocked; no latency, LCP or native-device accessibility claim."] };
        } finally { scope.signal.removeEventListener("abort", abort); await browser.close(); }
      });
    }, { hostname: "pilot.localhost" });
  } finally { await proof.close(); }
  writeFileSync(join(output, "report.json"), `${JSON.stringify({ verdict: "PASS", ...z.record(z.string(), z.unknown()).parse(outcome) }, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: "PASS", report: join(output, "report.json") }));
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
