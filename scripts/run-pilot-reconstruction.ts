import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadPilotReconstructionEnvironment } from "./pilot-reconstruction-environment";
import { assertSameReconstructionInputs, invalidateReconstructionBuild, publicBuildEnvironmentSha256, publishReconstructionBuild, reconstructionInputs, verifyReconstructionBuild, withReconstructionLock } from "./pilot-reconstruction-build";

function checkedNextCommand(root: string, action: "build" | "start", environment: NodeJS.ProcessEnv) {
  try {
    const require = createRequire(join(root, "package.json"));
    const config = require.resolve("next/dist/server/config");
    const constants = require.resolve("next/constants");
    const phases = action === "build" ? ["PHASE_PRODUCTION_BUILD", "PHASE_PRODUCTION_SERVER"] : ["PHASE_PRODUCTION_SERVER"];
    const probe = `
      process.exitCode = 1;
      const loadConfig = require(process.argv[1]).default;
      const phase = require(process.argv[2])[process.argv[3]];
      const { join } = require("node:path");
      Promise.resolve().then(() => loadConfig(phase, process.cwd(), { silent: true })).then(config => {
        if (join(process.cwd(), config.distDir) === join(process.cwd(), ".next")) process.exitCode = 0;
      }).catch(() => { process.exitCode = 1; });
    `;
    for (const phase of phases) {
      const child = spawnSync(process.execPath, ["-e", probe, config, constants, phase], { cwd: root, env: environment, stdio: "pipe" });
      if (child.error || child.signal !== null || child.status !== 0) throw new Error();
    }
    return require.resolve("next/dist/bin/next");
  } catch { throw new Error("Reconstruction requires loadable Next configuration with normal .next output"); }
}

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
withReconstructionLock(root, () => {
  if (action === "build") invalidateReconstructionBuild(root);
  const environment = loadPilotReconstructionEnvironment(root);
  const publicEnvironment = publicBuildEnvironmentSha256(environment);
  const inputs = reconstructionInputs(root);
  if (action === "start") verifyReconstructionBuild(root, publicEnvironment);
  const next = checkedNextCommand(root, action, environment);
  assertSameReconstructionInputs(inputs, reconstructionInputs(root));
  if (action === "start") verifyReconstructionBuild(root, publicEnvironment);
  const child = spawnSync(process.execPath, [next, ...args], { cwd: root, env: environment, stdio: "inherit" });
  if (child.error) throw new Error("Could not run local reconstruction command");
  process.exitCode = child.status ?? 1;
  if (action === "build" && child.status === 0 && child.signal === null) {
    assertSameReconstructionInputs(inputs, reconstructionInputs(root));
    publishReconstructionBuild(root, inputs, publicEnvironment);
  }
});
