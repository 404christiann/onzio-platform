import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const IMPLEMENTATION_ROOTS = ["app", "lib", "components"];

// Supabase projects that have been permanently deleted. Nothing that runs may
// reference them: the hostnames no longer resolve, so a reference is a request
// that can only ever fail. Add an entry here whenever a project is
// decommissioned — deleting the infrastructure is not the same as removing the
// code that asks for it, and only this contract checks the second half.
const DECOMMISSIONED_SUPABASE_HOSTS = [
  // Legacy "Rose City Website" project, deleted during the Phase 8 closeout.
  "nsgtkwqkbyxkiwrhzsje.supabase.co",
];

// Files that record a decommissioned host as historical provenance rather than
// fetching from it. These document where already-migrated data came from.
const DECOMMISSIONED_HOST_PROVENANCE_ALLOWLIST = new Set([
  "lib/migration/rose-city-plan.ts",
]);

async function requireFile(path: string): Promise<string> {
  const absolute = resolve(ROOT, path);
  try {
    await access(absolute);
  } catch {
    throw new Error(`[RED CONTRACT] Missing planned architecture file: ${path}`);
  }
  return readFile(absolute, "utf8");
}

async function sourceFiles(root: string): Promise<string[]> {
  const absolute = resolve(ROOT, root);
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const path = join(root, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return [path];
      }),
    );
    return nested.flat().filter((path) =>
      [".ts", ".tsx", ".js", ".mjs", ".sql"].includes(extname(path)),
    );
  } catch {
    throw new Error(`[RED CONTRACT] Missing planned source root: ${root}`);
  }
}

