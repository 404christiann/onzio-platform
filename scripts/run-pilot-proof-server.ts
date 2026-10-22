import { readPilotReconstructionIdentity } from "./pilot-source-package";
import { Server } from "node:http";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { z } from "zod";
import { loadPilotReconstructionEnvironment } from "./pilot-reconstruction-environment";
import { publicBuildEnvironmentSha256, verifyReconstructionBuild } from "./pilot-reconstruction-build";
import { checkedNextCommand } from "./pilot-reconstruction-next";
import { proofHostnameSchema, proofIdentitySchema, proofServerCommandSchema, type ProofIdentity } from "./pilot-proof-protocol";

process.on("disconnect", () => process.kill(-process.pid, "SIGKILL"));
function fail() {
  if (!process.connected) process.exit(1);
  process.send?.({ kind: "failure" }, () => process.exit(1));
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

async function main() {
  if (!process.send) throw new Error("Proof server requires its owner IPC channel");
  if (process.argv.length > 3) throw new Error("Proof server accepts only its owner-selected hostname");
  const hostname = proofHostnameSchema.parse(process.argv[2] ?? "alpha.localhost");
  const root = process.cwd();
  const environment = loadPilotReconstructionEnvironment(root);
  function receipt() {
    const runtime = { ...process.env };
    try {
      const current = loadPilotReconstructionEnvironment(root);
      const before = verifyReconstructionBuild(root, publicBuildEnvironmentSha256(current));
      const reconstruction = readPilotReconstructionIdentity(root);
      const after = verifyReconstructionBuild(root, publicBuildEnvironmentSha256(current));
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Proof build identity changed while reading reconstruction identity");
      return { ...after, reconstruction: reconstruction === null ? null : { digest: reconstruction.digest } };
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in runtime)) delete process.env[key];
      Object.assign(process.env, runtime);
    }
  }
  const initial = receipt();
  await checkedNextCommand(root, "start", environment, "proof-group");
  if (JSON.stringify(receipt()) !== JSON.stringify(initial)) throw new Error("Proof build identity changed");
  const require = createRequire(join(root, "package.json"));
  const { nextStart }: typeof import("next/dist/cli/next-start") = require(require.resolve("next/dist/cli/next-start"));
  await nextStart({ port: 0, hostname: "127.0.0.1" }, root);
  if (JSON.stringify(receipt()) !== JSON.stringify(initial)) throw new Error("Proof build identity changed during startup");
  async function actualRuntime() {
    const outputSchema = z.object({ distDir: z.string().min(1) });
    const context: typeof import("next/dist/server/lib/router-utils/router-server-context") = require("next/dist/server/lib/router-utils/router-server-context");
    const router = z.object({ nextConfig: outputSchema }).parse(context.routerServerGlobal[context.RouterServerContextSymbol]?.[relative(process.cwd(), root)]);
    const render: typeof import("next/dist/server/lib/render-server") = require("next/dist/server/lib/render-server");
    const renderer = outputSchema.parse(await render.getServerField(root, "renderOpts"));
    if (join(root, router.nextConfig.distDir) !== join(root, ".next") || renderer.distDir !== join(root, ".next")) {
      throw new Error("Proof server requires actual router and renderer to use normal .next output");
    }
    const initialized = await render.initialize({
      dir: root, port: 0, dev: false, experimentalTestProxy: false, experimentalHttpsServer: false,
      bundlerService: undefined, startServerSpan: undefined, onDevServerCleanup: undefined,
    });
    const server = initialized.server.options.httpServer;
    if (!(server instanceof Server) || !server.listening) throw new Error("Proof server requires its actual listening HTTP server");
    const address = z.object({ address: z.literal("127.0.0.1"), family: z.literal("IPv4"), port: z.number().int().min(1).max(65535) }).parse(server.address());
    return { server, port: address.port };
  }
  const listener = await actualRuntime();
  const port = listener.port;
  const identity: ProofIdentity = proofIdentitySchema.parse({ root, ...receipt(), origin: `http://${hostname}:${port}` });
  if (JSON.stringify({ buildId: identity.buildId, receiptSha256: identity.receiptSha256, reconstruction: identity.reconstruction }) !== JSON.stringify(initial)) throw new Error("Proof build identity changed during startup");
  process.on("message", async (value: unknown) => {
    try {
      proofServerCommandSchema.parse(value);
      if (JSON.stringify(receipt()) !== JSON.stringify(initial)) throw new Error("Proof build changed");
      const currentListener = await actualRuntime();
      if (currentListener.server !== listener.server || currentListener.port !== listener.port) throw new Error("Proof server listener changed");
      const current = proofIdentitySchema.parse({ ...identity, ...receipt() });
      if (JSON.stringify(current) !== JSON.stringify(identity)) throw new Error("Proof build changed");
      process.send?.({ kind: "verified", identity: current });
    } catch { fail(); }
  });
  process.send({ kind: "ready", identity });
}
void main().catch(fail);
