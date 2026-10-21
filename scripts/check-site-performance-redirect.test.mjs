import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

test("performance capture blocks redirect chains and sockets before contacting the destination", { timeout: 60000 }, async () => {
  let destinationRequests = 0;
  let phase = "redirect";
  const destination = createServer((_request, response) => {
    destinationRequests++;
    response.end("<title>Alpha FC</title><main><h1>Alpha FC</h1></main>");
  });
  destination.on("upgrade", (_request, socket) => { destinationRequests++; socket.destroy(); });
  const redirect = createServer((request, response) => {
    if (phase === "websocket") {
      response.setHeader("Content-Type", "text/html");
      response.end(`<title>Alpha FC</title><main><h1>Alpha FC</h1></main><script>new WebSocket('ws://127.0.0.2:${destination.address().port}/socket')</script>`);
      return;
    }
    response.writeHead(302, { Location: request.url === "/" ? "/next" : `http://127.0.0.2:${destination.address().port}/` });
    response.end();
  });
  const directory = await mkdtemp(join(tmpdir(), "onzio-performance-redirect-"));
  try {
    await new Promise(resolve => destination.listen(0, "127.0.0.2", resolve));
    await new Promise(resolve => redirect.listen(0, "127.0.0.1", resolve));
    for (phase of ["redirect", "websocket"]) {
      const output = join(directory, `${phase}.json`);
      await assert.rejects(promisify(execFile)(process.execPath, [
        "scripts/check-site-performance.mjs", "--base-url", `http://127.0.0.1:${redirect.address().port}`,
        "--expected-title", "Alpha FC", "--output", output,
      ], { timeout: 45000 }), error => error.code === 1);
      const report = JSON.parse(await readFile(output, "utf8"));
      assert.equal(report.verdict, "FAIL");
      if (phase === "redirect") {
        assert.equal(report.samples[0].redirectsBlocked, 1);
        assert.equal(report.samples[0].redirectsFollowed, 1);
      } else {
        assert.equal(report.samples[0].webSocketsBlocked, 1);
      }
      assert.equal(destinationRequests, 0);
    }
  } finally {
    for (const server of [redirect, destination]) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await rm(directory, { recursive: true, force: true });
  }
});
