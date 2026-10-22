import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { checkedNextCommand } from "./pilot-reconstruction-next";
import { loadPilotReconstructionEnvironment } from "./pilot-reconstruction-environment";
import { assertSameReconstructionInputs, invalidateReconstructionBuild, publicBuildEnvironmentSha256, publishReconstructionBuild, reconstructionInputs, verifyReconstructionBuild, withReconstructionLock } from "./pilot-reconstruction-build";

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
void withReconstructionLock(root, async () => {
  if (action === "build") invalidateReconstructionBuild(root);
  const environment = loadPilotReconstructionEnvironment(root);
  const publicEnvironment = publicBuildEnvironmentSha256(environment);
  const inputs = reconstructionInputs(root);
  if (action === "start") verifyReconstructionBuild(root, publicEnvironment);
  const configurationEnvironment = action === "start" ? {
    ...environment,
    PORT: String(Number(values.port)),
    __NEXT_PRIVATE_ORIGIN: `http://127.0.0.1:${Number(values.port)}`,
  } : environment;
  const next = await checkedNextCommand(root, action, configurationEnvironment, "standalone");
  assertSameReconstructionInputs(inputs, reconstructionInputs(root));
  if (action === "start") verifyReconstructionBuild(root, publicEnvironment);
  const child = spawnSync(process.execPath, [next, ...args], { cwd: root, env: environment, stdio: "inherit" });
  if (child.error) throw new Error("Could not run local reconstruction command");
  process.exitCode = child.status ?? 1;
  if (action === "build" && child.status === 0 && child.signal === null) {
    assertSameReconstructionInputs(inputs, reconstructionInputs(root));
    publishReconstructionBuild(root, inputs, publicEnvironment);
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
