import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, request, type ClientRequest, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { proofHostnameSchema } from "./pilot-proof-protocol";

const markerHeader = "x-onzio-proof-proxy-marker";

export type PilotProofProxy = {
  server: string;
  marker: () => string;
  confirm: (marker: string) => void;
};

export async function withPilotProofProxy<T>(origins: readonly string[], action: (proxy: PilotProofProxy) => Promise<T>): Promise<T> {
  const allowed = new Set([...origins, "http://127.0.0.1:54321"]);
  for (const origin of origins) {
    const url = new URL(origin);
    assert.equal(url.protocol, "http:");
    proofHostnameSchema.parse(url.hostname);
    assert.equal(url.origin, origin);
  }
  const pending = new Set<string>();
  const forwarded = new Set<string>();
  const sockets = new Set<Socket>();
  const upstreamRequests = new Set<ClientRequest>();
  function forward(incoming: IncomingMessage, outgoing: ServerResponse, tunnelOrigin?: string) {
    let target: URL;
    try {
      target = tunnelOrigin ? new URL(incoming.url ?? "", tunnelOrigin) : new URL(incoming.url ?? "");
      const marker = incoming.headers[markerHeader];
      if (target.protocol !== "http:" || target.username || target.password || !allowed.has(target.origin)
        || tunnelOrigin && target.origin !== tunnelOrigin
        || typeof marker !== "string" || !pending.has(marker) || incoming.headers.host !== target.host) throw new Error();
      pending.delete(marker);
      forwarded.add(marker);
    } catch {
      outgoing.writeHead(403).end();
      return;
    }
    const headers: IncomingHttpHeaders = { ...incoming.headers, host: target.host };
    delete headers[markerHeader];
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    const upstream = request({ hostname: "127.0.0.1", port: Number(target.port), path: `${target.pathname}${target.search}`, method: incoming.method, headers }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstreamRequests.add(upstream);
    upstream.once("close", () => upstreamRequests.delete(upstream));
    incoming.once("aborted", () => upstream.destroy());
    outgoing.once("close", () => { if (!outgoing.writableFinished) upstream.destroy(); });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  }
  const server: Server = createServer((incoming, outgoing) => forward(incoming, outgoing));
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.on("connect", (incoming, socket, head) => {
    let origin: string;
    try {
      const target = new URL(`http://${incoming.url}`);
      if (target.username || target.password || target.pathname !== "/" || target.search || !allowed.has(target.origin)) throw new Error();
      origin = target.origin;
    } catch { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return; }
    const tunnel = createServer((request, response) => forward(request, response, origin));
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) socket.unshift(head);
    tunnel.emit("connection", socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  assert(address && typeof address !== "string" && address.address === "127.0.0.1");
  try {
    return await action({
      server: `http://127.0.0.1:${address.port}`,
      marker() { const value = randomUUID(); pending.add(value); return value; },
      confirm(value) { assert(forwarded.delete(value), "Proof request bypassed its owned IPv4 proxy"); pending.delete(value); },
    });
  } finally {
    for (const upstream of upstreamRequests) upstream.destroy();
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

export const pilotProofProxyMarkerHeader = markerHeader;
