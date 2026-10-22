import { fork, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { withPilotProofServers } from "../../scripts/pilot-proof-servers";

const project = resolve(import.meta.dirname, "../..");
const loader = createRequire(import.meta.url).resolve("tsx");
const directory = mkdtempSync(join(tmpdir(), "onzio-proof-servers-"));
let sequence = 0;
function put(root: string, path: string, value: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}
function fixture(mode = "normal", config = "export default {};") {
  const root = join(directory, `root-${sequence++}`);
  put(root, "package.json", '{"private":true}');
  put(root, "package-lock.json", "synthetic lock");
  put(root, "app/page.tsx", "synthetic source");
  put(root, ".env.local", `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_ROLE_MARKER=${sequence}\nPRIVATE_ROLE_MARKER=private-${sequence}\n`);
  put(root, "next.config.mjs", config);
  put(root, "node_modules/next/package.json", '{"name":"next","version":"0.0.0-test"}');
  put(root, "node_modules/next/constants.js", 'exports.PHASE_PRODUCTION_BUILD="build"; exports.PHASE_PRODUCTION_SERVER="server";');
  put(root, "node_modules/next/dist/server/config.js", `exports.default = async (phase, root) => {
    const config = (await import(require("node:url").pathToFileURL(require("node:path").join(root, "next.config.mjs")))).default;
    return {distDir: ".next", ...(typeof config === "function" ? await config(phase) : config)};
  };`);
  put(root, "node_modules/next/dist/bin/next", `const fs = require("node:fs");
    for (const [path, value] of Object.entries({".next/BUILD_ID":"build-${sequence}", ".next/server/page.js":"server", ".next/static/page.js":"static"})) {
      fs.mkdirSync(require("node:path").dirname(path), {recursive:true}); fs.writeFileSync(path,value);
    }`);
  put(root, "node_modules/next/dist/server/lib/router-utils/router-server-context.js", `
    const fs = require("node:fs");
    fs.mkdirSync("output", {recursive:true});
    const count = "output/router-module-loads";
    fs.writeFileSync(count, String(Number(fs.existsSync(count) ? fs.readFileSync(count, "utf8") : 0) + 1));
    exports.RouterServerContextSymbol = Symbol.for("@next/router-server-methods");
    exports.routerServerGlobal = globalThis;
  `);
  put(root, "node_modules/next/dist/server/lib/render-server.js", `
    const fs = require("node:fs");
    fs.mkdirSync("output", {recursive:true});
    const count = "output/renderer-module-loads";
    fs.writeFileSync(count, String(Number(fs.existsSync(count) ? fs.readFileSync(count, "utf8") : 0) + 1));
    const servers = new Map();
    exports.servers = servers;
    exports.getServerField = async (root, field) => {
      if (!servers.has(root)) throw new Error("No app initialized");
      return servers.get(root)[field];
    };
    exports.initialize = async ({dir}) => {
      fs.writeFileSync("output/renderer-initialize-reads", String(Number(fs.existsSync("output/renderer-initialize-reads") ? fs.readFileSync("output/renderer-initialize-reads", "utf8") : 0) + 1));
      if (!servers.has(dir)) throw new Error("Must read an existing initialization");
      return servers.get(dir);
    };
  `);
  put(root, "node_modules/next/dist/cli/next-start.js", `exports.nextStart = async (options, root) => {
    const fs = require("node:fs");
    fs.mkdirSync("output", {recursive:true}); fs.writeFileSync("output/pid", String(process.pid));
    const mode = ${JSON.stringify(mode)};
    if (mode === "fail") throw new Error("private-start-failure");
    if (mode === "malformed") process.send({ kind: "ready", secret: "private-ipc" });
    if (mode === "disconnect") process.disconnect();
    if (mode === "hang") { setInterval(() => {}, 1000); await new Promise(() => {}); }
    let output;
    const server = require("node:http").createServer(async (req,res) => {
      if (req.url === "/mutate-router") routerServerGlobal[RouterServerContextSymbol][path.relative(process.cwd(), root)].nextConfig.distDir = "output/stale";
      if (req.url === "/mutate-renderer") renderer.servers.get(root).renderOpts.distDir = path.join(root, "output/stale");
      if (req.url === "/replace-listener") {
        const replacement = require("node:http").createServer();
        await new Promise(resolve => replacement.listen(0, "127.0.0.1", resolve));
        renderer.servers.get(root).server.options.httpServer = replacement;
      }
      if (req.url === "/close-listener") server.close();
      if (req.url === "/rebind-listener") {
        const previousPort = server.address().port;
        do {
          server.close();
          await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        } while (server.address().port === previousPort);
      }
      res.end(JSON.stringify({root, public:process.env.NEXT_PUBLIC_ROLE_MARKER, private:process.env.PRIVATE_ROLE_MARKER, port:process.env.PORT, output}));
    });
    await new Promise(resolve => server.listen(options.port, mode === "listener-nonloopback" ? "127.0.0.2" : options.hostname, resolve));
    process.env.PORT = String(server.address().port); process.env.__NEXT_PRIVATE_ORIGIN = "http://127.0.0.1:" + process.env.PORT;
    const config = await require("../server/config").default("server", root);
    const path = require("node:path");
    const {routerServerGlobal, RouterServerContextSymbol} = require("../server/lib/router-utils/router-server-context");
    routerServerGlobal[RouterServerContextSymbol] = {
      [path.relative(process.cwd(), root)]: {nextConfig: {...config, distDir: mode === "router-custom" ? "output/stale" : config.distDir}},
    };
    const renderer = require("../server/lib/render-server");
    const rendererOutput = mode === "renderer-custom" ? "output/stale" : config.distDir;
    const httpServer = mode === "listener-missing" ? undefined : mode === "listener-fake" ? {listening:true,address:() => server.address()} : mode === "listener-closed" ? require("node:http").createServer() : server;
    renderer.servers.set(root, {renderOpts: {distDir: path.join(root, rendererOutput)}, server: {options: {httpServer}}});
    if (mode === "router-missing") delete routerServerGlobal[RouterServerContextSymbol];
    if (mode === "router-malformed") routerServerGlobal[RouterServerContextSymbol][path.relative(process.cwd(), root)].nextConfig.distDir = 42;
    if (mode === "renderer-missing") renderer.servers.clear();
    if (mode === "renderer-malformed") renderer.servers.set(root, {renderOpts: {distDir: 42}});
    output = fs.readFileSync(path.join(rendererOutput, "server/page.js"), "utf8");
    process.env.NEXT_DEPLOYMENT_ID = "";
    if (mode === "duplicate") process.nextTick(() => process.send({ kind: "verified", identity: {} }));
    if (mode === "stubborn") process.on("SIGTERM", () => {});
    if (mode === "shutdown-message") process.on("SIGTERM", () => { process.send({kind:"malformed"}); setTimeout(() => process.exit(0), 20); });
  };`);
  const build = spawnSync(process.execPath, ["--import", loader, join(project, "scripts/run-pilot-reconstruction.ts"), "build"], {
    cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "test" }, timeout: 10_000,
  });
  expect(build.error).toBeUndefined();
  expect(build.status, build.stderr).toBe(0);
  return root;
}
function roots(mode = "normal") { return { baseline: fixture(), changed: fixture(mode), restored: fixture() }; }
function assertClean(items: ReturnType<typeof roots>) {
  for (const root of Object.values(items)) {
    expect(existsSync(join(root, ".onzio-pilot-build.lock"))).toBe(false);
    if (existsSync(join(root, "output/pid"))) {
      const pid = Number(readFileSync(join(root, "output/pid"), "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
    }
  }
}
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("owned proof servers", () => {
  it("stops successful configuration-probe descendants before reporting server readiness", async () => {
    const items = roots();
    put(items.changed, "node_modules/next/dist/server/config.js", `exports.default = async () => {
      if (!process.send) {
        const fs = require("node:fs"); fs.mkdirSync("output", {recursive:true});
        require("node:child_process").spawn(process.execPath, ["-e", 'setTimeout(() => require("node:fs").writeFileSync("output/late-probe-write", "late"), 700)'], {stdio:"ignore"}).unref();
      }
      return {distDir:".next"};
    };`);
    await withPilotProofServers(items, async () => {
      await new Promise(resolve => setTimeout(resolve, 950));
      expect(existsSync(join(items.changed, "output/late-probe-write"))).toBe(false);
    });
    assertClean(items);
  });
  it("uses verified distinct builds, isolated role environments and locks until callback and cleanup finish", async () => {
    const items = roots();
    const result = await withPilotProofServers(items, async servers => {
      expect(new Set(Object.values(servers).map(item => item.origin)).size).toBe(3);
      expect(servers.baseline.root).toBe(items.baseline);
      expect(servers.changed.root).toBe(items.changed);
      expect(servers.restored.root).toBe(items.restored);
      for (const identity of Object.values(servers)) {
        expect(identity.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(existsSync(join(identity.root, ".onzio-pilot-build.lock"))).toBe(true);
        const url = new URL(identity.origin); url.hostname = "127.0.0.1";
        const response = await fetch(url);
        const data = await response.json();
        expect(data.root).toBe(identity.root);
        expect(data.port).toBe(url.port);
        expect(data.public).toBe(readFileSync(join(identity.root, ".env.local"), "utf8").match(/NEXT_PUBLIC_ROLE_MARKER=(\d+)/)?.[1]);
        expect(data.private).toBe(`private-${data.public}`);
      }
      return "capture result";
    });
    expect(result).toBe("capture result");
    assertClean(items);
  });
  it("uses the actual owned listener when runtime configuration redirects the reported environment to another server", async () => {
    let foreignRequests = 0;
    const foreign = createServer((_, response) => { foreignRequests++; response.end(JSON.stringify({ unrelated: true })); });
    await new Promise<void>(resolve => foreign.listen(0, "127.0.0.1", resolve));
    try {
      const address = foreign.address();
      if (!address || typeof address === "string") throw new Error("Foreign fixture requires a TCP address");
      const config = `export default () => {
        if (process.env.__NEXT_PRIVATE_ORIGIN) {
          process.env.PORT = ${JSON.stringify(String(address.port))};
          process.env.__NEXT_PRIVATE_ORIGIN = "http://127.0.0.1:" + process.env.PORT;
        }
        return {distDir:".next"};
      };`;
      const items = { baseline: fixture(), changed: fixture("normal", config), restored: fixture() };
      await withPilotProofServers(items, async servers => {
        const url = new URL(servers.changed.origin); url.hostname = "127.0.0.1";
        expect(await (await fetch(url)).json()).toMatchObject({root: items.changed, port: String(address.port), output: "server"});
        expect(Number(url.port)).not.toBe(address.port);
      });
      expect(foreignRequests).toBe(0);
      assertClean(items);
    } finally {
      foreign.closeAllConnections();
      await new Promise<void>(resolve => foreign.close(() => resolve()));
    }
  });
  it("rejects aliases before launching or acquiring locks", async () => {
    const items = roots();
    const alias = join(directory, "root-alias"); symlinkSync(items.baseline, alias);
    await expect(withPilotProofServers({ ...items, restored: alias }, async () => "unexpected")).rejects.toThrow("distinct local roots");
    assertClean(items);
  });
  it.each(["__NEXT_PRIVATE_ORIGIN", "PORT"])("rejects output selected by Next-created %s before proof readiness", async variable => {
    const config = `export default phase => ({distDir: phase === "server" && process.env.${variable} ? "output/stale" : ".next"});`;
    const items = { baseline: fixture(), changed: fixture("normal", config), restored: fixture() };
    put(items.changed, "output/stale/server/page.js", "stale-custom-output");
    let called = false;
    await expect(withPilotProofServers(items, async () => { called = true; })).rejects.toThrow();
    expect(called).toBe(false);
    assertClean(items);
  });
  it("rejects the actual stale output when deployment initialization changes later config evaluation", async () => {
    const config = `export default {distDir: process.env.__NEXT_PRIVATE_ORIGIN && !("NEXT_DEPLOYMENT_ID" in process.env) ? "output/stale" : ".next"};`;
    const items = { baseline: fixture(), changed: fixture("normal", config), restored: fixture() };
    put(items.changed, "output/stale/server/page.js", "stale-before-deployment-initialization");
    let observed;
    await expect(withPilotProofServers(items, async servers => {
      const url = new URL(servers.changed.origin); url.hostname = "127.0.0.1";
      observed = await (await fetch(url)).json();
      expect(observed).toMatchObject({output: "stale-before-deployment-initialization"});
      return "must not certify stale output";
    })).rejects.toThrow();
    expect(observed).toBeUndefined();
    assertClean(items);
  });
  it.each(["router-custom", "renderer-custom", "router-missing", "router-malformed", "renderer-missing", "renderer-malformed"])("rejects %s actual server state before proof readiness", async mode => {
    const items = roots(mode);
    put(items.changed, "output/stale/server/page.js", "stale-actual-state");
    let called = false;
    await expect(withPilotProofServers(items, async () => { called = true; })).rejects.toThrow();
    expect(called).toBe(false);
    assertClean(items);
  });
  it.each(["listener-missing", "listener-fake", "listener-closed", "listener-nonloopback"])("rejects %s actual HTTP resource before proof readiness", async mode => {
    const items = roots(mode);
    let called = false;
    await expect(withPilotProofServers(items, async () => { called = true; })).rejects.toThrow();
    expect(called).toBe(false);
    assertClean(items);
  });
  it.each(["replace", "close", "rebind"])("postcheck rejects an owned listener that the callback makes %s", async change => {
    const items = roots();
    await expect(withPilotProofServers(items, async servers => {
      const url = new URL(servers.changed.origin); url.hostname = "127.0.0.1";
      url.pathname = `/${change}-listener`;
      expect((await fetch(url)).status).toBe(200);
      return "must not pass";
    })).rejects.toThrow();
    assertClean(items);
  });
  it("accepts runtime-dependent configuration that keeps normal output and preserves the listener environment", async () => {
    const config = `export default phase => ({distDir: phase === "server" && process.env.__NEXT_PRIVATE_ORIGIN && process.env.PORT ? "./.next" : ".next"});`;
    const items = { baseline: fixture(), changed: fixture("normal", config), restored: fixture() };
    await withPilotProofServers(items, async servers => {
      const url = new URL(servers.changed.origin); url.hostname = "127.0.0.1";
      const response = await fetch(url);
      expect(await response.json()).toMatchObject({port: url.port, output: "server"});
    });
    assertClean(items);
  });
  it("rejects source mutation during actual runtime configuration loading before proof readiness", async () => {
    const config = `import fs from "node:fs";
      export default () => {
        if (process.env.__NEXT_PRIVATE_ORIGIN) {
          fs.writeFileSync("app/page.tsx", "mutated during actual runtime config loading");
        }
        return {distDir:".next"};
      };`;
    const items = { baseline: fixture(), changed: fixture("normal", config), restored: fixture() };
    let called = false;
    await expect(withPilotProofServers(items, async () => { called = true; })).rejects.toThrow();
    expect(called).toBe(false);
    expect(readFileSync(join(items.changed, "app/page.tsx"), "utf8")).toBe("mutated during actual runtime config loading");
    assertClean(items);
  });
  it("validates retained runtime state without re-evaluating configuration or actual server modules", async () => {
    const config = `import fs from "node:fs";
      export default () => {
        if (process.env.__NEXT_PRIVATE_ORIGIN) {
          fs.mkdirSync("output", {recursive:true});
          const count = "output/runtime-config-loads";
          fs.writeFileSync(count, String(Number(fs.existsSync(count) ? fs.readFileSync(count, "utf8") : 0) + 1));
        }
        return {distDir:".next"};
      };`;
    const items = { baseline: fixture(), changed: fixture("normal", config), restored: fixture() };
    await withPilotProofServers(items, async () => "capture");
    for (const file of ["runtime-config-loads", "router-module-loads", "renderer-module-loads"]) {
      expect(readFileSync(join(items.changed, "output", file), "utf8")).toBe("1");
    }
    expect(readFileSync(join(items.changed, "output/renderer-initialize-reads"), "utf8")).toBe("2");
    assertClean(items);
  });
  it.each(["router", "renderer"])("postcheck rejects actual %s output drift during proof", async consumer => {
    const items = roots();
    await expect(withPilotProofServers(items, async servers => {
      const url = new URL(servers.changed.origin); url.hostname = "127.0.0.1";
      url.pathname = `/mutate-${consumer}`;
      expect((await fetch(url)).status).toBe(200);
      return "must not pass";
    })).rejects.toThrow();
    assertClean(items);
  });
  it("preserves a competitor's receipt and lock while releasing acquired earlier locks", async () => {
    const items = roots();
    const receipt = readFileSync(join(items.changed, ".next/onzio-pilot-build.json"), "utf8");
    put(items.changed, ".onzio-pilot-build.lock", "competitor");
    await expect(withPilotProofServers(items, async () => "unexpected")).rejects.toThrow("holds the local lock");
    expect(readFileSync(join(items.changed, ".onzio-pilot-build.lock"), "utf8")).toBe("competitor");
    expect(readFileSync(join(items.changed, ".next/onzio-pilot-build.json"), "utf8")).toBe(receipt);
    rmSync(join(items.changed, ".onzio-pilot-build.lock")); assertClean(items);
  });
  it.each(["missing", "source", "output", "public-environment", "custom-config"])("rejects %s before calling proof", async change => {
    const items = roots();
    if (change === "missing") rmSync(join(items.changed, ".next/onzio-pilot-build.json"));
    if (change === "source") put(items.changed, "app/page.tsx", "stale source");
    if (change === "output") put(items.changed, ".next/server/page.js", "stale output");
    if (change === "public-environment") put(items.changed, ".env.local", "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_ROLE_MARKER=changed");
    if (change === "custom-config") put(items.changed, "node_modules/next/dist/server/config.js", 'exports.default = async () => ({distDir:"custom"});');
    let called = false;
    await expect(withPilotProofServers(items, async () => { called = true; })).rejects.toThrow();
    expect(called).toBe(false); assertClean(items);
  });
  it.each([
    ["source", "app/page.tsx"], ["output", ".next/static/page.js"],
    ["receipt", ".next/onzio-pilot-build.json"], ["public-environment", ".env.local"],
  ])("postcheck rejects callback mutation of %s", async (_, path) => {
    const items = roots();
    await expect(withPilotProofServers(items, async () => {
      put(items.restored, path, "changed during proof");
      return "must not pass";
    })).rejects.toThrow();
    assertClean(items);
  });
  it.each(["fail", "malformed", "duplicate", "disconnect"])("rejects %s startup with no unhandled sibling rejection or orphan", async mode => {
    const items = roots(mode);
    await expect(withPilotProofServers(items, async () => new Promise(() => {}))).rejects.toThrow();
    assertClean(items);
  });
  it("aborts callback and cleans up after an owned child dies", async () => {
    const items = roots(); let aborted = false;
    await expect(withPilotProofServers(items, async (_, signal) => {
      signal.addEventListener("abort", () => { aborted = true; });
      process.kill(Number(readFileSync(join(items.changed, "output/pid"), "utf8")), "SIGKILL");
      await new Promise(() => {});
    })).rejects.toThrow(/(?:exited|disconnected) unexpectedly/);
    expect(aborted).toBe(true); assertClean(items);
  });
  it("cleans up on callback failure and escalates TERM to KILL before releasing locks", async () => {
    const items = roots("stubborn");
    await expect(withPilotProofServers(items, async () => { throw new Error("capture failed"); })).rejects.toThrow("capture failed");
    assertClean(items);
  }, 15_000);
  it("rejects malformed IPC during shutdown after successful proof postchecks", async () => {
    const items = roots("shutdown-message");
    await expect(withPilotProofServers(items, async () => "must not pass")).rejects.toThrow("failed verification");
    assertClean(items);
  });
  it("interrupts callback on owner signal and releases locks after shutdown", async () => {
    const items = roots(); let aborted = false;
    await expect(withPilotProofServers(items, async (_, signal) => {
      signal.addEventListener("abort", () => { aborted = true; });
      process.emit("SIGTERM", "SIGTERM");
      await new Promise(() => {});
    })).rejects.toThrow("Proof interrupted");
    expect(aborted).toBe(true); assertClean(items);
  });
  it("times out an owned child which never reports readiness and stops its siblings", async () => {
    const items = roots("hang");
    await expect(withPilotProofServers(items, async () => "unexpected")).rejects.toThrow("startup timed out");
    assertClean(items);
  }, 40_000);
  it("stops a blocked configuration probe before releasing its root lock on owner interruption", async () => {
    const items = roots();
    put(items.changed, "node_modules/next/dist/server/config.js", `exports.default = async () => {
      const fs = require("node:fs"); fs.mkdirSync("output", {recursive:true});
      fs.writeFileSync("output/probe-pid", String(process.pid));
      process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);
      return {distDir:".next"};
    };`);
    const rejected = expect(withPilotProofServers(items, async () => "unexpected")).rejects.toThrow("Proof interrupted");
    await expect.poll(() => existsSync(join(items.changed, "output/probe-pid"))).toBe(true);
    const probe = Number(readFileSync(join(items.changed, "output/probe-pid"), "utf8"));
    process.emit("SIGTERM", "SIGTERM");
    await rejected;
    expect(() => process.kill(probe, 0)).toThrow();
    assertClean(items);
  }, 15_000);
  it("children exit after their owner is killed, leaving recoverable locks", async () => {
    const items = roots();
    const script = join(directory, "owner.mts");
    put(directory, "owner.mts", `import {withPilotProofServers} from ${JSON.stringify(join(project, "scripts/pilot-proof-servers.ts"))};
      withPilotProofServers(${JSON.stringify(items)}, async servers => { process.send(servers); await new Promise(() => {}); }).catch(() => { process.exitCode = 1; });`);
    const owner = fork(script, [], {execArgv:["--import", loader], stdio:["ignore", "ignore", "ignore", "ipc"]});
    try {
      await new Promise<void>((resolve, reject) => {
        owner.once("message", () => resolve()); owner.once("exit", () => reject(new Error("owner exited before ready")));
      });
      const children = Object.values(items).map(root => Number(readFileSync(join(root, "output/pid"), "utf8")));
      owner.kill("SIGKILL");
      await expect.poll(() => children.every(pid => {
        try { process.kill(pid, 0); return false; } catch { return true; }
      }), {timeout:5_000}).toBe(true);
      for (const root of Object.values(items)) {
        expect(existsSync(join(root, ".onzio-pilot-build.lock"))).toBe(true);
        rmSync(join(root, ".onzio-pilot-build.lock"));
      }
    } finally { owner.kill("SIGKILL"); }
    assertClean(items);
  }, 10_000);
  it("rejects obsolete URL flags in the real proof CLI before package or browser work", () => {
    const result = spawnSync(process.execPath, ["--import", loader, join(project, "scripts/prove-pilot-reconstruction.ts"), "--baseline", "http://alpha.localhost:3110"], { cwd: directory, encoding: "utf8", timeout: 10_000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown option '--baseline'");
    expect(existsSync(join(directory, "test-results"))).toBe(false);
  });
});
