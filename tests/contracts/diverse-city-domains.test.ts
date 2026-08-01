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

// Tier expectations resolved by DCFC-D108: Contact is Starter-accessible;
// Programs and Tryouts are Pro-only.
const STARTER_ALLOWLIST_ADDITIONS = ["contact"] as const;
const PRO_ONLY_NEW_FEATURES = ["programs", "tryouts"] as const;

// club_has_feature is defined with `create or replace` and may be redefined by
// any later migration, so the effective definition is the one in the
// last-ordered migration that declares it. Reading only the original
// foundation migration would assert against a stale definition -- and would
// keep passing even if a later migration dropped `security definer`.
async function effectiveClubHasFeatureDefinition(): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const dir = resolve(ROOT, "supabase/migrations");
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let effective: string | null = null;
  for (const name of files) {
    const sql = await readFile(resolve(dir, name), "utf8");
    const start = sql.indexOf("function onzio_private.club_has_feature");
    if (start === -1) continue;
    const body = sql.slice(start);
    effective = body.slice(0, body.indexOf("$$;") + 3);
  }

  if (!effective) {
    throw new Error(
      "[RED CONTRACT] No migration defines onzio_private.club_has_feature.",
    );
  }
  return effective;
}

function starterAllowlist(definition: string): string[] {
  const match = definition.match(/p_feature in \(([^)]*)\)/);
  if (!match) {
    throw new Error(
      "[RED CONTRACT] Could not locate the club_has_feature Starter allowlist.",
    );
  }
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]);
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

describe("Diverse City tier gating (DCFC-D108)", () => {
  it("adds 'contact' to the club_has_feature Starter allowlist", async () => {
    const allowlist = starterAllowlist(await effectiveClubHasFeatureDefinition());
    for (const feature of STARTER_ALLOWLIST_ADDITIONS) {
      expect(
        allowlist,
        "Contact must be Starter-accessible; can_read_feature gates anonymous " +
          "public reads, so omitting it renders Starter contact pages empty",
      ).toContain(feature);
    }
  });

  it("leaves programs and tryouts Pro-only by keeping them out of the allowlist", async () => {
    const allowlist = starterAllowlist(await effectiveClubHasFeatureDefinition());
    for (const feature of PRO_ONLY_NEW_FEATURES) {
      expect(allowlist).not.toContain(feature);
    }
  });

  it("preserves the security properties of club_has_feature", async () => {
    const body = await effectiveClubHasFeatureDefinition();
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = ''");
    expect(body).toContain("stable");
    expect(body).toContain("onzio.clubs");
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

describe("entitlement source agreement (PF-002)", () => {
  // moduleRegistry and the club_has_feature Starter allowlist independently
  // encode tier. Nothing ties them together, which is PF-002. This contract
  // locks agreement for every feature except the two already-recorded
  // contradictions, so no NEW drift can be introduced while PF-002 is open.
  //
  // Fixing `store` and `seasons` is deliberately NOT in DCFC-201's scope --
  // see docs/platform-findings.md. When PF-002 is resolved, delete these two
  // entries; this contract should then pass with no exclusions at all.
  const PF002_KNOWN_CONTRADICTIONS = new Set(["store", "seasons"]);

  it("keeps moduleRegistry entitlements consistent with the Starter allowlist", async () => {
    const allowlist = new Set(starterAllowlist(await effectiveClubHasFeatureDefinition()));
    const modules = moduleRegistry as unknown as Record<
      string,
      { entitlement: string }
    >;
    const featureForModule: Record<string, string> = {
      roster: "roster",
      schedule: "schedule",
      store: "shop",
      sponsors: "branding",
      standings: "standings",
      contact: "contact",
      programs: "programs",
      tryouts: "tryouts",
    };

    const disagreements: string[] = [];
    for (const [moduleName, feature] of Object.entries(featureForModule)) {
      if (PF002_KNOWN_CONTRADICTIONS.has(moduleName)) continue;
      const registration = modules[moduleName];
      if (!registration) continue;
      const dbAllowsStarter = allowlist.has(feature);
      const registryAllowsStarter = registration.entitlement === "starter";
      if (dbAllowsStarter !== registryAllowsStarter) {
        disagreements.push(
          `${moduleName}: moduleRegistry says ${registration.entitlement}, ` +
            `club_has_feature says ${dbAllowsStarter ? "starter" : "pro"}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
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
