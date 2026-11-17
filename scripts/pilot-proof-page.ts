import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { expect, type Page, type Request } from "@playwright/test";

export function observePilotProofPage(page: Page, imagePaths: readonly string[]) {
  const fonts = new Set<string>();
  const css = new Set<string>();
  const images = new Map<string, string>();
  const scripts = new Map<string, string>();
  const pageErrors: string[] = [];
  const bodyErrors: string[] = [];
  const networkErrors: string[] = [];
  const consoleErrors: string[] = [];
  const pending = new Map<Request, number>();
  let lastActivity = Date.now();
  page.on("request", request => { pending.set(request, Date.now()); lastActivity = Date.now(); });
  page.on("requestfinished", request => { pending.delete(request); lastActivity = Date.now(); });
  page.on("requestfailed", request => { pending.delete(request); lastActivity = Date.now(); });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    const location = message.location().url;
    if (message.type() === "error" && location && new URL(location).hostname.endsWith(".localhost") && !location.includes("/_vercel/insights/")) consoleErrors.push(message.text());
  });
  page.on("requestfailed", request => {
    const url = new URL(request.url());
    if (url.hostname.endsWith(".localhost") && !url.pathname.startsWith("/_vercel/insights/") && request.failure()?.errorText !== "net::ERR_ABORTED") networkErrors.push(`${url.pathname}: ${request.failure()?.errorText}`);
  });
  page.on("response", async response => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400) networkErrors.push(`${path}: ${response.status()}`);
    if (!response.ok() || !(path.endsWith(".woff2") || path.endsWith(".css") || path.startsWith("/_next/") && path.endsWith(".js") || imagePaths.includes(path))) return;
    try {
      const digest = createHash("sha256").update(await response.body()).digest("hex");
      if (path.endsWith(".woff2")) fonts.add(digest);
      else if (path.endsWith(".css")) css.add(digest);
      else if (path.endsWith(".js")) scripts.set(path, digest);
      else images.set(path, digest);
    } catch (error) { bodyErrors.push(`${path}: ${String(error)}`); }
  });
  async function waitForIdle() {
    try {
      await expect.poll(() => pending.size === 0 && Date.now() - lastActivity >= 500, { timeout: 30_000, intervals: [100] }).toBe(true);
    } catch (error) {
      const outstanding = [...pending].map(([request, started]) => {
        const url = new URL(request.url());
        return `${request.method()} ${url.pathname} (${Date.now() - started}ms)`;
      });
      throw new Error(`Proof page did not become quiet; pending ${JSON.stringify(outstanding)}`, { cause: error });
    }
  }
  const finish = async () => {
    await waitForIdle();
    await page.removeAllListeners("response", { behavior: "wait" });
    await page.context().close();
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(bodyErrors, []);
    assert.deepEqual(networkErrors, []);
    assert.deepEqual(consoleErrors, []);
    return {
      fonts: [...fonts].sort(), css: [...css].sort(), images: Object.fromEntries(images),
      scripts: [...scripts].sort().map(([path, sha256]) => ({ path, sha256 })),
      pageErrors: [...pageErrors], bodyErrors: [...bodyErrors], networkErrors: [...networkErrors], consoleErrors: [...consoleErrors],
    };
  };
  return Object.assign(finish, { waitForIdle });
}
