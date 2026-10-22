import { z } from "zod";
import { readPilotReconstructionIdentity, verifyPilotReconstructionInputs } from "./pilot-source-package";
import { fork } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { acquireReconstructionLock } from "./pilot-reconstruction-build";
import { proofHostnameSchema, proofServerMessageSchema, type PilotProofHostname, type ProofIdentity } from "./pilot-proof-protocol";

type ProofRoots = { baseline: string; changed: string; restored: string };
type ProofServers = { [Role in keyof ProofRoots]: ProofIdentity };
const startupTimeout = 30_000;
const shutdownTimeout = 5_000;

type OwnedIdentity = Readonly<Omit<ProofIdentity, "reconstruction">> & {
  readonly reconstruction: Readonly<NonNullable<ProofIdentity["reconstruction"]>> | null;
};
export type OwnedPilotScope<Roots extends Record<string, string> = Record<string, string>> = Readonly<{
  servers: Readonly<{ [Name in keyof Roots]: OwnedIdentity }>;
  signal: AbortSignal;
  verify(): Promise<void>;
}>;
const activeScopes = new WeakSet<object>();

export function assertOwnedPilotScope(value: unknown): asserts value is OwnedPilotScope {
  if (typeof value !== "object" || value === null || !activeScopes.has(value)) throw new Error("An active owned pilot scope is required");
  (value as OwnedPilotScope).signal.throwIfAborted();
}

function ownedServer(root: string, hostname: PilotProofHostname, fail: (error: Error) => void) {
  const child = fork(fileURLToPath(new URL("./run-pilot-proof-server.ts", import.meta.url)), [hostname], {
    cwd: root,
    detached: true,
    execArgv: ["--import", createRequire(import.meta.url).resolve("tsx")],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let closed = false;
  child.once("close", () => { closed = true; });
  let stopping = false;
  let state: "starting" | "running" | "verifying" = "starting";
  let identity: ProofIdentity;
  let accept: (identity: ProofIdentity) => void;
  let reject: (error: Error) => void;
  function wait() {
    return new Promise<ProofIdentity>((resolve, fail) => { accept = resolve; reject = fail; });
  }
  const ready = wait();
  void ready.catch(() => {});
  function failure(message: string) {
    const error = new Error(message);
    reject(error);
    fail(error);
  }
  child.on("error", () => failure("Could not launch owned proof server"));
  child.on("exit", () => { if (!stopping) failure("Owned proof server exited unexpectedly"); });
  child.on("disconnect", () => { if (!stopping) failure("Owned proof server disconnected unexpectedly"); });
  child.on("message", (value: unknown) => {
    const parsed = proofServerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.kind === "failure") return failure("Owned proof server failed verification");
    const message = parsed.data;
    if (message.identity.root !== root || new URL(message.identity.origin).hostname !== hostname || state === "starting" && message.kind !== "ready" || state === "verifying" && message.kind !== "verified" || state === "running") return failure("Unexpected owned proof server message");
    if (state === "verifying" && JSON.stringify(identity) !== JSON.stringify(message.identity)) return failure("Owned proof server identity changed");
    identity = message.identity;
    state = "running";
    accept(identity);
  });
  function signalGroup(signal: NodeJS.Signals | 0) {
    if (child.pid === undefined) return false;
    try { process.kill(-child.pid, signal); return true; }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
      throw new Error("Could not control owned proof process group");
    }
  }
  async function stoppedWithin(timeout: number) {
    const deadline = Date.now() + timeout;
    while (!closed || signalGroup(0)) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return true;
  }
  async function stop() {
    stopping = true;
    signalGroup("SIGTERM");
    if (await stoppedWithin(shutdownTimeout)) return;
    signalGroup("SIGKILL");
    if (!await stoppedWithin(shutdownTimeout)) throw new Error("Owned proof process group did not stop; local locks retained");
  }
  return {
    ready,
    stop,
    verify() {
      state = "verifying";
      const verified = wait();
      child.send({ kind: "verify" }, error => { if (error) failure("Could not verify owned proof server"); });
      return verified;
    },
  };
}

