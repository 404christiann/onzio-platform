import { createHash, randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Client } from "pg";
import { z } from "zod";
import { homepageRendererForClub, resolveHomepageBindings, resolveHomepageCapabilities } from "../lib/homepage-editor/capabilities";
import { parsePresentationDocument } from "../packages/presentation";
import { reconstructionInputs } from "./pilot-reconstruction-build";
import { assertOwnedPilotScope, type OwnedPilotScope } from "./pilot-proof-servers";
import { readPilotReconstructionIdentity, verifyPilotReconstructionInputs, verifyPilotSource } from "./pilot-source-package";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = z.object({ key: z.string().min(1), revision: z.number().int().positive().safe() }).strict();
const eventSchema = z.object({
  clubId: z.uuid(), id: z.uuid(), previousId: z.uuid().nullable(), digest: digestSchema.nullable(),
  legacyId: z.uuid().nullable(), documentId: z.uuid(), binding: bindingSchema.nullable(),
  platform: digestSchema.nullable(), lockHash: digestSchema.nullable(), bindingHash: digestSchema.nullable(),
  configuration: z.unknown(),
}).strict().refine(event => (event.digest === null) !== (event.legacyId === null));
const snapshotSchema = z.object({
  generation: z.uuid(), members: z.array(z.uuid()), pointer: z.uuid().nullable(),
  event: eventSchema.nullable(), previousDigest: digestSchema.nullable(),
}).strict();
const configSchema = z.object({
  schema: z.string().regex(/^site_coordination_[a-f0-9]{32}$/), clubId: z.uuid(), actorId: z.uuid(),
  releases: z.array(z.object({ directory: z.string().min(1), digest: digestSchema, documentId: z.uuid() }).strict()).min(1),
  workers: z.array(z.object({ name: z.string().min(1), releases: z.record(digestSchema, z.string().min(1)) }).strict()).min(1),
  currentPlatformSlot: z.string().min(1),
  runtime: z.object({
    node: z.string(), modules: z.string(), platform: z.string(), arch: z.string(), next: z.string(), nodeModules: z.string(),
  }).strict(),
}).strict();
type Snapshot = z.infer<typeof snapshotSchema>;
type Assignment = z.infer<typeof eventSchema>;
export type PilotSiteConfiguration = z.infer<typeof configSchema>;
export type PilotSiteTransition = { expected: string | null; target: string | { legacy: string }; action?: "publish" | "rollback" };
export type PilotSiteResolution =
  | { kind: "published"; event: Assignment; worker: string; origin: string; document: (path: "/" | "/admin/homepage") => string }
  | { kind: "legacy"; event: Assignment }
  | { kind: "missing" | "invalid" | "unavailable" | "lookup-failed" };

export function pilotRuntimeContract(root: string) {
  const require = createRequire(join(root, "package.json"));
  const next = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(require.resolve("next/package.json"), "utf8"))).version;
  return { node: process.version, modules: process.versions.modules, platform: process.platform, arch: process.arch, next, nodeModules: realpathSync(join(root, "node_modules")) };
}

