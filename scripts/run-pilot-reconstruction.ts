import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadPilotReconstructionEnvironment } from "./pilot-reconstruction-environment";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: "string" } } });
const [action] = positionals;
if (positionals.length !== 1 || action !== "build" && action !== "start") throw new Error("Use build or start --port LOCAL_PORT");
if (action === "build" && values.port !== undefined) throw new Error("The build command does not accept a port");
let args = ["build"];
if (action === "start") {
  const port = values.port;
  if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("A valid local start port is required");
  args = ["start", "--hostname", "127.0.0.1", "--port", port];
}
const root = process.cwd();
const environment = loadPilotReconstructionEnvironment(root);
const next = createRequire(join(root, "package.json")).resolve("next/dist/bin/next");
const child = spawnSync(process.execPath, [next, ...args], { cwd: root, env: environment, stdio: "inherit" });
if (child.error) throw new Error("Could not run local reconstruction command");
process.exitCode = child.status ?? 1;