async function withOwnedServers<Roots extends Record<string, string>, T>(
  roots: Roots,
  hostname: PilotProofHostname,
  action: (scope: OwnedPilotScope<Roots>) => Promise<T>,
  inspect: (servers: OwnedPilotScope<Roots>["servers"]) => void = () => {},
): Promise<T> {
  if (process.platform === "win32") throw new Error("Owned proof servers require POSIX process groups");
  const entries = Object.entries(z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/), z.string().min(1)).parse(roots));
  if (!entries.length) throw new Error("Owned proof servers require a nonempty root map");
  const canonical = entries.map(([name, root]) => [name, realpathSync(root)] as const);
  if (new Set(canonical.map(([, root]) => root)).size !== canonical.length) throw new Error("Owned proof servers require distinct local roots");
  const controller = new AbortController();
  let failure: Error | undefined;
  const fail = (error: Error) => { failure ??= error; controller.abort(error); };
  const abort = () => fail(new Error("Proof interrupted"));
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  const failed = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
  void failed.catch(() => {});
  const releases: (() => void)[] = [];
  const children: ReturnType<typeof ownedServer>[] = [];
  let scope: OwnedPilotScope<Roots> | undefined;
  let result: T;
  try {
    for (const [, root] of canonical) releases.push(acquireReconstructionLock(root));
    for (const [, root] of canonical) children.push(ownedServer(root, hostname, fail));
    async function run() {
      const timer = setTimeout(() => fail(new Error("Owned proof server startup timed out")), startupTimeout);
      let identities: ProofIdentity[];
      try { identities = await Promise.race([Promise.all(children.map(child => child.ready)), failed]); }
      finally { clearTimeout(timer); }
      if (new Set(identities.map(item => item.origin)).size !== canonical.length) throw new Error("Proof servers require distinct owned listeners");
      const servers = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(canonical.map(([name], index) => {
        const identity = identities[index];
        const reconstruction = identity.reconstruction === null ? null : Object.freeze({ ...identity.reconstruction });
        return [name, Object.freeze({ ...identity, reconstruction })];
      })))) as OwnedPilotScope<Roots>["servers"];
      let checking: Promise<void> | undefined;
      const owner: OwnedPilotScope<Roots> = Object.freeze({
        servers,
        signal: controller.signal,
        async verify() {
          assertOwnedPilotScope(owner);
          checking ??= (async () => {
            const timer = setTimeout(() => fail(new Error("Owned proof server postcheck timed out")), startupTimeout);
            try {
              await Promise.race([Promise.all(children.map(child => child.verify())), failed]);
              controller.signal.throwIfAborted();
              inspect(servers);
            } finally { clearTimeout(timer); }
          })().finally(() => { checking = undefined; });
          await checking;
        },
      });
      scope = owner;
      activeScopes.add(owner);
      inspect(servers);
      const result = await action(owner);
      controller.signal.throwIfAborted();
      await owner.verify();
      return result;
    }
    result = await Promise.race([run(), failed]);
  } finally {
    if (scope) activeScopes.delete(scope);
    controller.abort(new Error("Proof scope closed"));
    try {
      await Promise.all(children.map(child => child.stop()));
      for (const release of releases.reverse()) release();
    } finally {
      process.off("SIGINT", abort);
      process.off("SIGTERM", abort);
    }
  }
  if (failure) throw failure;
  return result;
}

export function withOwnedPilotServers<Roots extends Record<string, string>, T>(
  roots: Roots,
  action: (scope: OwnedPilotScope<Roots>) => Promise<T>,
  options: { hostname?: PilotProofHostname } = {},
): Promise<T> {
  const hostname = proofHostnameSchema.parse(options.hostname ?? "alpha.localhost");
  return withOwnedServers(roots, hostname, action);
}

export async function withPilotProofServers<T>(roots: ProofRoots & { acceptedDigest?: string }, action: (servers: ProofServers, signal: AbortSignal) => Promise<T>): Promise<T> {
  const acceptedDigest = "acceptedDigest" in roots ? z.string().regex(/^[a-f0-9]{64}$/).parse(roots.acceptedDigest) : undefined;
  if (process.platform === "win32") throw new Error("Owned proof servers require POSIX process groups");
  const canonical = { baseline: realpathSync(roots.baseline), changed: realpathSync(roots.changed), restored: realpathSync(roots.restored) };
  if (new Set(Object.values(canonical)).size !== 3) throw new Error("Proof roles require three distinct local roots");
  return withOwnedServers(canonical, "alpha.localhost", scope => action(scope.servers, scope.signal), servers => {
    if (acceptedDigest === undefined) return;
    if (servers.restored.reconstruction?.digest !== acceptedDigest) throw new Error("Restored build differs from the externally accepted package");
    const reconstruction = readPilotReconstructionIdentity(canonical.restored);
    if (reconstruction === null || reconstruction.digest !== acceptedDigest) throw new Error("Accepted reconstruction identity differs");
    verifyPilotReconstructionInputs(canonical.baseline, reconstruction.manifest);
  });
}