describe("Next image architecture contract", () => {
  it("globally bypasses runtime optimization and has no Supabase loader file", async () => {
    const config = await requireFile("next.config.mjs");
    expect(config).not.toMatch(/\bloader\s*:/);
    expect(config).toMatch(/\bunoptimized\s*:\s*true/);
    await expect(
      access(resolve(ROOT, "supabase-image-loader.js")),
    ).rejects.toThrow();
  });

  it("constrains the exact Supabase media origin", async () => {
    const config = await requireFile("next.config.mjs");
    expect(config).toContain("remotePatterns");
    expect(config).toContain("/storage/v1/object/public/onzio-media/**");
    expect(config).not.toMatch(/hostname:\s*["']\*["']/);
  });

  it("retains the approved source allowlist and image metadata settings", async () => {
    const config = await requireFile("next.config.mjs");
    expect(config).toMatch(
      /deviceSizes\s*:\s*\[\s*640,\s*828,\s*1080,\s*1440,\s*1920\s*\]/,
    );
    expect(config).toMatch(
      /imageSizes\s*:\s*\[\s*32,\s*48,\s*64,\s*96,\s*128,\s*256,\s*384\s*\]/,
    );
    expect(config).toMatch(/qualities\s*:\s*\[\s*70,\s*80\s*\]/);
    expect(config).toMatch(/minimumCacheTTL\s*:\s*2678400/);
  });

  it("contains no Supabase Image Transformation endpoint", async () => {
    await requireFile("next.config.mjs");
    const files = (
      await Promise.all(
        IMPLEMENTATION_ROOTS.map((root) => sourceFiles(root)),
      )
    ).flat();
    files.push("next.config.mjs");

    const violations: string[] = [];
    for (const path of files) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      if (contents.includes("/storage/v1/render/image/")) {
        violations.push(relative(ROOT, resolve(ROOT, path)));
      }
    }
    expect(violations).toEqual([]);
  });

  it("references no permanently deleted Supabase project", async () => {
    const files = (
      await Promise.all(
        IMPLEMENTATION_ROOTS.map((root) => sourceFiles(root)),
      )
    ).flat();
    files.push("next.config.mjs");

    const violations: string[] = [];
    for (const path of files) {
      const relativePath = relative(ROOT, resolve(ROOT, path));
      if (DECOMMISSIONED_HOST_PROVENANCE_ALLOWLIST.has(relativePath)) continue;
      const contents = await readFile(resolve(ROOT, path), "utf8");
      for (const host of DECOMMISSIONED_SUPABASE_HOSTS) {
        if (contents.includes(host)) {
          violations.push(`${relativePath} references ${host}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("marks every small-graphic surface unoptimized", async () => {
    const registry = await requireFile("lib/image-delivery.ts");
    for (const kind of [
      "club-logo",
      "flag",
      "sponsor-logo",
      "opponent-crest",
    ]) {
      expect(registry).toContain(kind);
    }
    expect(registry).toContain("unoptimized");
  });

  it("routes application images through resilient components", async () => {
    const files = (
      await Promise.all(
        ["app", "components"].map((root) => sourceFiles(root)),
      )
    ).flat();
    const directNextImageAllowlist = new Set([
      "components/NationalityFlag.tsx",
      "components/ResilientImage.tsx",
    ]);
    const directNativeImageAllowlist = new Set([
      "components/ResilientNativeImage.tsx",
    ]);
    const directNextImages: string[] = [];
    const directNativeImages: string[] = [];

    for (const path of files.filter((file) => file.endsWith(".tsx"))) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      if (
        /from\s+["']next\/image["']/.test(contents) &&
        !directNextImageAllowlist.has(path)
      ) {
        directNextImages.push(path);
      }
      if (
        /<img\b/.test(contents) &&
        !directNativeImageAllowlist.has(path)
      ) {
        directNativeImages.push(path);
      }
    }

    expect(directNextImages).toEqual([]);
    expect(directNativeImages).toEqual([]);
  });

  it("keeps automatic upload normalization in the secure media boundary", async () => {
    const adminClient = await requireFile("lib/admin-client.ts");
    const processor = await requireFile("lib/media-processing.ts");
    expect(adminClient).toContain("/api/admin/media/authorize");
    expect(adminClient).toContain("/api/admin/media/finalize");
    expect(processor).toContain("validateMediaUpload");
    expect(processor).toContain("normalizePhoto");
    expect(processor).toContain("normalizeGraphic");
  });
});

describe("tenant and privileged-boundary architecture contract", () => {
  it("contains every planned security boundary module", async () => {
    const required = [
      "lib/tenant.ts",
      "lib/tenant-routing.ts",
      "lib/club-context.ts",
      "lib/authorization.ts",
      "lib/club-access.ts",
      "lib/club-features.ts",
      "lib/stripe-event-routing.ts",
      "lib/media-cleanup.ts",
      "lib/media-processing.ts",
    ];
    for (const path of required) {
      await requireFile(path);
    }
  });

  it("keeps service-role imports inside the approved privileged boundary", async () => {
    const files = (
      await Promise.all(
        IMPLEMENTATION_ROOTS.map((root) => sourceFiles(root)),
      )
    ).flat();
    const approved = [
      /^app\/api\/stripe\/webhook\//,
      /^lib\/operator\//,
      /^lib\/migration\//,
      /^lib\/media-cleanup\.ts$/,
      /^lib\/media-processing\.ts$/,
      /^lib\/supabase-service-role\.ts$/,
    ];
    const violations: string[] = [];

    for (const path of files) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      if (
        /supabase-service-role|SUPABASE_SERVICE_ROLE_KEY/.test(contents) &&
        !approved.some((pattern) => pattern.test(path))
      ) {
        violations.push(path);
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not accept club_id in public admin action schemas", async () => {
    const files = await sourceFiles("app/admin");
    const violations: string[] = [];
    for (const path of files) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      if (/club_id\s*[:=]/.test(contents)) violations.push(path);
    }
    expect(violations).toEqual([]);
  });
});

describe("migration SQL security contract", () => {
  it("keeps authorization functions in the private schema", async () => {
    const files = await sourceFiles("supabase/migrations");
    const sql = (
      await Promise.all(
        files.filter((file) => file.endsWith(".sql")).map((file) =>
          readFile(resolve(ROOT, file), "utf8"),
        ),
      )
    ).join("\n");

    expect(sql).toMatch(/create schema(?: if not exists)? onzio_private/i);
    expect(sql).toMatch(
      /create (?:or replace )?function onzio_private\.is_club_member/i,
    );
    expect(sql).not.toMatch(
      /create (?:or replace )?function onzio\.is_club_member/i,
    );
  });

  it("hardens every security-definer function", async () => {
    const files = await sourceFiles("supabase/migrations");
    const sql = (
      await Promise.all(
        files.filter((file) => file.endsWith(".sql")).map((file) =>
          readFile(resolve(ROOT, file), "utf8"),
        ),
      )
    ).join("\n");

    const definerCount = (sql.match(/security definer/gi) ?? []).length;
    const emptySearchPathCount = (
      sql.match(/set\s+search_path\s*=\s*''/gi) ?? []
    ).length;
    expect(definerCount).toBeGreaterThan(0);
    expect(emptySearchPathCount).toBe(definerCount);
    expect(sql).toMatch(/revoke execute on function .* from public/i);
  });
});

describe("test-suite integrity", () => {
  it("contains no skipped, todo, or focused tests", async () => {
    const files = await sourceFiles("tests");
    const violations: string[] = [];
    const forbidden = /\.(?:skip|todo|only)\s*\(/;

    for (const path of files.filter((file) => file.endsWith(".test.ts"))) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      if (forbidden.test(contents)) violations.push(path);
    }
    expect(violations).toEqual([]);
  });
});