export async function createPilotSiteCoordinator(scope: OwnedPilotScope, db: Client, input: PilotSiteConfiguration) {
  assertOwnedPilotScope(scope);
  if (db.host !== "127.0.0.1" || db.port !== 54322) throw new Error("LOCAL_COORDINATION_DATABASE_REQUIRED");
  const config = configSchema.parse(input);
  const schema = config.schema;
  await scope.verify();
  const accepted = config.releases.map(spec => {
    const { manifest, digest } = verifyPilotSource(spec.directory, spec.digest);
    if (manifest.format !== "onzio-pilot-source@2") throw new Error("COORDINATION_REQUIRES_V2");
    return { ...spec, manifest, digest };
  });
  if (new Set(accepted.map(item => item.digest)).size !== accepted.length || new Set(config.workers.map(worker => worker.name)).size !== config.workers.length) throw new Error("DUPLICATE_COORDINATION_IDENTITY");
  const visualPaths = new Set(accepted.flatMap(release => release.manifest.files.filter(file => file.path.startsWith("source/") || file.path.startsWith("bindings/")).map(file => file.path.slice(file.path.indexOf("/") + 1))));
  function platformFingerprint(root: string) {
    return hash(JSON.stringify(reconstructionInputs(root).filter(file => !visualPaths.has(file.path) && file.path !== ".onzio-pilot-reconstruction.json")));
  }
  const reference = scope.servers[config.currentPlatformSlot];
  if (!reference) throw new Error("CURRENT_PLATFORM_UNAVAILABLE");
  const platform = platformFingerprint(reference.root);
  function publicEnvironment(root: string) {
    return z.object({ publicEnvironmentSha256: digestSchema }).parse(JSON.parse(readFileSync(join(root, ".next/onzio-pilot-build.json"), "utf8"))).publicEnvironmentSha256;
  }
  const environment = publicEnvironment(reference.root);
  const bindings = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(homepageRendererForClub({ presentationTemplateKey: "academy@1", slug: "pilot" })) });
  const binding = { key: bindings.key, revision: bindings.revision };
  const slots = new Set<string>();
  const workers = config.workers.map(spec => ({ ...spec, id: randomUUID(), capabilities: new Map<string, { slot: string; commitment: string }>() }));
  for (const worker of workers) for (const [digest, slot] of Object.entries(worker.releases)) {
    if (slots.has(slot)) throw new Error("WORKERS_REQUIRE_DISTINCT_INSTANCES");
    slots.add(slot);
    const release = accepted.find(item => item.digest === digest);
    const identity = scope.servers[slot];
    if (!release || !identity) throw new Error("RELEASE_UNAVAILABLE");
    verifyPilotReconstructionInputs(identity.root, release.manifest);
    const reconstruction = readPilotReconstructionIdentity(identity.root);
    if (identity.reconstruction?.digest !== digest || reconstruction?.digest !== digest) throw new Error("ACCEPTED_RECONSTRUCTION_DIFFERS");
    if (JSON.stringify(pilotRuntimeContract(identity.root)) !== JSON.stringify(config.runtime)) throw new Error("UNSUPPORTED_PILOT_RUNTIME");
    if (platformFingerprint(identity.root) !== platform) throw new Error("CURRENT_PLATFORM_DIFFERS");
    if (publicEnvironment(identity.root) !== environment) throw new Error("PUBLIC_BUILD_ENVIRONMENT_DIFFERS");
    worker.capabilities.set(digest, { slot, commitment: hash(JSON.stringify({ identity, digest, platform, environment, runtime: config.runtime })) });
  }
  const registrations = accepted.map(release => {
    const bindingFile = release.manifest.files.find(file => file.path === "bindings/lib/homepage-editor/capabilities.ts");
    if (!bindingFile || hash(readFileSync(new URL("../lib/homepage-editor/capabilities.ts", import.meta.url))) !== bindingFile.sha256) throw new Error("UNSUPPORTED_PILOT_BINDING");
    return [config.clubId, release.digest, release.documentId, binding, platform, release.manifest.packageLockSha256, bindingFile.sha256];
  });
  await db.query("begin");
  try {
    for (const registration of registrations) await db.query(`select ${schema}.register_release($1,$2,$3,$4,$5,$6,$7)`, registration);
    for (const worker of workers) await db.query(`select ${schema}.register_worker($1,$2)`, [worker.id, JSON.stringify([...worker.capabilities].map(([digest, capability]) => ({ clubId: config.clubId, digest, commitment: capability.commitment })))]);
    await scope.verify();
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }

  async function verify() { assertOwnedPilotScope(scope); await scope.verify(); scope.signal.throwIfAborted(); }
  async function snapshot(): Promise<Snapshot> {
    assertOwnedPilotScope(scope);
    return snapshotSchema.parse((await db.query(`select ${schema}.snapshot($1) as data`, [config.clubId])).rows[0].data);
  }
  function validEvent(state: Snapshot) {
    const event = state.event;
    if (!event) return true;
    if (event.clubId !== config.clubId || state.pointer !== event.documentId) return false;
    try { parsePresentationDocument(event.configuration, { surface: "production" }); } catch { return false; }
    if (event.legacyId !== null) return event.documentId === event.legacyId;
    const release = accepted.find(item => item.digest === event.digest);
    const bindingFile = release?.manifest.files.find(file => file.path === "bindings/lib/homepage-editor/capabilities.ts");
    return release !== undefined && event.documentId === release.documentId && JSON.stringify(event.binding) === JSON.stringify(binding)
      && event.platform === platform && event.lockHash === release.manifest.packageLockSha256 && event.bindingHash === bindingFile?.sha256;
  }
  function supports(state: Snapshot, digests: (string | null)[]) {
    if (!state.members.length) throw new Error("NO_TRAFFIC");
    for (const id of state.members) {
      const worker = workers.find(item => item.id === id);
      if (!worker || digests.some(digest => digest !== null && !worker.capabilities.has(digest))) throw new Error("RELEASE_UNAVAILABLE");
    }
  }
  const plans = new WeakMap<object, { transition: PilotSiteTransition; generation: string }>();
  async function prepare(transition: PilotSiteTransition) {
    await verify();
    z.object({ expected: z.uuid().nullable(), target: z.union([digestSchema, z.object({ legacy: z.uuid() }).strict()]), action: z.enum(["publish", "rollback"]).optional() }).strict().parse(transition);
    const state = await snapshot();
    if (!validEvent(state)) throw new Error("ASSIGNMENT_INVALID");
    if ((state.event?.id ?? null) !== transition.expected) throw new Error("ASSIGNMENT_CHANGED");
    if (typeof transition.target === "string") {
      if (!accepted.some(item => item.digest === transition.target)) throw new Error("RELEASE_UNAVAILABLE");
      supports(state, [transition.target, state.event?.digest ?? null]);
    }
    const plan = Object.freeze({});
    plans.set(plan, { transition: structuredClone(transition), generation: state.generation });
    return plan;
  }
  async function commit(plan: object) {
    const prepared = plans.get(plan);
    if (!prepared) throw new Error("INVALID_ACTIVATION_PLAN");
    await verify();
    const transition = prepared.transition;
    const id = z.uuid().parse((await db.query(`select ${schema}.transition($1,$2,$3,$4,$5,$6,$7) as id`, [config.clubId, transition.expected, prepared.generation,
      typeof transition.target === "string" ? transition.target : null, typeof transition.target === "string" ? null : transition.target.legacy, config.actorId, transition.action ?? "publish"])).rows[0].id);
    await verify();
    return id;
  }
  async function resolve(workerName?: string): Promise<PilotSiteResolution> {
    try { await verify(); } catch { return { kind: "unavailable" }; }
    let state: Snapshot;
    try {
      const raw = (await db.query(`select ${schema}.snapshot($1) as data`, [config.clubId])).rows[0].data;
      const parsed = snapshotSchema.safeParse(raw);
      if (!parsed.success) return { kind: "invalid" };
      state = parsed.data;
    } catch { return { kind: "lookup-failed" }; }
    if (!state.event) return { kind: "missing" };
    if (!validEvent(state)) return { kind: "invalid" };
    const event = state.event;
    if (event.legacyId !== null) return { kind: "legacy", event };
    const worker = workers.find(item => state.members.includes(item.id) && (workerName === undefined || item.name === workerName));
    const capability = event.digest === null ? undefined : worker?.capabilities.get(event.digest);
    const server = capability && scope.servers[capability.slot];
    if (!worker || !server) return { kind: "unavailable" };
    return { kind: "published", event, worker: worker.name, origin: server.origin,
      document: path => `${server.origin}${z.enum(["/", "/admin/homepage"]).parse(path)}` };
  }
  return {
    clubId: config.clubId, snapshot,
    async replaceTraffic(expectedGeneration: string, names: readonly string[]) {
      await verify();
      const members = names.map(name => { const worker = workers.find(item => item.name === name); if (!worker) throw new Error("UNKNOWN_WORKER"); return worker.id; });
      const generation = z.uuid().parse((await db.query(`select ${schema}.replace_fleet($1,$2) as generation`, [z.uuid().parse(expectedGeneration), members])).rows[0].generation);
      await verify();
      return generation;
    },
    prepare, commit, resolve,
    async activate(transition: PilotSiteTransition) { return commit(await prepare(transition)); },
    async documentAllowed(origin: string) {
      assertOwnedPilotScope(scope);
      const state = await snapshot();
      const digest = state.event?.digest;
      if (!validEvent(state) || !digest) return false;
      return workers.some(worker => state.members.includes(worker.id) && scope.servers[worker.capabilities.get(digest)?.slot ?? ""]?.origin === origin);
    },
  };
}
