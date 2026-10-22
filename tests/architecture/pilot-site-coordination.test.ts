import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOwnedPilotServers, type OwnedPilotScope } from "../../scripts/pilot-proof-servers";
import { createPilotSiteCoordinator, pilotRuntimeContract, type PilotSiteConfiguration } from "../../scripts/pilot-site-coordination";
import { coordinationFixture } from "../helpers/pilot-coordination-fixture";

const clubId = "11111111-1111-4111-8111-111111111111";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const documentA = "10000000-0000-4000-8000-000000000001";
const documentB = "10000000-0000-4000-8000-000000000002";
const binding = { key: "legacy/homepage-story/home-kit/full-hero/no-caption", revision: 1 };
function projection() {
  return {
    schemaVersion: 1, template: { id: "academy", version: 1 }, fontPack: "montserrat-inter-dmsans",
    theme: {
      surface: { canvas: "#FFFFFF", elevated: "#FFFFFF", subtle: "#EEEEEE", inverse: "#111111" },
      text: { primary: "#111111", secondary: "#222222", muted: "#333333", inverse: "#FFFFFF" },
      action: { primary: "#111111", primaryHover: "#222222", primaryText: "#FFFFFF", secondary: "#333333" },
      border: { subtle: "#EEEEEE", strong: "#111111" }, status: { success: "#008800", warning: "#886600", danger: "#880000" },
    },
    modules: {}, homepage: { sections: [{ id: "hero", type: "academy.hero", enabled: true, emptyBehavior: "hide", config: {} }] },
    navigation: { groups: [] }, metadata: { recommendationId: null, createdBy: actorId, createdAt: "2026-10-22T00:00:00Z", sourceArtifact: null },
  };
}
let fixture: ReturnType<typeof coordinationFixture>;
beforeAll(() => { fixture = coordinationFixture(); }, 60_000);
afterAll(() => fixture?.close());

function registry() {
  const releases = new Map<string, unknown[]>();
  const workers = new Map<string, { clubId: string; digest: string; commitment: string }[]>();
  const transitions: unknown[][] = [];
  let stagedReleases = releases, stagedWorkers = workers;
  const state: { generation: string; members: string[]; pointer: string | null; event: Record<string, unknown> | null; previousDigest: string | null } = {
    generation: randomUUID(), members: [], pointer: documentA, event: null, previousDigest: null,
  };
  let lookupError = false, failRegistration = false;
  const db = {
    host: "127.0.0.1", port: 54322,
    async query(sql: string, values: unknown[] = []) {
      if (sql.toLowerCase() === "begin") { stagedReleases = new Map(releases); stagedWorkers = new Map(workers); return { rows: [] }; }
      if (sql.toLowerCase() === "rollback") { stagedReleases = releases; stagedWorkers = workers; return { rows: [] }; }
      if (sql.toLowerCase() === "commit") {
        for (const [key, value] of stagedReleases) releases.set(key, value);
        for (const [key, value] of stagedWorkers) workers.set(key, value);
        stagedReleases = releases; stagedWorkers = workers;
        return { rows: [] };
      }
      if (sql.includes(".register_release(")) {
        if (failRegistration && stagedReleases.size > 0) throw new Error("INVALID_PROJECTION");
        stagedReleases.set(String(values[1]), values); return { rows: [] };
      }
      if (sql.includes(".register_worker(")) { stagedWorkers.set(String(values[0]), JSON.parse(String(values[1]))); return { rows: [] }; }
      if (sql.includes(".snapshot(")) {
        if (lookupError) throw new Error("database unavailable");
        return { rows: [{ data: structuredClone(state) }] };
      }
      if (sql.includes(".transition(")) { transitions.push(values); return { rows: [{ id: randomUUID() }] }; }
      throw new Error(`Unexpected registry boundary ${sql}`);
    },
  } as unknown as Client;
  function publish(digest: string, memberIds = [...workers.keys()]) {
    const release = releases.get(digest);
    if (!release) throw new Error("Missing accepted fixture release");
    state.pointer = String(release[2]); state.members = memberIds;
    state.event = {
      clubId, id: randomUUID(), previousId: null, digest, legacyId: null, documentId: release[2],
      binding: release[3], platform: release[4], lockHash: release[5], bindingHash: release[6],
      configuration: projection(),
    };
  }
  return { db, state, releases, workers, transitions, publish,
    failLookup: () => { lookupError = true; }, failSecondRegistration: () => { failRegistration = true; } };
}

