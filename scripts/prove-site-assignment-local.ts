import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { artifactDigest, openProof, releaseIds, renderRelease, type Proof } from "../tests/helpers/site-assignment-proof";
import { exerciseAssignmentSql } from "../tests/helpers/site-assignment-scenarios";

async function main() {
  const proof = await openProof();
  let outcome: Awaited<ReturnType<typeof runBrowserProof>>;
  try { outcome = await runBrowserProof(proof); } finally { await proof.close(); }
  outcome.report.verdict = "PASS";
  await writeFile(outcome.path, JSON.stringify(outcome.report, null, 2));
  console.log(`PASS. Evidence: ${outcome.path}`);
}

async function runBrowserProof(proof: Proof) {
  const sql = await exerciseAssignmentSql(proof);
  const browser = await chromium.launch();
  try { return await runBrowserChecks(proof, sql, browser); } finally { await browser.close(); }
}

async function runBrowserChecks(proof: Proof, sql: Awaited<ReturnType<typeof exerciseAssignmentSql>>, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const errors: string[] = [];
  const requests: { path: string; status: number }[] = [];
  const screenshots: string[] = [];
  const a = proof.releases.find(release => release.id === releaseIds.a);
  const b = proof.releases.find(release => release.id === releaseIds.b);
  assert(a && b);
  const originalA = renderRelease(a, sql.hero);
  const bindingPath = join(b.root, "bindings.mjs"), originalBinding = await readFile(bindingPath);
  await writeFile(bindingPath, "export const revision='changed'; export const heading=()=> 'Changed';");
  assert.equal(renderRelease(a, sql.hero), originalA);
  await writeFile(bindingPath, originalBinding);
  let current = sql.current;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET") { response.writeHead(405).end(); return; }
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'self'");
      if (path === "/" || path === "/preview") {
        const selected = await proof.selected();
        if (selected.kind !== "published") { response.writeHead(503).end(selected.kind); return; }
        const hero = path === "/preview" ? { ...sql.hero, headline_line_one: "Unsaved Alpha headline", intro: "Unsaved Alpha introduction" } : sql.hero;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(renderRelease(selected.release, hero)); return;
      }
      const parts = path.split("/");
      const release = proof.releases.find(item => item.id === parts[2]);
      if (parts.length !== 4 || parts[1] !== "releases" || !release || !["site.css", "badge.png"].includes(parts[3])) {
        response.writeHead(404).end(); return;
      }
      assert.equal(await artifactDigest(release.root), release.digest);
      response.setHeader("Content-Type", parts[3] === "site.css" ? "text/css" : "image/png");
      response.end(await readFile(join(release.root, parts[3])));
    })().catch(error => { errors.push(String(error)); response.writeHead(500).end("Proof failed"); });
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
      await context.routeWebSocket("**/*", socket => socket.close());
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", response => { const path = new URL(response.url()).pathname; requests.push({ path, status: response.status() }); });
      async function capture(label: string, expected: "a" | "b", preview = false) {
        const response = await page.goto(`${origin}${preview ? "/preview" : "/"}`);
        assert.equal(response?.status(), 200);
        assert.equal(await page.locator("main").getAttribute("data-release"), expected);
        assert.equal((await page.locator("h1").innerText()).trim(), preview ? "Unsaved Alpha headline" : sql.hero.headline_line_one || "Alpha FC");
        assert.equal(await page.locator("[data-intro]").innerText(), preview ? "Unsaved Alpha introduction" : sql.hero.intro);
        assert(await page.locator("img").evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        const screenshot = join(proof.directory, `${label}-${width}.png`);
        await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
        return createHash("sha256").update(await readFile(screenshot)).digest("hex");
      }
      const originalScreenshot = await capture("a", "a");
      const originalStyles = await page.locator("h1").evaluate(element => ({ color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily }));
      current = await proof.publish(proof.db, current, b.id);
      const oldAsset: { status: number; bytes: number[] } = await page.evaluate(async id => {
        const response = await fetch(`/releases/${id}/badge.png?late=1`);
        return { status: response.status, bytes: Array.from(new Uint8Array(await response.arrayBuffer())) };
      }, a.id);
      assert.equal(oldAsset.status, 200);
      assert.deepEqual(Buffer.from(oldAsset.bytes), await readFile(join(a.root, "badge.png")));
      const badgePath = join(b.root, "badge.png"), badge = await readFile(badgePath);
      await unlink(badgePath);
      try {
        const unavailable = await fetch(origin);
        assert.equal(unavailable.status, 503); assert.equal(await unavailable.text(), "unavailable");
      } finally { await writeFile(badgePath, badge); }
      const nextScreenshot = await capture("b", "b");
      assert.notEqual(nextScreenshot, originalScreenshot);
      assert.notDeepEqual(await page.locator("h1").evaluate(element => ({ color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily })), originalStyles);
      current = await proof.publish(proof.db, current, a.id, "rollback");
      assert.equal(await capture("rollback-a", "a"), originalScreenshot);
      await capture("preview-a", "a", true);
      assert.deepEqual(await page.locator("h1").evaluate(element => ({ color: getComputedStyle(element).color, font: getComputedStyle(element).fontFamily })), originalStyles);
      await page.getByRole("link").focus(); await page.getByRole("link").press("Enter");
      assert(page.url().endsWith("#intro"));
      await context.close();
    }
    assert.equal(renderRelease(a, sql.hero), originalA);
    assert.equal(await artifactDigest(a.root), a.digest);
    assert.deepEqual(errors, []); assert(requests.every(request => request.status === 200));
    const report = {
      verdict: "CHECKS_PASSED_CLEANUP_PENDING", sql: sql.results, screenshots, requests, errors,
      releases: proof.releases.map(({ id, digest, binding }) => ({ id, digest, binding })),
      limits: ["Independent fixture React releases, not the Academy closure or real editor.", "Receipt replay is transaction-visible; content transactions roll back.", "Equal binding meanings; no new binding-aware RPC or operator endpoint.", "No hosted activation or rolling deployment proof."],
    };
    const path = join(proof.directory, "report.json");
    await writeFile(path, JSON.stringify(report, null, 2));
    return { path, report };
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
