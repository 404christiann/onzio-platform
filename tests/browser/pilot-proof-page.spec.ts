import { createHash } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { chromium, expect, test } from "@playwright/test";
import { observePilotProofPage } from "../../scripts/pilot-proof-page";

for (const truncated of [false, true]) {
  test(`proof capture ${truncated ? "rejects a late failed body" : "retains a late successful body"} before closing`, async () => {
    let receive: (response: ServerResponse) => void = () => {};
    const received = new Promise<ServerResponse>(resolve => { receive = resolve; });
    const server = createServer((request, response) => {
      if (request.url === "/late.css") return receive(response);
      response.writeHead(200, { "content-type": "text/html" }).end('<script>fetch("/late.css").then(r => r.text()).catch(() => {});</script><main>Capture</main>');
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("IPv4 listener required");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const finish = observePilotProofPage(page, []);
      await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "domcontentloaded" });
      const response = await received;
      let settled = false;
      const result = finish().finally(() => { settled = true; });
      void result.catch(() => {});
      await page.waitForTimeout(100);
      expect(settled).toBe(false);
      expect(page.isClosed()).toBe(false);
      const css = "main { color: rgb(1, 2, 3); }";
      response.writeHead(200, { "content-type": "text/css", "content-length": String(Buffer.byteLength(css)) });
      if (truncated) {
        const observed = page.waitForEvent("response", reply => reply.url().endsWith("/late.css"));
        response.write(css.slice(0, 4));
        await observed;
        response.destroy();
        await expect(result).rejects.toThrow("/late.css");
      } else {
        response.end(css);
        const snapshot = await result;
        expect(snapshot.css).toEqual([createHash("sha256").update(css).digest("hex")]);
        expect(snapshot.bodyErrors).toEqual([]);
        expect(snapshot.networkErrors).toEqual([]);
        const published = JSON.stringify(snapshot);
        await browser.close();
        expect(JSON.stringify(snapshot)).toBe(published);
      }
      expect(page.isClosed()).toBe(true);
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
