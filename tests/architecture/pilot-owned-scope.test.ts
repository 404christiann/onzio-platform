import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertOwnedPilotScope, withOwnedPilotServers, type OwnedPilotScope } from "../../scripts/pilot-proof-servers";
import { proofIdentitySchema } from "../../scripts/pilot-proof-protocol";
import { pilotProofProxyMarkerHeader, withPilotProofProxy } from "../../scripts/pilot-proof-proxy";

const project = resolve(import.meta.dirname, "../..");
const loader = createRequire(import.meta.url).resolve("tsx");
const directory = mkdtempSync(join(tmpdir(), "onzio-owned-scope-"));
let sequence = 0;
function put(root: string, path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function fixture(mode = "normal") {
  const root = join(directory, `root-${sequence++}`);
  put(root, "package.json", '{"private":true}');
  put(root, "package-lock.json", "synthetic lock");
  put(root, "app/page.tsx", "synthetic source");
  put(root, ".env.local", "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n");
  put(root, "next.config.mjs", "export default {};");
  put(root, "node_modules/next/package.json", '{"name":"next","version":"0.0.0-test"}');
  put(root, "node_modules/next/constants.js", 'exports.PHASE_PRODUCTION_BUILD="build"; exports.PHASE_PRODUCTION_SERVER="server";');
  put(root, "node_modules/next/dist/server/config.js", 'exports.default = async () => ({distDir:".next"});');
  put(root, "node_modules/next/dist/bin/next", `const fs = require("node:fs");
    for (const [path, value] of Object.entries({".next/BUILD_ID":"scope-${sequence}", ".next/server/page.js":"server", ".next/static/page.js":"static"})) {
      fs.mkdirSync(require("node:path").dirname(path), {recursive:true}); fs.writeFileSync(path,value);
    }`);
  put(root, "node_modules/next/dist/server/lib/router-utils/router-server-context.js", 'exports.RouterServerContextSymbol=Symbol.for("scope-router"); exports.routerServerGlobal=globalThis;');
  put(root, "node_modules/next/dist/server/lib/render-server.js", `exports.servers=new Map();
    exports.getServerField=async root=>exports.servers.get(root).renderOpts;
    exports.initialize=async ({dir})=>exports.servers.get(dir);`);
  put(root, "node_modules/next/dist/cli/next-start.js", `exports.nextStart = async (options, root) => {
    const fs=require("node:fs"), path=require("node:path");
    fs.mkdirSync("output",{recursive:true}); fs.writeFileSync("output/pid",String(process.pid));
    const server=require("node:http").createServer((req,res)=> {
      if(req.url==="/close-listener") server.close();
      res.end(JSON.stringify({root,host:req.headers.host}));
    });
    await new Promise(resolve=>server.listen(options.port,options.hostname,resolve));
    const {routerServerGlobal,RouterServerContextSymbol}=require("../server/lib/router-utils/router-server-context");
    routerServerGlobal[RouterServerContextSymbol]={[path.relative(process.cwd(),root)]:{nextConfig:{distDir:".next"}}};
    require("../server/lib/render-server").servers.set(root,{renderOpts:{distDir:path.join(root,".next")},server:{options:{httpServer:server}}});
    if(${JSON.stringify(mode)}==="wrong-host") process.send({kind:"ready",identity:{
      root,reconstruction:null,buildId:fs.readFileSync(".next/BUILD_ID","utf8"),
      receiptSha256:require("node:crypto").createHash("sha256").update(fs.readFileSync(".next/onzio-pilot-build.json")).digest("hex"),
      origin:"http://pilot.localhost:"+server.address().port
    }});
  };`);
  const built = spawnSync(process.execPath, ["--import", loader, join(project, "scripts/run-pilot-reconstruction.ts"), "build"], {
    cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "test" }, timeout: 10_000,
  });
  expect(built.error).toBeUndefined();
  expect(built.status, built.stderr).toBe(0);
  return root;
}
function clean(roots: Record<string, string>) {
  for (const root of Object.values(roots)) {
    expect(existsSync(join(root, ".onzio-pilot-build.lock"))).toBe(false);
    if (existsSync(join(root, "output/pid"))) expect(() => process.kill(Number(readFileSync(join(root, "output/pid"), "utf8")), 0)).toThrow();
  }
}
async function localGet(origin: string, path = "/") {
  const target = new URL(path, origin); target.hostname = "127.0.0.1";
  return fetch(target);
}
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("owned pilot scope", () => {
  it.each([1, 4])("owns %i independent roots and revalidates frozen live identities", async count => {
    const roots = Object.fromEntries(Array.from({ length: count }, (_, index) => [`member-${index}`, fixture()]));
    let retained: OwnedPilotScope | undefined;
    const result = await withOwnedPilotServers(roots, async scope => {
      retained = scope;
      assertOwnedPilotScope(scope);
      expect(() => assertOwnedPilotScope({ ...scope })).toThrow("active owned pilot scope");
      expect(Object.isFrozen(scope)).toBe(true);
      expect(Reflect.set(scope.servers, "forged", {})).toBe(false);
      expect(Object.getPrototypeOf(scope.servers)).toBeNull();
      expect(Object.keys(scope.servers)).toEqual(Object.keys(roots));
      expect(new Set(Object.values(scope.servers).map(item => item.origin)).size).toBe(count);
      for (const [name, identity] of Object.entries(scope.servers)) {
        expect(identity.root).toBe(roots[name]);
        expect(new URL(identity.origin).hostname).toBe("alpha.localhost");
        expect(Object.isFrozen(identity)).toBe(true);
        expect(await (await localGet(identity.origin)).json()).toMatchObject({ root: roots[name] });
      }
      await Promise.all([scope.verify(), scope.verify()]);
      await scope.verify();
      return "verified";
    });
    expect(result).toBe("verified");
    expect(() => assertOwnedPilotScope(retained)).toThrow("active owned pilot scope");
    await expect(retained!.verify()).rejects.toThrow("active owned pilot scope");
    clean(roots);
  });
  it("selects pilot.localhost through owner startup and preserves that Host through the pinned IPv4 proxy", async () => {
    const roots = { academy: fixture() };
    await withOwnedPilotServers(roots, async scope => {
      const origin = scope.servers.academy.origin;
      expect(new URL(origin).hostname).toBe("pilot.localhost");
      await withPilotProofProxy([origin], async proxy => {
        const marker = proxy.marker();
        const body = await new Promise<string>((resolve, reject) => {
          const connection = request(proxy.server, { path: origin, headers: { host: new URL(origin).host, [pilotProofProxyMarkerHeader]: marker } }, response => {
            let body = ""; response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
            response.on("end", () => resolve(body)); response.on("error", reject);
          });
          connection.on("error", reject); connection.end();
        });
        proxy.confirm(marker);
        expect(JSON.parse(body)).toEqual({ root: roots.academy, host: new URL(origin).host });
      });
    }, { hostname: "pilot.localhost" });
    clean(roots);
  });
  it("rejects an empty set and duplicate canonical roots before child startup", async () => {
    await expect(withOwnedPilotServers({}, async () => {})).rejects.toThrow("nonempty root map");
    const root = fixture(), alias = join(directory, "duplicate-root"); symlinkSync(root, alias);
    await expect(withOwnedPilotServers({ first: root, second: alias }, async () => {})).rejects.toThrow("distinct local roots");
    clean({ root });
    expect(existsSync(join(root, "output/pid"))).toBe(false);
  });
  it.each(["bravo.localhost", "pilot.localhost.evil", "localhost", "127.0.0.1"])("rejects unapproved logical host %s before acquiring roots", async hostname => {
    expect(() => withOwnedPilotServers({ nonexistent: "/does-not-exist" }, async () => {}, { hostname: hostname as "pilot.localhost" })).toThrow();
    expect(proofIdentitySchema.safeParse({root:"/ignored",reconstruction:null,buildId:"id",receiptSha256:"a".repeat(64),origin:`http://${hostname}:1234`}).success).toBe(false);
    await expect(withPilotProofProxy([`http://${hostname}:1234`], async () => {})).rejects.toThrow();
  });
  it("rejects a permitted hostname in IPC when it differs from the owner's selected host", async () => {
    const roots = { worker: fixture("wrong-host") };
    let called = false;
    await expect(withOwnedPilotServers(roots, async () => { called = true; })).rejects.toThrow("Unexpected owned proof server message");
    expect(called).toBe(false);
    clean(roots);
  });
  it.each(["output", "listener"])("invalidates the scope when explicit verification observes %s drift", async change => {
    const roots = { worker: fixture() };
    await expect(withOwnedPilotServers(roots, async scope => {
      if (change === "output") put(roots.worker, ".next/static/page.js", "changed bytes");
      else expect((await localGet(scope.servers.worker.origin, "/close-listener")).status).toBe(200);
      await scope.verify();
    })).rejects.toThrow();
    clean(roots);
  });
  it("revokes the scope and aborts its callback when the owned child disappears", async () => {
    const roots = { worker: fixture() };
    let retained: OwnedPilotScope | undefined;
    await expect(withOwnedPilotServers(roots, async scope => {
      retained = scope;
      process.kill(Number(readFileSync(join(roots.worker, "output/pid"), "utf8")), "SIGKILL");
      await new Promise(() => {});
    })).rejects.toThrow(/(?:exited|disconnected) unexpectedly/);
    expect(retained!.signal.aborted).toBe(true);
    expect(() => assertOwnedPilotScope(retained)).toThrow();
    clean(roots);
  });
});
