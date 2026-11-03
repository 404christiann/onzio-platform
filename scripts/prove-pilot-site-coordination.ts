import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, expect, type BrowserContext, type Request } from "@playwright/test";
import sharp from "sharp";
import { z } from "zod";
import { USER_IDS } from "../tests/fixtures/entities";
import { openCoordinationProof } from "../tests/helpers/site-coordination-proof";
import { createPilotSiteCoordinator, pilotRuntimeContract, type PilotSiteResolution } from "./pilot-site-coordination";
import { installAcademyProofGuard, proofGet, type AcademyProofNetworkObservations } from "./pilot-proof-network";
import { observePilotProofPage } from "./pilot-proof-page";
import { withPilotProofProxy } from "./pilot-proof-proxy";
import { withOwnedPilotServers } from "./pilot-proof-servers";
import { localPilotProofLogin } from "./pilot-proof-login";
import { academyProofDocuments, assertAcademyProofCoverage, type AcademyProofDocumentCase } from "./pilot-academy-documents";
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

async function run() {
  mkdirSync(resolve("test-results"), { recursive: true });
  const output = mkdtempSync(resolve("test-results/pilot-site-coordination-"));
  const proof = await openCoordinationProof();
  let outcome: unknown;
  let primaryFailure: { error: unknown } | null = null;
  try {
    const documentParameters = await proof.populateAcademy();
    const documents = academyProofDocuments(documentParameters);
    outcome = await withOwnedPilotServers(input.roots, async scope => {
      const coordinator = await proof.connection("service_role");
      const site = await createPilotSiteCoordinator(scope, coordinator, {
        schema: proof.schema, clubId: proof.clubId, actorId: USER_IDS.ownerAal2, documentParameters,
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
      const auth = await localPilotProofLogin(scope.servers.oldA.origin, scope.signal);
      scope.signal.throwIfAborted();
      const origins = Object.values(scope.servers).map(server => server.origin);
      return withPilotProofProxy(origins, async proxy => {
        const browser = await chromium.launch({ args: ["--disable-gpu", "--force-color-profile=srgb"], proxy: { server: proxy.server, bypass: "" } });
        const abort = () => { void browser.close(); };
        scope.signal.addEventListener("abort", abort, { once: true });
        const captures: Awaited<ReturnType<typeof capture>>[] = [];
        const retainedChecks: unknown[] = [];
        const controlChecks = ["missing-and-explicit-legacy-resolution", "manufactured-plan-rejection"];
        const routeErrors: string[] = [];
        const excludedResources: string[] = [];
        const section = {
          id: "coordinated-home-kit", club_id: proof.clubId, surface: "home", kit_variant: "home", eyebrow: "Club store", title: "Home kit pilot",
          description: "The current home kit.", bullet_points: ["Club crest", "Match fit"], store_note: "Available from the club store.",
          cta_label: "View home kit", cta_link: "/shop", updated_at: "2026-10-20T00:00:00Z",
        };
        const photos = ["/images/shop/rosecityshirt1.webp", "/images/shop/rosecityshirt2.jpeg"].map((url, index) => ({ id: String(index), surface: "home", kit_variant: "home", url, sort_order: index, created_at: section.updated_at }));
        const networkTraces = new WeakMap<BrowserContext, AcademyProofNetworkObservations>();
        async function context(width: number, storageState: StorageState | undefined = auth) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, storageState, reducedMotion: "reduce", serviceWorkers: "block", proxy: { server: proxy.server, bypass: "" } });
          const observations: AcademyProofNetworkObservations = { errors: routeErrors, excludedResources, forwardedDocuments: [], redirects: [] };
          networkTraces.set(context, observations);
          await installAcademyProofGuard(context, origins, proxy, { clubId: proof.clubId, documentAllowed: origin => site.documentAllowed(origin) }, observations);
          return context;
        }
        async function captureHome(label: string, width: number, selected: Published, changed: boolean) {
          const session = await context(width);
          try {
            const page = await session.newPage();
            const finish = observePilotProofPage(page, photos.map(photo => photo.url));
            assert.equal((await page.goto(selected.document({ kind: "public", route: "home" })))?.status(), 200);
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
            assert.equal((await page.goto(editor.document({ kind: "preview", preview: "homepage" })))?.status(), 200);
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
        const latestIntro = "Latest club content saved while release B is active";
        async function captureDocument(label: string, width: number, selected: Published, item: AcademyProofDocumentCase) {
          const session = await context(width);
          try {
            let page = await session.newPage();
            const staffRedirect = item.document.kind === "public" && item.document.route === "staff";
            let finish = staffRedirect ? null : observePilotProofPage(page, photos.map(photo => photo.url));
            const reads: Record<string, number> = {};
            const countReads = (request: Request) => {
              const target = new URL(request.url());
              if (target.pathname.startsWith("/rest/v1/") || target.pathname.startsWith("/api/")) {
                const key = `${request.method()} ${target.pathname}`;
                reads[key] = (reads[key] ?? 0) + 1;
              }
            };
            const watchRequests = () => {
              page.on("request", countReads);
            };
            watchRequests();
            const response = await page.goto(selected.document(item.document));
            assert.equal(response?.status(), 200, `${item.id} did not render successfully`);
            if (staffRedirect) {
              await page.waitForURL(url => url.pathname === "/roster" && url.hash === "#staff");
              assert.equal(new URL(page.url()).pathname, "/roster");
              assert.equal(new URL(page.url()).hash, "#staff");
              const destination = page.url();
              await page.waitForLoadState("networkidle");
              await page.close();
              page = await session.newPage();
              finish = observePilotProofPage(page, photos.map(photo => photo.url));
              watchRequests();
              const settled = await page.goto(destination);
              assert.equal(settled?.status(), 200, "Staff destination did not render successfully");
              assert.equal(new URL(page.url()).pathname, "/roster");
              assert.equal(new URL(page.url()).hash, "#staff");
            }
            if (item.document.kind === "preview") {
              if (item.action && ["programs", "programDetail"].includes(item.document.preview)) {
                const navigation = page.getByRole("navigation", { name: "Program pages", exact: true });
                await expect(navigation).toBeVisible();
                await expect(page.frameLocator('iframe[title$="/programs preview"]').locator("body")).toBeVisible();
                const phoneChooser = navigation.locator("details.program-editor-navigation-phone");
                const phoneVisible = await phoneChooser.isVisible();
                if (phoneVisible) await phoneChooser.locator("summary").click();
                const controls = phoneVisible ? phoneChooser : navigation.locator(".program-editor-navigation-desktop");
                await controls.getByRole("button", { name: item.action, exact: false }).click();
                if (phoneVisible && await phoneChooser.getAttribute("open") !== null) await phoneChooser.locator("summary").click();
              } else if (item.action) {
                const action = page.getByRole("button", { name: item.action, exact: false }).first();
                await action.click();
                if (["preview.shop", "preview.homeKit"].includes(item.id)) await expect(action).toHaveAttribute("aria-current", "page");
              }
              const device = page.getByRole("button", { name: width === 390 ? "Phone" : "Desktop", exact: true });
              if (await device.count()) await device.first().click();
            }
            const ready = item.frame
              ? page.frameLocator(`iframe[title$=${JSON.stringify(item.frame)}]`).locator("body")
              : page.locator(item.selector).first();
            await expect(ready).toBeVisible({ timeout: 30_000 });
            const content = item.document.kind === "public" ? page.locator("main").first() : ready;
            if (item.text) await expect(content).toContainText(item.text, { ignoreCase: true, timeout: 30_000 });
            if (item.id === "public.sponsors" || item.id === "preview.sponsorsCarousel") await expect(content.getByRole("img", { name: "Proof Sponsor", exact: true }).first()).toBeVisible({ timeout: 30_000 });
            if (item.document.kind === "preview") {
              await expect.poll(async () => (await content.innerText()).trim().length, { timeout: 30_000 }).toBeGreaterThan(10);
              if (["preview.shop", "preview.homeKit"].includes(item.id)) {
                await expect(content).toContainText("Home kit pilot", { timeout: 30_000 });
                const kitPhotos = content.locator('[data-shop-editor-target="photos"] img');
                await expect(kitPhotos).toHaveCount(2, { timeout: 30_000 });
                await kitPhotos.evaluateAll(async images => {
                  await Promise.all(images.map(async image => {
                    if (!(image instanceof HTMLImageElement)) throw new Error("Shop preview photo is not an image");
                    await image.decode();
                    if (!image.naturalWidth) throw new Error("Shop preview photo did not decode");
                  }));
                });
                await expect.poll(async () => {
                  const painted = await Promise.all([0, 1].map(async index => {
                    const image = await kitPhotos.nth(index).screenshot({ animations: "disabled" });
                    const stats = await sharp(image).stats();
                    return Math.max(...stats.channels.slice(0, 3).map((channel: { stdev: number }) => channel.stdev)) > 35;
                  }));
                  return painted.every(Boolean);
                }, { timeout: 20_000, intervals: [250] }).toBe(true);
              }
            }
            if (label === "rollback-a" && ["public.home", "preview.homepage"].includes(item.id)) await expect(content).toContainText(latestIntro);
            await content.evaluate(async element => {
              await element.ownerDocument.fonts.ready;
              for (const image of Array.from(element.querySelectorAll("img"))) {
                if (!image.complete) await new Promise<void>((resolve, reject) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => reject(new Error("Proof image failed")), { once: true }); });
                if (!image.naturalWidth) throw new Error("Proof image has no decoded content");
                await image.decode();
              }
              const animations = element.ownerDocument.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
              await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
            });
            assert(finish, "Document observer was not installed");
            await finish.waitForIdle();
            if (item.document.kind === "public") {
              await page.evaluate(async () => {
                for (let offset = 0; offset < document.documentElement.scrollHeight; offset += window.innerHeight * 0.75) {
                  window.scrollTo({ top: offset, behavior: "instant" });
                  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
                }
                window.scrollTo({ top: 0, behavior: "instant" });
              });
            }
            await content.scrollIntoViewIfNeeded();
            const settlingStarted = Date.now();
            let previousStyles = "", stableSince = Date.now();
            await expect.poll(async () => {
              const styles = await content.evaluate(element => JSON.stringify(Array.from(element.querySelectorAll<HTMLElement>("[style]"))
                .filter(node => node.style.opacity || node.style.transform)
                .map(node => [getComputedStyle(node).opacity, getComputedStyle(node).transform])));
              if (styles !== previousStyles) { previousStyles = styles; stableSince = Date.now(); }
              return Date.now() - settlingStarted >= 1500 && Date.now() - stableSince >= 300;
            }, { timeout: 10_000, intervals: [100] }).toBe(true);
            await page.mouse.move(0, 0);
            await content.evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView?.requestAnimationFrame(() => element.ownerDocument.defaultView?.requestAnimationFrame(() => resolve()))));
            if (item.document.kind === "public") {
              for (const image of [
                page.locator('header nav a[aria-label$=" Home"] img').first(),
                ...["US Soccer", "FIFA", "UPSL"].map(name => page.locator(`header nav img[alt=${JSON.stringify(name)}]`)),
              ]) {
                await expect(image).toBeVisible({ timeout: 30_000 });
                await image.evaluate(async element => { await (element as HTMLImageElement).decode(); });
                await expect.poll(async () => {
                  const screenshot = await image.screenshot({ animations: "disabled" });
                  const stats = await sharp(screenshot).stats();
                  return Math.max(...stats.channels.map((channel: { stdev: number }) => channel.stdev)) > 15;
                }, { timeout: 20_000, intervals: [250] }).toBe(true);
              }
            }
            if (item.id === "preview.sponsorsCarousel") {
              const editorLogo = page.getByRole("button", { name: "Remove sponsor logo 1" }).locator("xpath=..").locator("img");
              await expect(editorLogo).toBeVisible();
              await editorLogo.evaluate(async image => {
                await (image as HTMLImageElement).decode();
                await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
              });
            }
            const state = await content.evaluate(element => ({ text: element.textContent, markup: element.outerHTML,
              links: Array.from(element.querySelectorAll("a[href]")).map(link => [link.textContent, link.getAttribute("href")]),
              headings: Array.from(element.querySelectorAll("h1,h2,h3")).map(heading => ({ text: heading.textContent, font: getComputedStyle(heading).fontFamily, color: getComputedStyle(heading).color, size: getComputedStyle(heading).fontSize })) }));
            const screenshot = join(output, `${label}-${width}-${item.id}.png`);
            if (item.id === "preview.homeKit") {
              await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
              const photos = content.locator('[data-shop-editor-target="photos"]');
              const box = await photos.boundingBox();
              assert(box, "Home kit photo panel has no visible bounds");
              const region = {
                left: Math.floor(box.x + box.width * 0.6),
                top: Math.floor(box.y + box.height * 0.1),
                width: Math.floor(box.width * 0.35),
                height: Math.floor(box.height * 0.6),
              };
              let painted = false;
              let previous: Buffer | null = null;
              for (let attempt = 0; attempt < 30; attempt++) {
                const current = await page.screenshot({ fullPage: true, animations: "disabled" });
                const stats = await sharp(current).extract(region).stats();
                const secondJerseyVisible = Math.max(...stats.channels.slice(0, 3).map((channel: { stdev: number }) => channel.stdev)) > 35;
                if (secondJerseyVisible && previous?.equals(current)) {
                  writeFileSync(screenshot, current);
                  painted = true;
                  break;
                }
                previous = secondJerseyVisible ? current : null;
                await page.waitForTimeout(250);
              }
              assert(painted, "Home kit preview did not show the second jersey in two identical frames");
            } else if (item.id === "preview.sponsorsCarousel") {
              let previous = await page.screenshot({ fullPage: true, animations: "disabled" });
              let stable = false;
              for (let attempt = 0; attempt < 5; attempt++) {
                await content.evaluate(element => new Promise<void>(resolve => element.ownerDocument.defaultView?.requestAnimationFrame(() => element.ownerDocument.defaultView?.requestAnimationFrame(() => resolve()))));
                const current = await page.screenshot({ fullPage: true, animations: "disabled" });
                if (current.equals(previous)) { writeFileSync(screenshot, current); stable = true; break; }
                previous = current;
              }
              assert(stable, "Sponsors editor screenshot did not settle to identical frames");
            } else await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
            assert(finish, "Document observer was not installed");
            const observation = await finish();
            const manifest = selected.event.digest === acceptedA.digest ? acceptedA.manifest : acceptedB.manifest;
            const retained = new Set(manifest.files.map(file => file.sha256));
            assert(observation.css.length > 0 && observation.css.every(value => retained.has(value)), `${item.id} styles differ from accepted bytes`);
            assert(observation.fonts.length > 0 && observation.fonts.every(value => retained.has(value)), `${item.id} fonts differ from accepted bytes`);
            if (item.document.kind === "public" && ["rosterPlayer", "scheduleFixture", "stats"].includes(item.document.route)) {
              assert(!Object.keys(reads).some(key => /\/(players|matches|player_match_stats|goalkeeper_match_stats)(?:$|[?])/.test(key)), `${item.id} made a detail-specific read`);
            }
            return { id: item.id, document: item.document, path: item.path.replace(/token=[^&]+/, "token=<owned-synthetic-token>"),
              screenshot, screenshotSha256: hash(readFileSync(screenshot)), markupSha256: hash(Buffer.from(state.markup)),
              text: state.text, links: state.links, headings: state.headings, browserReads: reads, redirects: networkTraces.get(session)?.redirects, ...observation };
          } finally { await session.close(); }
        }
        async function capture(label: string, width: number, selected: Published, changed: boolean) {
          const home = await captureHome(label, width, selected, changed);
          const documentCaptures = [];
          for (const item of documents) documentCaptures.push(await captureDocument(label, width, selected, item));
          assertAcademyProofCoverage(documentCaptures.map(item => item.id));
          return { ...home, documents: documentCaptures };
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
              assert.equal((await oldPage.goto(selectedA.document({ kind: "public", route: "home" })))?.status(), 200);
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
                  assert.equal((await page.goto(selectedA.document({ kind: "public", route: "home" })))?.status(), 503);
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
              const latest = (await actor.query("select onzio.load_homepage($1) as data", [proof.clubId])).rows[0].data;
              await actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, { operationId: randomUUID(), expectedRevision: latest.revision, designRevision: latest.designRevision, sections: { hero: { intro: latestIntro } } }]);
              const beforeRollback = await proof.checkpoint();
              const assignmentBeforeRollback = await proof.assignmentAuthority();
              current = await site.activate({ expected: current, target: acceptedA.digest, action: "rollback" });
              await proof.assertPreserved(beforeRollback);
              const assignmentAfterRollback = await proof.assignmentAuthority();
              assert.equal(assignmentAfterRollback.state.pointer, proof.documents.a);
              assert.equal(assignmentAfterRollback.state.event?.id, current);
              assert.equal(assignmentAfterRollback.state.event?.previousId, assignmentBeforeRollback.state.event?.id);
              assert.notEqual(assignmentAfterRollback.epoch, assignmentBeforeRollback.epoch);
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
            for (const original of a.documents) {
              const restored: Awaited<ReturnType<typeof captureDocument>> | undefined = rollback.documents.find(item => item.id === original.id);
              assert(restored, `Rollback capture missing ${original.id}`);
              assert.deepEqual(restored.fonts, original.fonts, `${original.id} rollback font bytes differ`);
              assert.deepEqual(restored.css, original.css, `${original.id} rollback stylesheet bytes differ`);
              assert.deepEqual(restored.images, original.images, `${original.id} rollback image bytes differ`);
              if (["public.home", "preview.homepage"].includes(original.id)) {
                assert(restored.text?.includes(latestIntro), "Rollback lost latest homepage content");
                assert.deepEqual(restored.headings, original.headings, "A homepage heading styles did not restore");
              } else {
                assert.equal(restored.screenshotSha256, original.screenshotSha256, `${original.id} rollback screenshot differs`);
                assert.deepEqual(restored.links, original.links, `${original.id} rollback links differ`);
                assert.deepEqual(restored.browserReads, original.browserReads, `${original.id} rollback reads differ`);
              }
            }
          }
          const valid = await published(site, "new");
          const beforeInvalidAssignment = await proof.checkpoint();
          const restoreAssignment = await proof.invalidAssignment();
          const invalidCaptures = [];
          try {
            assert.equal((await site.resolve()).kind, "invalid");
            assert.equal(await site.documentAllowed(valid.origin), false);
            for (const width of [1440, 390]) {
              const denied = await context(width);
              try {
                const page = await denied.newPage();
                const response = await page.goto(valid.document({ kind: "public", route: "home" }));
                assert.equal(response?.status(), 503);
                await expect(page.locator("body")).toHaveText("Assignment unavailable. Document participant is not admitted.");
                await expect(page.locator("main,header,footer,[data-pilot-mutation]")).toHaveCount(0);
                assert.deepEqual(networkTraces.get(denied)?.forwardedDocuments, [], "Invalid assignment forwarded a document or fallback");
                const screenshot = join(output, `invalid-assignment-${width}.png`);
                await page.screenshot({ path: screenshot, fullPage: true });
                invalidCaptures.push({ width, screenshot, screenshotSha256: hash(readFileSync(screenshot)), status: response?.status() });
              } finally { await denied.close(); }
            }
          } finally { await restoreAssignment(); }
          assert.equal((await site.resolve()).kind, "published");
          await proof.assertPreserved(beforeInvalidAssignment);
          controlChecks.push("full-route-and-mounted-preview-coverage", "latest-content-billing-schema-rollback-preservation", "visible-invalid-assignment-denial");
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
          return { accepted: { a: acceptedA.digest, b: acceptedB.digest }, servers: scope.servers, runtime: pilotRuntimeContract(input.roots.newB), captures, invalidCaptures, retainedChecks, controlChecks, routeErrors, excludedResources: [...new Set(excludedResources)].sort(),
            fixture: { clubId: proof.clubId, recoveryFile: proof.recoveryFile, requiredDocuments: documents.map(item => item.id) },
            limits: ["Finite trusted local document guard, not hosted traffic or production dispatch.", "Old document origins retain assets; new document navigation is checked separately.", "All roots share the same canonical prepared dependency tree; installed dependency bytes and native ABI are not attested.", "Owned locks and pre/post verification do not establish continuous or hostile-filesystem immutability.", "All page data and confirmation ledger state are synthetic rows owned by the disposable club; content saves use existing SQL RPCs. No provider transport is exercised.", "Homepage and its mounted preview deliberately show the latest B-era content after rollback; their A visual styles/assets restore while unaffected captures match byte-for-byte.", "The binding contract is still homepage-only; no transition between distinct full-site binding revisions is claimed.", "External media is blocked; no latency, LCP or native-device accessibility claim."] };
        } finally { scope.signal.removeEventListener("abort", abort); await browser.close(); }
      });
    }, { hostname: "pilot.localhost" });
  } catch (error) { primaryFailure = { error }; throw error; }
  finally {
    try { await proof.close(); } catch (cleanupError) {
      if (primaryFailure !== null) throw new AggregateError([primaryFailure.error, cleanupError], "Academy proof and cleanup failed");
      throw cleanupError;
    }
  }
  writeFileSync(join(output, "report.json"), `${JSON.stringify({ verdict: "PASS", ...z.record(z.string(), z.unknown()).parse(outcome) }, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: "PASS", report: join(output, "report.json") }));
}

void run().catch(error => { console.error(error); process.exitCode = 1; });
