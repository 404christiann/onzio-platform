import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { UnsafeReconstructionCleanupError } from "./pilot-reconstruction-build";

type ProbeOwnership = "standalone" | "proof-group";
const probeTimeout = 5_000;
const shutdownTimeout = 5_000;

function liveGroupMembers(group: number, exclude?: number) {
  const listing = spawnSync("ps", ["-Ao", "pgid=,pid=,stat="], { encoding: "utf8", timeout: 2_000 });
  if (listing.error || listing.status !== 0) throw new UnsafeReconstructionCleanupError("Could not inspect configuration process group; local lock retained");
  return listing.stdout.split(/\r?\n/).flatMap(line => {
    const fields = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)/);
    if (!fields || Number(fields[1]) !== group || Number(fields[2]) === exclude || fields[3].startsWith("Z")) return [];
    const pid = Number(fields[2]);
    try { process.kill(pid, 0); return [pid]; }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return [];
      throw new UnsafeReconstructionCleanupError("Could not verify configuration process descendant; local lock retained");
    }
  });
}

function groupExists(pid: number) { return liveGroupMembers(pid).length > 0; }

function signalGroup(pid: number, signal: NodeJS.Signals) {
  try { process.kill(-pid, signal); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw new UnsafeReconstructionCleanupError("Could not stop configuration probe group; local lock retained");
    }
  }
}

async function waitForGroupExit(pid: number) {
  const deadline = Date.now() + shutdownTimeout;
  while (groupExists(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return true;
}

async function stopProbeGroup(pid: number) {
  if (!groupExists(pid)) return;
  signalGroup(pid, "SIGTERM");
  if (await waitForGroupExit(pid)) return;
  signalGroup(pid, "SIGKILL");
  if (!await waitForGroupExit(pid)) {
    throw new UnsafeReconstructionCleanupError("Configuration probe group did not stop; local lock retained");
  }
}

function proofGroupMembers() { return liveGroupMembers(process.pid, process.pid); }

async function stopProofGroupDescendants() {
  async function waitForEmpty(timeout: number) {
    const deadline = Date.now() + timeout;
    while (proofGroupMembers().length) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return true;
  }
  function signalMembers(signal: NodeJS.Signals) {
    for (const pid of proofGroupMembers()) {
      try { process.kill(pid, signal); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
          throw new UnsafeReconstructionCleanupError("Could not stop proof configuration descendant; local locks retained");
        }
      }
    }
  }
  signalMembers("SIGTERM");
  if (await waitForEmpty(shutdownTimeout)) return;
  signalMembers("SIGKILL");
  if (!await waitForEmpty(shutdownTimeout)) {
    throw new UnsafeReconstructionCleanupError("Proof configuration descendants did not stop; local locks retained");
  }
}

async function runWindowsProbe(root: string, environment: NodeJS.ProcessEnv, probe: string, config: string, constants: string, phase: string) {
  const child = spawn(process.execPath, ["-e", probe, config, constants, phase], {
    cwd: root, env: environment, stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const exited = new Promise<void>(resolve => { child.once("exit", () => resolve()); });
  const result = new Promise<boolean | "exited">(resolve => {
    child.once("message", (value: unknown) => {
      resolve(typeof value === "object" && value !== null && "kind" in value && value.kind === "configuration"
        && "ok" in value && value.ok === true);
    });
    child.once("error", () => resolve("exited"));
    child.once("exit", () => resolve("exited"));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), probeTimeout); });
  const verdict = await Promise.race([result, timed]);
  if (timer) clearTimeout(timer);
  if (child.pid === undefined) throw new Error("Configuration probe could not start");
  const killed = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: shutdownTimeout });
  if (killed.error || killed.status !== 0) {
    throw new UnsafeReconstructionCleanupError("Could not stop Windows configuration process tree; local lock retained");
  }
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>(resolve => { exitTimer = setTimeout(() => resolve(false), shutdownTimeout); }),
  ]);
  if (exitTimer) clearTimeout(exitTimer);
  if (!stopped) throw new UnsafeReconstructionCleanupError("Windows configuration probe did not exit; local lock retained");
  if (verdict !== true) throw new Error("Configuration probe failed");
}

async function runProbe(root: string, environment: NodeJS.ProcessEnv, probe: string, config: string, constants: string, phase: string, ownership: ProbeOwnership) {
  if (process.platform === "win32") {
    if (ownership !== "standalone") throw new Error("Owned proof servers require POSIX process groups");
    return runWindowsProbe(root, environment, probe, config, constants, phase);
  }
  const child = spawn(process.execPath, ["-e", probe, config, constants, phase], {
    cwd: root, env: environment, stdio: "ignore", detached: ownership === "standalone",
  });
  const outcome = new Promise<{ status: number | null; signal: NodeJS.Signals | null; error?: Error }>(resolve => {
    child.once("error", error => resolve({ status: null, signal: null, error }));
    child.once("exit", (status, signal) => resolve({ status, signal }));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), probeTimeout); });
  const result = await Promise.race([outcome, timed]);
  if (timer) clearTimeout(timer);
  if (ownership === "standalone") {
    if (child.pid === undefined) throw new Error("Configuration probe could not start");
    await stopProbeGroup(child.pid);
    if (result === "timeout") await outcome;
  } else {
    await stopProofGroupDescendants();
    if (result === "timeout") await outcome;
  }
  if (result === "timeout" || result.error || result.signal !== null || result.status !== 0) throw new Error("Configuration probe failed");
}

export async function checkedNextCommand(root: string, action: "build" | "start", environment: NodeJS.ProcessEnv, ownership: ProbeOwnership) {
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
      if (process.send) process.on("disconnect", () => {
        require("node:child_process").spawnSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], { stdio: "ignore" });
        process.exit(1);
      });
      Promise.resolve().then(() => loadConfig(phase, process.cwd(), { silent: true })).then(config => {
        const ok = join(process.cwd(), config.distDir) === join(process.cwd(), ".next");
        if (process.send) { process.send({ kind: "configuration", ok }); setInterval(() => {}, 1000); }
        else process.exitCode = ok ? 0 : 1;
      }).catch(() => {
        if (process.send) { process.send({ kind: "configuration", ok: false }); setInterval(() => {}, 1000); }
        else process.exitCode = 1;
      });
    `;
    for (const phase of phases) await runProbe(root, environment, probe, config, constants, phase, ownership);
    return require.resolve("next/dist/bin/next");
  } catch (error) {
    if (error instanceof UnsafeReconstructionCleanupError) throw error;
    throw new Error("Reconstruction requires loadable Next configuration with normal .next output");
  }
}
