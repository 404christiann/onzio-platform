import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { chromium, expect, test } from "@playwright/test";
import type { Socket } from "node:net";
import { installPilotProofGuard, proofGet } from "../../scripts/pilot-proof-network";
import { pilotProofProxyMarkerHeader, withPilotProofProxy } from "../../scripts/pilot-proof-proxy";

async function listener(handle: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handle);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("IPv4 listener required");
  return {
    origin: `http://alpha.localhost:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

test("the guarded browser and direct proof requests use their verified IPv4 listeners", async () => {
  const received: { path: string; host: string | undefined; cookie: string | undefined; marker: string | undefined }[] = [];
  let hangingSocket: Socket | undefined;
  let redirectedOrigin = "";
  const second = await listener((request, response) => {
    received.push({ path: request.url ?? "", host: request.headers.host, cookie: request.headers.cookie, marker: request.headers["x-onzio-proof-proxy-marker"] as string | undefined });
    response.writeHead(200, { "content-type": "text/plain" }).end("redirected");
  });
  redirectedOrigin = second.origin;
  const first = await listener((request, response) => {
    received.push({ path: request.url ?? "", host: request.headers.host, cookie: request.headers.cookie, marker: request.headers["x-onzio-proof-proxy-marker"] as string | undefined });
    if (request.url === "/") return void response.writeHead(200, { "content-type": "text/html" }).end('<main><h1>Proof</h1><img src="/asset"></main>');
    if (request.url === "/asset") return void response.writeHead(200, { "content-type": "image/svg+xml" }).end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
    if (request.url === "/go") return void response.writeHead(302, { location: `${redirectedOrigin}/sink`, "set-cookie": "redirected=1; Path=/" }).end();
    if (request.url === "/rotate") return void response.writeHead(302, { location: "/rotated/sink", "set-cookie": ["auth=new; Path=/", "gone=; Max-Age=0; Path=/", "scoped=yes; Path=/rotated"] }).end();
    if (request.url === "/rotated/sink") return void response.writeHead(200).end("cookies checked");
    if (request.url === "/api/admin/data") return void response.writeHead(307, { location: "/api/admin/delete" }).end();
    if (request.url === "/api/admin/delete") return void response.writeHead(200).end("must not run");
    if (request.url === "/hang") { hangingSocket = request.socket; return; }
    if (request.url === "/escape") return void response.writeHead(302, { location: "http://outside.example/escape" }).end();
    if (request.url === "/api/admin/homepage") return void response.writeHead(401).end();
    if (request.url === "/font.woff2") return void response.writeHead(200).end("retained-font");
    response.writeHead(404).end();
  });
  try {
    await withPilotProofProxy([first.origin, second.origin], async proxy => {
      const browser = await chromium.launch({ proxy: { server: proxy.server, bypass: "" } });
      try {
        const context = await browser.newContext({ proxy: { server: proxy.server, bypass: "" }, serviceWorkers: "block" });
        const errors: string[] = [];
        try {
          await context.addCookies([{ name: "auth", value: "secret", domain: "alpha.localhost", path: "/" }]);
          await context.addCookies([{ name: "gone", value: "old", domain: "alpha.localhost", path: "/" }]);
          await installPilotProofGuard(context, [first.origin, second.origin], proxy, { club_id: "synthetic" }, [], errors);
          const page = await context.newPage();
          let firstResponse;
          try { firstResponse = await page.goto(first.origin); }
          catch (error) { throw new Error(`${errors.join("\n")}\n${String(error)}`); }
          expect(firstResponse?.status()).toBe(200);
          await expect(page.locator("main h1")).toHaveText("Proof");
          await expect.poll(() => page.locator("img").evaluate(item => (item as HTMLImageElement).complete)).toBe(true);
          expect(page.url()).toBe(`${first.origin}/`);
          expect(errors).toEqual([]);
          expect((await page.goto(`${first.origin}/go`))?.status()).toBe(200);
          expect(received.find(item => item.path === "/sink")?.cookie).toBeFalsy();
          expect((await context.cookies(first.origin)).some(cookie => cookie.name === "redirected")).toBe(true);
          expect((await page.goto(`${first.origin}/rotate`))?.status()).toBe(200);
          const rotatedCookie = received.find(item => item.path === "/rotated/sink")?.cookie ?? "";
          expect(rotatedCookie).toContain("auth=new");
          expect(rotatedCookie).toContain("scoped=yes");
          expect(rotatedCookie).not.toContain("gone=");
          await page.evaluate(async () => {
            await fetch("/api/admin/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: "select" }) }).catch(() => {});
          });
          expect(errors.some(error => error.includes("Read-only POST redirects are blocked"))).toBe(true);
          expect(received.some(item => item.path === "/api/admin/delete")).toBe(false);
          await page.goto(`${first.origin}/escape`).catch(() => {});
          expect(errors.some(error => error.includes("Redirect escaped local rehearsal"))).toBe(true);
        } finally { await context.close(); }
        const anonymous = await browser.newContext({ proxy: { server: proxy.server, bypass: "" } });
        try { expect((await proofGet(anonymous, proxy, `${first.origin}/api/admin/homepage`)).status()).toBe(401); }
        finally { await anonymous.close(); }
        const late = await browser.newContext({ proxy: { server: proxy.server, bypass: "" } });
        try { expect(await (await proofGet(late, proxy, `${first.origin}/font.woff2`)).text()).toBe("retained-font"); }
        finally { await late.close(); }
        const hangMarker = proxy.marker();
        const hangingClient = httpRequest(proxy.server, { path: `${first.origin}/hang`, headers: { host: new URL(first.origin).host, [pilotProofProxyMarkerHeader]: hangMarker } });
        hangingClient.on("error", () => {});
        hangingClient.end();
        await expect.poll(() => hangingSocket !== undefined).toBe(true);
      } finally { await browser.close(); }
    });
    await expect.poll(() => hangingSocket?.destroyed).toBe(true);
    for (const request of received) {
      expect(request.host).toMatch(/^alpha\.localhost:\d+$/);
      expect(request.marker).toBeUndefined();
    }
    expect(received.find(item => item.path === "/")?.cookie).toContain("auth=secret");
    expect(received.find(item => item.path === "/asset")?.cookie).toContain("auth=secret");
    expect(received.find(item => item.path === "/go")?.cookie).toContain("auth=secret");
    expect(received.find(item => item.path === "/api/admin/homepage")?.cookie).toBeFalsy();
  } finally { await first.close(); await second.close(); }
});