function configuration(): PilotSiteConfiguration {
  return {
    schema: `site_coordination_${"a".repeat(32)}`, clubId, actorId,
    releases: [
      { directory: fixture.a.directory, digest: fixture.a.digest, documentId: documentA },
      { directory: fixture.b.directory, digest: fixture.b.digest, documentId: documentB },
    ],
    workers: [
      { name: "old", releases: { [fixture.a.digest]: "oldA" } },
      { name: "new", releases: { [fixture.a.digest]: "newA", [fixture.b.digest]: "newB" } },
    ],
    currentPlatformSlot: "newB", runtime: pilotRuntimeContract(fixture.b.root),
  };
}
function roots() { return { oldA: fixture.a.root, newA: fixture.newA, newB: fixture.b.root }; }
async function rejectConfiguration(change: (config: PilotSiteConfiguration) => void, expected: string | RegExp, actualRoots = roots()) {
  const data = registry(), config = configuration(); change(config);
  await withOwnedPilotServers(actualRoots, async scope => {
    await expect(createPilotSiteCoordinator(scope, data.db, config)).rejects.toThrow(expected);
    expect(data.releases.size).toBe(0); expect(data.workers.size).toBe(0);
  });
}
function substituteA(config: PilotSiteConfiguration, alias: { directory: string; digest: string }) {
  config.releases[0] = { ...alias, documentId: documentA };
  config.workers[0].releases = { [alias.digest]: "oldA" };
  config.workers[1].releases = { [alias.digest]: "newA", [fixture.b.digest]: "newB" };
}

