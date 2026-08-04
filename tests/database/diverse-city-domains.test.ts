import { beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

// DCFC-201 red database contracts for the Programs, Contact, and Tryouts
// domains approved in docs/phase-11/diverse-city/DOMAIN-DESIGN.md.
//
// Every assertion here describes behavior DCFC-202's migration must produce.
// These fail until that migration exists. Per AGENTS.md and tests/README.md a
// failing contract is a requirement -- do not skip, weaken, or mock it.

let clients: LocalClients;

const NEW_TABLES = [
  "programs",
  "contact_profile",
  "contact_page_content",
  "tryouts",
] as const;

// Retained domain grouping; PLAT-102 removes authorization meaning from tier.
const CONTACT_TABLES = ["contact_profile", "contact_page_content"] as const;
const FORMERLY_PRO_ONLY_TABLES = ["programs", "tryouts"] as const;

// PostgREST returns PGRST205 when a table is absent from the schema cache.
// Several assertions below are about a request being *rejected*, and a missing
// table also produces a rejection -- so without this distinction those tests
// would pass today for entirely the wrong reason and would keep passing even
// if DCFC-202 shipped the tables with no RLS at all. Every negative assertion
// therefore names the specific code it expects.
const MISSING_TABLE = "PGRST205";
const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";

function expectTablePresent(error: { code?: string } | null, table: string) {
  expect(
    error?.code,
    `onzio.${table} does not exist yet -- this contract describes DCFC-202 work`,
  ).not.toBe(MISSING_TABLE);
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

describe("Diverse City domain schema (DCFC-202 target)", () => {
  it.each(NEW_TABLES)("exposes onzio.%s", async (table) => {
    const { error } = await clients.service.from(table).select("*").limit(0);
    expect(error?.message).toBeUndefined();
  });

  it("enforces composite tenant integrity between tryouts and programs", async () => {
    // A tryout may reference a program, but only one owned by the same club.
    // The composite (club_id, program_id) foreign key must make a cross-tenant
    // reference structurally impossible rather than merely discouraged.
    const { data: program, error: programError } = await clients.service
      .from("programs")
      .insert({
        club_id: CLUB_IDS.alpha,
        slug: "dcfc-201-tenant-integrity",
        display_title: "Tenant integrity probe",
      })
      .select("id")
      .single();
    expect(programError?.message).toBeUndefined();

    const crossTenant = await clients.service.from("tryouts").insert({
      club_id: CLUB_IDS.bravo,
      program_id: program?.id,
    });
    expectPostgrestError(
      crossTenant.error,
      "23503",
      "cross-tenant tryout-to-program relationship",
    );

    await clients.service
      .from("programs")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("slug", "dcfc-201-tenant-integrity");
  });

  it("rejects an external CTA href with a disallowed protocol", async () => {
    const { error } = await clients.service.from("programs").insert({
      club_id: CLUB_IDS.alpha,
      slug: "dcfc-201-protocol-probe",
      display_title: "Protocol probe",
      external_cta_href: "javascript:alert(1)",
    });
    expectTablePresent(error, "programs");
    expect(
      error?.code,
      "the database check must reject non-http/https/mailto/local hrefs",
    ).toBe(CHECK_VIOLATION);
  });

  it("permits an empty registration_href as the honest TBA state", async () => {
    const { error } = await clients.service.from("tryouts").insert({
      club_id: CLUB_IDS.alpha,
      registration_href: "",
    });
    expect(
      error?.message,
      "an empty registration_href is the documented fail-closed TBA state",
    ).toBeUndefined();

    await clients.service
      .from("tryouts")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("registration_href", "");
  });
});

describe("Diverse City domain tier-free reads (PLAT-D018)", () => {
  // Charlie is the seeded live fixture with legacy Starter metadata. PLAT-102
  // proves that metadata no longer changes public read authorization.
  it.each(CONTACT_TABLES)(
    "allows an anonymous read of onzio.%s for a live club with Starter metadata",
    async (table) => {
      const { data: existing, error: existingError } = await clients.service
        .from(table)
        .select("*")
        .eq("club_id", CLUB_IDS.charlie)
        .maybeSingle();
      expect(existingError?.message).toBeUndefined();

      const fixture =
        table === "contact_profile"
          ? {
              club_id: CLUB_IDS.charlie,
              service_area: "DCFC-204 Starter read fixture",
            }
          : {
              club_id: CLUB_IDS.charlie,
              headline: "DCFC-204 Starter read fixture",
            };

      try {
        const write = await (clients.service.from(table) as any).upsert(fixture);
        expect(write.error?.message).toBeUndefined();

        const { data, error } = await clients.anon
          .from(table)
          .select("club_id")
          .eq("club_id", CLUB_IDS.charlie);
        expect(
          error?.message,
          "can_read_feature must delegate to live club access and ignore tier",
        ).toBeUndefined();
        expect(data).toEqual([{ club_id: CLUB_IDS.charlie }]);
      } finally {
        await clients.service
          .from(table)
          .delete()
          .eq("club_id", CLUB_IDS.charlie);
        if (existing) {
          await (clients.service.from(table) as any).insert(existing);
        }
      }
    },
  );

  it.each(FORMERLY_PRO_ONLY_TABLES)(
    "returns onzio.%s rows to a live club regardless of dormant tier",
    async (table) => {
      await clients.service.from(table).insert(
        table === "programs"
          ? {
              club_id: CLUB_IDS.charlie,
              slug: "dcfc-201-tier-probe",
              display_title: "Tier probe",
            }
          : { club_id: CLUB_IDS.charlie },
      );

      const { data, error } = await clients.anon
        .from(table)
        .select("club_id")
        .eq("club_id", CLUB_IDS.charlie);
      expectTablePresent(error, table);
      expect(data).toEqual([{ club_id: CLUB_IDS.charlie }]);

      await clients.service.from(table).delete().eq("club_id", CLUB_IDS.charlie);
    },
  );

  it("continues exposing rows for a live club with legacy Pro metadata", async () => {
    await clients.service.from("programs").insert({
      club_id: CLUB_IDS.alpha,
      slug: "dcfc-201-pro-probe",
      display_title: "Pro probe",
    });

    const { data, error } = await clients.anon
      .from("programs")
      .select("club_id")
      .eq("club_id", CLUB_IDS.alpha);
    expect(error?.message).toBeUndefined();
    expect(
      (data ?? []).length,
      "a live club's programs must be publicly readable",
    ).toBeGreaterThan(0);

    await clients.service
      .from("programs")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("slug", "dcfc-201-pro-probe");
  });
});

describe("Diverse City domain tenant isolation", () => {
  it.each(NEW_TABLES)(
    "denies an anonymous write to onzio.%s",
    async (table) => {
      const { error } = await clients.anon
        .from(table)
        .insert({ club_id: CLUB_IDS.alpha });
      expectTablePresent(error, table);
      expect(
        error?.code,
        "anonymous writes must be denied because no INSERT grant exists for " +
          "anon, not merely because something went wrong",
      ).toBe(PERMISSION_DENIED);
    },
  );

  it("hides every new table from an anonymous reader of a preview club", async () => {
    for (const table of NEW_TABLES) {
      const { data, error } = await clients.anon
        .from(table)
        .select("club_id")
        .eq("club_id", CLUB_IDS.bravo);
      expectTablePresent(error, table);
      expect(
        data ?? [],
        `${table} must expose nothing for an onboarding/preview club`,
      ).toEqual([]);
    }
  });
});
