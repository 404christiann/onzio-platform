import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

export function checkedNextCommand(root: string, action: "build" | "start", environment: NodeJS.ProcessEnv) {
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
      const child = spawnSync(process.execPath, ["-e", probe, config, constants, phase], { cwd: root, env: environment, stdio: "pipe", timeout: 5_000, killSignal: "SIGKILL" });
      if (child.error || child.signal !== null || child.status !== 0) throw new Error();
    }
    return require.resolve("next/dist/bin/next");
  } catch { throw new Error("Reconstruction requires loadable Next configuration with normal .next output"); }
}
