/**
 * Host-rewriting proxy for iOS Simulator and real-device testing.
 *
 * The app resolves which club you are from the Host header and only accepts
 * *.localhost. iOS Safari (simulator or a real phone) will not resolve
 * "alpha.localhost", so this listens on a plain address and forwards every
 * request to the local Next server with Host rewritten to the tenant hostname.
 * Set-Cookie Domain attributes are stripped so the browser keeps the cookie for
 * whatever origin it actually used.
 *
 *   npm run dev:device-proxy                  # 127.0.0.1:3111 -> alpha.localhost:3110
 *   LISTEN_HOST=0.0.0.0 npm run dev:device-proxy   # also reachable from a phone on the LAN
 *
 * Simulator: open http://127.0.0.1:3111 in Safari.
 * Real iPhone: open http://<your-mac-lan-ip>:3111 on the same Wi-Fi.
 *
 * Development only. It defeats the save route's cross-origin check by design, so
 * never point it at a hosted environment or expose it beyond your own network.
 */
import http from "node:http";

const TENANT_HOST = process.env.TENANT_HOST ?? "alpha.localhost";
const TARGET_PORT = Number(process.env.TARGET_PORT ?? 3110);
const LISTEN_PORT = Number(process.env.LISTEN_PORT ?? 3111);
const LISTEN_HOST = process.env.LISTEN_HOST ?? "0.0.0.0";

const server = http.createServer((request, response) => {
  console.log(new Date().toISOString().slice(11,19), request.method, request.url, "from", request.socket.remoteAddress);
  const tenantOrigin = `http://${TENANT_HOST}:${TARGET_PORT}`;
  const headers = { ...request.headers, host: `${TENANT_HOST}:${TARGET_PORT}` };
  delete headers["accept-encoding"];
  // The save route rejects a mismatched Origin as cross-site (CSRF protection).
  // Rewrite it so the proxy is transparent rather than looking like an attacker.
  if (headers.origin) headers.origin = tenantOrigin;
  if (headers.referer) headers.referer = String(headers.referer).replace(/^https?:\/\/[^/]+/, tenantOrigin);
  const upstream = http.request(
    { host: "127.0.0.1", port: TARGET_PORT, method: request.method, path: request.url, headers },
    result => {
      const out = { ...result.headers };
      const cookies = result.headers["set-cookie"];
      if (cookies) out["set-cookie"] = cookies.map(c => c.replace(/;\s*Domain=[^;]*/gi, ""));
      const location = result.headers.location;
      if (location) {
        out.location = location
          .replace(`http://${TENANT_HOST}:${TARGET_PORT}`, "")
          .replace(`https://${TENANT_HOST}:${TARGET_PORT}`, "");
      }
      response.writeHead(result.statusCode ?? 502, out);
      result.pipe(response);
    },
  );
  upstream.on("error", error => { response.writeHead(502); response.end(`proxy error: ${error.message}`); });
  request.pipe(upstream);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`proxy http://${LISTEN_HOST}:${LISTEN_PORT} -> ${TENANT_HOST}:${TARGET_PORT}`);
});
