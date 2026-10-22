import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { packPilotSource, reconstructPilotSource } from "../../scripts/pilot-source-package";

const project = resolve(import.meta.dirname, "../..");
const loader = createRequire(import.meta.url).resolve("tsx");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const visualRoots = ["components/sites/diverse-city/HomePage.tsx", "components/Nav.tsx", "components/Footer.tsx", "components/TemplateFontScope.tsx", "components/AcademyRouteLoadingSkeleton.tsx", "components/ChampionsBadge.tsx", "app/layout.tsx", "styles/globals.css", "tailwind.config.ts", "postcss.config.mjs"];

export function coordinationFixture() {
  const directory = mkdtempSync(join(tmpdir(), "onzio-coordination-"));
  const modules = join(directory, "dependencies/node_modules");
  function put(root: string, path: string, value: string | Buffer) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value);
  }
  put(modules, "next/package.json", '{"name":"next","version":"1.0.0"}');
  put(modules, "next/constants.js", 'exports.PHASE_PRODUCTION_BUILD="build";exports.PHASE_PRODUCTION_SERVER="server";');
  put(modules, "next/dist/server/config.js", 'exports.default=async()=>({distDir:".next"});');
  put(modules, "next/dist/bin/next", `const fs=require("node:fs"),path=require("node:path");
    for(const [name,bytes] of Object.entries({"BUILD_ID":"synthetic-coordination", "server/page.js":"synthetic server", "static/page.js":"synthetic client", "static/css/site.css":"body{color:navy}", "static/media/font.woff2":"synthetic font"})){
      fs.mkdirSync(path.dirname(".next/"+name),{recursive:true});fs.writeFileSync(".next/"+name,bytes);
    }`);
  put(modules, "next/dist/server/lib/router-utils/router-server-context.js", 'exports.RouterServerContextSymbol=Symbol.for("coordination-router");exports.routerServerGlobal=globalThis;');
  put(modules, "next/dist/server/lib/render-server.js", 'exports.servers=new Map();exports.getServerField=async root=>exports.servers.get(root).renderOpts;exports.initialize=async({dir})=>exports.servers.get(dir);');
  put(modules, "next/dist/cli/next-start.js", `exports.nextStart=async(options,root)=>{
    const path=require("node:path"),server=require("node:http").createServer((req,res)=>res.end("synthetic owned server"));
    await new Promise(resolve=>server.listen(options.port,options.hostname,resolve));
    const {routerServerGlobal,RouterServerContextSymbol}=require("../server/lib/router-utils/router-server-context");
    routerServerGlobal[RouterServerContextSymbol]={[path.relative(process.cwd(),root)]:{nextConfig:{distDir:".next"}}};
    require("../server/lib/render-server").servers.set(root,{renderOpts:{distDir:path.join(root,".next")},server:{options:{httpServer:server}}});
  };`);
  function build(root: string) {
    const result = spawnSync(process.execPath, ["--import", loader, join(project, "scripts/run-pilot-reconstruction.ts"), "build"], {
      cwd: root, encoding: "utf8", timeout: 15_000, env: { ...process.env, NODE_ENV: "test" },
    });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  }
  function source(label: string) {
    const root = join(directory, `source-${label}`);
    for (const file of visualRoots) put(root, file, file.endsWith(".css") ? "body{color:navy}" : "export {};");
    put(root, visualRoots[0], `import "@/components/ClubContextProvider";export const visual=${JSON.stringify(label)};`);
    put(root, "components/ClubContextProvider.tsx", 'export const security="current platform";');
    put(root, "lib/homepage-editor/capabilities.ts", readFileSync(join(project, "lib/homepage-editor/capabilities.ts")));
    put(root, "public/kit.png", "synthetic kit image");
    put(root, "package.json", '{"private":true}');
    put(root, "package-lock.json", JSON.stringify({ packages: Object.fromEntries(["next", "react", "react-dom", "typescript", "tailwindcss", "tailwindcss-animate", "postcss", "autoprefixer"].map(name => [`node_modules/${name}`, { version: "1.0.0" }])) }));
    put(root, "next.config.mjs", "export default {};");
    put(root, ".gitignore", "node_modules\n.next\n.env.local\noutput\n");
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Local synthetic test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "Synthetic coordination source"], { cwd: root });
    attach(root); build(root);
    return root;
  }
  function attach(root: string) {
    symlinkSync(modules, join(root, "node_modules"));
    put(root, ".env.local", "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_COORDINATION_FIXTURE=same\n");
  }
  function release(label: string) {
    const original = source(label);
    const packaged = packPilotSource({ root: original, buildRoot: original, output: join(directory, `package-${label}`) });
    const root = join(directory, `installed-${label}`);
    reconstructPilotSource({ root: original, directory: packaged.directory, expectedDigest: packaged.digest, output: root });
    attach(root); build(root);
    return { ...packaged, root, original };
  }
  const a = release("a"), b = release("b");
  let sequence = 0;
  function copyRoot(root: string, change?: (root: string) => void) {
    const target = join(directory, `copy-${sequence++}`);
    cpSync(root, target, { recursive: true, verbatimSymlinks: true });
    if (change) { change(target); build(target); }
    return target;
  }
  function alias(change: (manifest: Record<string, unknown>, root: string) => void) {
    const target = join(directory, `alias-${sequence++}`);
    cpSync(a.directory, target, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(target, "manifest.json"), "utf8"));
    change(manifest, target); put(target, "manifest.json", JSON.stringify(manifest));
    return { directory: target, digest: hash(JSON.stringify(manifest)) };
  }
  return { directory, a, b, newA: copyRoot(a.root), copyRoot, alias, put, close: () => rmSync(directory, { recursive: true, force: true }) };
}
