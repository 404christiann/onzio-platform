import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_TABLE_FEATURES,
  SINGLETON_TABLES,
  adminDataRequestSchema,
} from "@/lib/admin-data-contract";
import { moduleRegistry, routeRegistry, templateRegistry } from "@/packages/presentation";

// DCFC-201 red contracts for the Programs, Contact, and Tryouts domains
// approved in docs/phase-11/diverse-city/DOMAIN-DESIGN.md (decision DCFC-D109).
//
// These are intentionally failing until DCFC-202 writes the migration, DCFC-203
// registers the presentation capabilities, and DCFC-204 wires the queries. A
// failure here is a requirement, not a harness defect. Per AGENTS.md, do not
// skip, weaken, or mock these to make the suite green.

const ROOT = process.cwd();

const NEW_TABLE_FEATURES = {
  programs: "programs",
  contact_profile: "contact",
  contact_page_content: "contact",
  tryouts: "tryouts",
} as const;

async function plat102Migration(): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const dir = resolve(ROOT, "supabase/migrations");
  const name = (await readdir(dir)).find((entry) =>
    entry.endsWith("_plat_102_billing_entitlement.sql"),
  );
  if (!name) throw new Error("[RED CONTRACT] Missing PLAT-102 migration.");
  return readFile(resolve(dir, name), "utf8");
}

describe("Diverse City domain admin registration (DCFC-201)", () => {
  it.each(Object.entries(NEW_TABLE_FEATURES))(
    "registers onzio.%s in ADMIN_TABLE_FEATURES under the approved feature",
    (table, feature) => {
      const registry = ADMIN_TABLE_FEATURES as Record<string, string>;
      expect(
        registry[table],
        `${table} must be registered in ADMIN_TABLE_FEATURES or the generic admin ` +
          "mutation boundary rejects it regardless of its RLS",
      ).toBe(feature);
    },
  );

  it("accepts the new tables through the admin request schema", () => {
    for (const table of Object.keys(NEW_TABLE_FEATURES)) {
      const parsed = adminDataRequestSchema.safeParse({
        table,
        operation: "select",
      });
      expect(parsed.success, `admin requests for ${table} must parse`).toBe(true);
    }
  });

  it("treats the contact tables as singletons and the others as multi-row", () => {
    const singletons = SINGLETON_TABLES as Set<string>;
    expect(singletons.has("contact_profile")).toBe(true);
    expect(singletons.has("contact_page_content")).toBe(true);
    expect(singletons.has("programs")).toBe(false);
    expect(singletons.has("tryouts")).toBe(false);
  });
});

describe("PLAT-102 tier-free authorization supersedes DCFC-D108", () => {
  it("deletes club_has_feature and collapses both policy wrappers", async () => {
    const migration = await plat102Migration();
    expect(migration).toContain("drop function onzio_private.club_has_feature");
    expect(migration).toContain("select onzio_private.can_read_club(p_club_id)");
    expect(migration).toContain("select onzio_private.can_mutate_content(p_club_id)");
    expect(migration).not.toContain("drop policy");
  });
});

describe("Diverse City presentation registration (DCFC-D104)", () => {
  it("registers the academy@1 template", () => {
    const templates = templateRegistry as unknown as Record<string, unknown>;
    expect(
      templates["academy@1"],
      "DCFC-D104 approved academy@1 as a new neutral reusable template, " +
        "following the clubhouse@1 extraction precedent",
    ).toBeDefined();
  });

  it("exposes public routes for programs and contact", () => {
    const routes = routeRegistry as unknown as Record<string, { path: string }>;
    expect(routes.programs?.path).toBe("/programs");
    expect(routes.contact?.path).toBe("/contact");
  });

  it("keeps the already-registered tryouts route unchanged", () => {
    const routes = routeRegistry as unknown as Record<string, { path: string }>;
    expect(routes.tryouts?.path).toBe("/tryouts");
  });

  it("registers modules at the entitlements DCFC-D108 approved", () => {
    const modules = moduleRegistry as unknown as Record<
      string,
      { entitlement: string }
    >;
    expect(modules.programs?.entitlement).toBe("pro");
    expect(modules.contact?.entitlement).toBe("starter");
    expect(modules.tryouts?.entitlement).toBe("pro");
  });
});

describe("presentation metadata is non-authorizing", () => {
  it("retains descriptive module labels without using them in policy wrappers", async () => {
    const migration = await plat102Migration();
    const modules = moduleRegistry as unknown as Record<
      string,
      { entitlement: string }
    >;
    expect(modules.programs.entitlement).toBe("pro");
    expect(modules.contact.entitlement).toBe("starter");
    expect(migration).not.toMatch(/club\.tier\s*=\s*'pro'/);
  });
});

describe("no Diverse City tenant branches (EPIC.md locked boundary)", () => {
  it("introduces no club.slug === 'diverse-city' presentation branch", async () => {
    const { readdir } = await import("node:fs/promises");
    const { extname, join } = await import("node:path");

    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(resolve(ROOT, dir), { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          return entry.isDirectory() ? walk(path) : [path];
        }),
      );
      return nested
        .flat()
        .filter((path) => [".ts", ".tsx"].includes(extname(path)));
    }

    const files = (
      await Promise.all(["app", "lib", "components", "packages"].map(walk))
    ).flat();

    const violations: string[] = [];
    for (const path of files) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      if (/slug\s*===\s*["']diverse-city["']/.test(contents)) {
        violations.push(path);
      }
    }
    expect(violations).toEqual([]);
  });
});