describe("accepted pilot coordinator boundaries", () => {
  it("rejects manufactured ready objects before any registration", async () => {
    const data = registry();
    const forged = { servers: {}, signal: new AbortController().signal, verify: async () => {} };
    await expect(createPilotSiteCoordinator(forged as OwnedPilotScope, data.db, configuration())).rejects.toThrow("active owned pilot scope");
    expect(data.releases.size).toBe(0); expect(data.workers.size).toBe(0);
  });
  it.each([{ host: "db.example.invalid", port: 54322 }, { host: "127.0.0.1", port: 5432 }])("rejects nonlocal database adapter $host:$port before registration", async address => {
    const data = registry(); Object.assign(data.db, address);
    await withOwnedPilotServers(roots(), async scope => {
      await expect(createPilotSiteCoordinator(scope, data.db, configuration())).rejects.toThrow("LOCAL_COORDINATION_DATABASE_REQUIRED");
      expect(data.releases.size).toBe(0); expect(data.workers.size).toBe(0);
    });
  });
  it("does not admit a package under the wrong external digest", async () => {
    await rejectConfiguration(config => { config.releases[0].digest = "0".repeat(64); }, "Package digest differs");
  });
  it("rejects metadata-only accepted aliases that differ from the installed reconstruction", async () => {
    const alias = fixture.alias(manifest => { manifest.sourceCommit = "f".repeat(40); });
    await rejectConfiguration(config => substituteA(config, alias), "ACCEPTED_RECONSTRUCTION_DIFFERS");
  });
  it("rejects an otherwise valid generic build without accepted reconstruction identity", async () => {
    await rejectConfiguration(() => {}, "ACCEPTED_RECONSTRUCTION_DIFFERS", { ...roots(), oldA: fixture.a.original });
  });
  it.each(["lock", "binding"])("rejects changed accepted %s meaning before registration", async field => {
    const alias = fixture.alias((manifest, directory) => {
      if (field === "lock") { manifest.packageLockSha256 = "0".repeat(64); return; }
      const entries = manifest.files as { path: string; sha256: string; bytes: number }[];
      const entry = entries.find(file => file.path === "bindings/lib/homepage-editor/capabilities.ts");
      if (!entry) throw new Error("Binding fixture entry required");
      const bytes = Buffer.concat([readFileSync(join(directory, entry.path)), Buffer.from("\n")]);
      fixture.put(directory, entry.path, bytes);
      entry.bytes = bytes.length; entry.sha256 = createHash("sha256").update(bytes).digest("hex");
    });
    await rejectConfiguration(config => substituteA(config, alias), field === "lock" ? "Dependency lock differs" : "Retained reconstruction input differs");
  });
  it.each(["node", "modules", "next", "nodeModules"] as const)("rejects unsupported %s runtime contracts", async field => {
    await rejectConfiguration(config => { config.runtime[field] = "unsupported"; }, "UNSUPPORTED_PILOT_RUNTIME");
  });
  it("rejects old shared platform code even when retained visual identity remains valid", async () => {
    const old = fixture.copyRoot(fixture.a.root, root => fixture.put(root, "components/ClubContextProvider.tsx", 'export const security="old platform";'));
    await rejectConfiguration(() => {}, "CURRENT_PLATFORM_DIFFERS", { ...roots(), oldA: old });
  });
  it("rejects a different selected public build environment", async () => {
    const changed = fixture.copyRoot(fixture.a.root, root => fixture.put(root, ".env.local", "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_COORDINATION_FIXTURE=different\n"));
    await rejectConfiguration(() => {}, "PUBLIC_BUILD_ENVIRONMENT_DIFFERS", { ...roots(), oldA: changed });
  });
  it("does not advertise one owned instance as two independent workers", async () => {
    await rejectConfiguration(config => { config.workers[1].releases[fixture.a.digest] = "oldA"; }, "WORKERS_REQUIRE_DISTINCT_INSTANCES");
  });
  it("rolls back all staged registrations if a later projection rejects", async () => {
    const data = registry(); data.failSecondRegistration();
    await withOwnedPilotServers(roots(), async scope => {
      await expect(createPilotSiteCoordinator(scope, data.db, configuration())).rejects.toThrow("INVALID_PROJECTION");
      expect(data.releases.size).toBe(0); expect(data.workers.size).toBe(0);
    });
  });
  it("resolves exact assigned workers and never substitutes a supported release for an unavailable one", async () => {
    const data = registry();
    await withOwnedPilotServers(roots(), async scope => {
      const site = await createPilotSiteCoordinator(scope, data.db, configuration());
      expect(await site.resolve()).toEqual({ kind: "missing" });
      expect(data.releases.get(fixture.a.digest)?.[3]).toEqual(binding);
      data.publish(fixture.a.digest);
      const selected = await site.resolve("old");
      expect(selected.kind).toBe("published");
      if (selected.kind !== "published") throw new Error("Published fixture expected");
      expect(selected.origin).toBe(scope.servers.oldA.origin);
      expect(selected.document("/admin/homepage")).toBe(`${scope.servers.oldA.origin}/admin/homepage`);
      data.publish(fixture.b.digest);
      expect(await site.resolve("old")).toEqual({ kind: "unavailable" });
      expect(await site.resolve("missing-worker")).toEqual({ kind: "unavailable" });
      expect((await site.resolve("new")).kind).toBe("published");
      expect(await site.documentAllowed(scope.servers.oldA.origin)).toBe(false);
      expect(await site.documentAllowed(scope.servers.newB.origin)).toBe(true);
      data.state.members = [];
      expect(await site.resolve()).toEqual({ kind: "unavailable" });
    });
  });
  it("distinguishes explicit legacy, invalid state and failed lookups without fallback", async () => {
    const data = registry();
    await withOwnedPilotServers(roots(), async scope => {
      const site = await createPilotSiteCoordinator(scope, data.db, configuration());
      const legacy = { clubId, id: randomUUID(), previousId: null, digest: null, legacyId: documentA, documentId: documentA,
        binding: null, platform: null, lockHash: null, bindingHash: null,
        configuration: projection() };
      data.state.event = legacy;
      expect(await site.resolve()).toEqual({ kind: "legacy", event: legacy });
      data.publish(fixture.a.digest); data.state.pointer = documentB;
      expect(await site.resolve()).toEqual({ kind: "invalid" });
      data.publish(fixture.a.digest); data.state.event!.clubId = "22222222-2222-4222-8222-222222222222";
      expect(await site.resolve()).toEqual({ kind: "invalid" });
      data.publish(fixture.a.digest); data.state.event!.digest = "malformed";
      expect(await site.resolve()).toEqual({ kind: "invalid" });
      data.failLookup();
      expect(await site.resolve()).toEqual({ kind: "lookup-failed" });
    });
  });
  it("rejects partial rollout, stale expected events and manufactured plans", async () => {
    const data = registry();
    await withOwnedPilotServers(roots(), async scope => {
      const site = await createPilotSiteCoordinator(scope, data.db, configuration());
      data.publish(fixture.a.digest);
      const expected = String(data.state.event!.id);
      await expect(site.prepare({ expected, target: fixture.b.digest })).rejects.toThrow("RELEASE_UNAVAILABLE");
      await expect(site.prepare({ expected: randomUUID(), target: fixture.a.digest })).rejects.toThrow("ASSIGNMENT_CHANGED");
      await expect(site.commit({})).rejects.toThrow("INVALID_ACTIVATION_PLAN");
      expect(data.transitions).toEqual([]);
      data.state.members = [[...data.workers][1][0]];
      const request = { expected, target: fixture.b.digest };
      const plan = await site.prepare(request);
      await expect(site.commit({ ...plan })).rejects.toThrow("INVALID_ACTIVATION_PLAN");
      request.target = fixture.a.digest;
      await site.commit(plan);
      expect(data.transitions).toHaveLength(1);
      expect(data.transitions[0].slice(0, 5)).toEqual([clubId, expected, data.state.generation, fixture.b.digest, null]);
    });
  });
  it("expires coordination authority with its actual owned serving scope", async () => {
    const data = registry();
    const site = await withOwnedPilotServers(roots(), scope => createPilotSiteCoordinator(scope, data.db, configuration()));
    await expect(site.prepare({ expected: null, target: fixture.a.digest })).rejects.toThrow("active owned pilot scope");
    expect(await site.resolve()).toEqual({ kind: "unavailable" });
    await expect(site.documentAllowed("http://alpha.localhost:1234")).rejects.toThrow("active owned pilot scope");
  });
});
