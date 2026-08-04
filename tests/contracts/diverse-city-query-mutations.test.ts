import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubs, memberships, USER_IDS } from "../fixtures/entities";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import { authorizeMutation } from "@/lib/authorization";
import {
  fetchContactContent,
  fetchProgramBySlug,
  fetchPrograms,
  fetchTryouts,
} from "@/lib/queries";

const CLUB_ID = clubs.alpha.id;

const { mockFrom, mockResolveMediaReferences } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockResolveMediaReferences: vi.fn(
    async (rows: readonly Record<string, unknown>[]) =>
      rows.map((row) => ({
        ...row,
        ...(typeof row.hero_media_asset_id === "string"
          ? { hero_media_url: `/media/${row.hero_media_asset_id}` }
          : {}),
        ...(typeof row.detail_media_asset_id === "string"
          ? { detail_media_url: `/media/${row.detail_media_asset_id}` }
          : {}),
      })),
  ),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/media-assets", () => ({
  resolveMediaReferences: mockResolveMediaReferences,
  resolveMediaStoragePath: vi.fn(async (_clubId, _assetId, fallback) => fallback),
}));

function chain(result: { data: unknown; error: unknown }) {
  const query = {} as Record<string, any>;
  for (const method of [
    "select",
    "eq",
    "order",
    "limit",
    "maybeSingle",
  ]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = (resolveResult: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolveResult);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DCFC-204 tenant-scoped public query mappings", () => {
  it("maps active programs, resolves media, and applies the verified tenant filter", async () => {
    const query = chain({
      data: [
        {
          id: "program-1",
          club_id: CLUB_ID,
          slug: "youth-academy",
          nav_label: "Academy",
          display_title: "Youth Academy",
          kicker: "Player pathway",
          summary: "A place to develop.",
          body: "Long-form program copy.",
          highlights: ["Technical growth", 42, "Team environment"],
          layout_variant: "statement_band",
          hero_media_asset_id: "hero-asset",
          detail_media_asset_id: "detail-asset",
          external_cta_label: "Learn more",
          external_cta_href: "https://registration.example.test/program",
          status: "active",
          sort_order: 2,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    await expect(fetchPrograms(CLUB_ID)).resolves.toEqual([
      expect.objectContaining({
        id: "program-1",
        slug: "youth-academy",
        navLabel: "Academy",
        displayTitle: "Youth Academy",
        highlights: ["Technical growth", "Team environment"],
        layoutVariant: "statement_band",
        heroMediaUrl: "/media/hero-asset",
        detailMediaUrl: "/media/detail-asset",
        externalCta: {
          label: "Learn more",
          href: "https://registration.example.test/program",
        },
      }),
    ]);
    expect(mockFrom).toHaveBeenCalledWith("programs");
    expect(query.eq).toHaveBeenCalledWith("club_id", CLUB_ID);
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    expect(query.order).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("returns null for an unknown active program slug without dropping tenant scope", async () => {
    const query = chain({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await expect(fetchProgramBySlug(CLUB_ID, "removed-program")).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith("club_id", CLUB_ID);
    expect(query.eq).toHaveBeenCalledWith("slug", "removed-program");
    expect(query.eq).toHaveBeenCalledWith("status", "active");
  });

  it("requires an explicit UUID tenant identity for every new public query", async () => {
    await expect(fetchPrograms("" as string)).rejects.toThrow(
      /verified clubId/i,
    );
    await expect(fetchContactContent("not-a-club-id")).rejects.toThrow(
      /verified clubId/i,
    );
    await expect(fetchTryouts("" as string)).rejects.toThrow(
      /verified clubId/i,
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("maps Contact's canonical profile, page copy, and existing social links", async () => {
    const queries = {
      contact_profile: chain({
        data: [
          {
            club_id: CLUB_ID,
            public_email: "hello@example.test",
            public_phone: "+1 555 0100",
            service_area: "Schaumburg, Illinois",
            hours: "",
            updated_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      }),
      contact_page_content: chain({
        data: [
          {
            club_id: CLUB_ID,
            eyebrow: "Contact",
            headline: "Start a conversation.",
            intro: "Reach the club directly.",
            hero_media_asset_id: "contact-hero",
            updated_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      }),
      site_social_links: chain({
        data: [
          {
            club_id: CLUB_ID,
            id: "instagram",
            label: "Instagram",
            href: "https://instagram.com/example",
            icon: "instagram",
            sort_order: 0,
            updated_at: "2026-08-01T00:00:00Z",
          },
        ],
        error: null,
      }),
    };
    mockFrom.mockImplementation(
      (table: keyof typeof queries) => queries[table],
    );

    await expect(fetchContactContent(CLUB_ID)).resolves.toMatchObject({
      profile: {
        publicEmail: "hello@example.test",
        publicPhone: "+1 555 0100",
        serviceArea: "Schaumburg, Illinois",
      },
      page: {
        eyebrow: "Contact",
        headline: "Start a conversation.",
        heroMediaUrl: "/media/contact-hero",
      },
      socialLinks: [expect.objectContaining({ id: "instagram" })],
    });
    for (const query of Object.values(queries)) {
      expect(query.eq).toHaveBeenCalledWith("club_id", CLUB_ID);
    }
  });

  it("uses registration only for safe non-closed Tryouts and otherwise fails closed to contact", async () => {
    const tryoutsQuery = chain({
      data: [
        {
          id: "tryout-open",
          club_id: CLUB_ID,
          program_id: null,
          status: "open",
          eyebrow: "Tryouts",
          headline: "Join the club",
          intro: "Open now.",
          hero_media_asset_id: null,
          eligibility_copy: "",
          what_to_expect_copy: "",
          preparation_copy: "",
          event_date: null,
          location: "",
          cost_text: "",
          cta_label: "Register",
          registration_href: "https://register.example.test",
          closed_message: "",
          sort_order: 0,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "tryout-unsafe",
          club_id: CLUB_ID,
          program_id: null,
          status: "upcoming",
          eyebrow: "",
          headline: "Coming soon",
          intro: "",
          hero_media_asset_id: null,
          eligibility_copy: "",
          what_to_expect_copy: "",
          preparation_copy: "",
          event_date: null,
          location: "",
          cost_text: "",
          cta_label: "Register",
          registration_href: "javascript:alert(1)",
          closed_message: "",
          sort_order: 1,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "tryout-closed",
          club_id: CLUB_ID,
          program_id: null,
          status: "closed",
          eyebrow: "",
          headline: "Closed",
          intro: "",
          hero_media_asset_id: null,
          eligibility_copy: "",
          what_to_expect_copy: "",
          preparation_copy: "",
          event_date: null,
          location: "",
          cost_text: "",
          cta_label: "Register",
          registration_href: "https://register.example.test/closed",
          closed_message: "Registration is closed.",
          sort_order: 2,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      error: null,
    });
    const contactQuery = chain({
      data: [{ public_email: "tryouts@example.test" }],
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      table === "tryouts" ? tryoutsQuery : contactQuery,
    );

    const result = await fetchTryouts(CLUB_ID);
    expect(result.map((tryout) => tryout.action)).toEqual([
      {
        kind: "registration",
        label: "Register",
        href: "https://register.example.test",
      },
      {
        kind: "contact",
        label: "Contact the club",
        href: "mailto:tryouts@example.test",
      },
      {
        kind: "contact",
        label: "Contact the club",
        href: "mailto:tryouts@example.test",
      },
    ]);
    expect(tryoutsQuery.eq).toHaveBeenCalledWith("club_id", CLUB_ID);
    expect(contactQuery.eq).toHaveBeenCalledWith("club_id", CLUB_ID);
  });

  it.each([
    ["Programs", () => fetchPrograms(CLUB_ID)],
    ["Contact", () => fetchContactContent(CLUB_ID)],
    ["Tryouts", () => fetchTryouts(CLUB_ID)],
  ])("fails closed when the %s public query returns an error", async (_name, action) => {
    mockFrom.mockReturnValue(
      chain({ data: null, error: { message: "public content unavailable" } }),
    );
    await expect(action()).rejects.toThrow(/public content unavailable/);
  });
});

describe("DCFC-204 protected mutation schemas", () => {
  it.each([
    [
      "programs",
      {
        slug: "youth-academy",
        display_title: "Youth Academy",
        highlights: ["Technical growth"],
        layout_variant: "statement_band",
        external_cta_href: "https://registration.example.test",
      },
    ],
    [
      "contact_profile",
      {
        public_email: "hello@example.test",
        public_phone: "+1 555 0100",
        service_area: "Schaumburg, Illinois",
      },
    ],
    [
      "contact_page_content",
      {
        eyebrow: "Contact",
        headline: "Start a conversation.",
        hero_media_asset_id: null,
      },
    ],
    [
      "tryouts",
      {
        status: "upcoming",
        event_date: null,
        registration_href: "mailto:tryouts@example.test",
      },
    ],
  ])("accepts a typed %s mutation payload", (table, payload) => {
    expect(
      adminDataRequestSchema.safeParse({
        table,
        operation: "insert",
        payload,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["programs", { slug: "bad slug", display_title: "Bad" }],
    ["programs", { slug: "valid", display_title: "Bad", unknown: true }],
    ["contact_profile", { public_email: "not-an-email" }],
    ["contact_profile", { public_phone: "javascript:alert(1)" }],
    ["tryouts", { status: "accepting-payments" }],
    ["tryouts", { registration_href: "javascript:alert(1)" }],
    ["tryouts", { registration_href: "//evil.example/registration" }],
    ["tryouts", { registration_href: "/\\evil.example/registration" }],
    ["tryouts", { registration_href: "https:evil.example/registration" }],
  ])("rejects an invalid table-specific %s payload", (table, payload) => {
    expect(
      adminDataRequestSchema.safeParse({
        table,
        operation: "update",
        payload,
      }).success,
    ).toBe(false);
  });

  it("requires a payload for new-domain insert, update, and upsert operations", () => {
    for (const operation of ["insert", "update", "upsert"] as const) {
      expect(
        adminDataRequestSchema.safeParse({ table: "programs", operation })
          .success,
      ).toBe(false);
    }
  });

  it("preserves tenant, membership, and lifecycle checks without tier gating", async () => {
    await expect(
      authorizeMutation({
        club: clubs.alpha,
        userId: USER_IDS.adminAal2,
        memberships,
        aal: "aal2",
        feature: "contact",
        payload: { public_email: "hello@example.test" },
      }),
    ).resolves.toMatchObject({ clubId: CLUB_ID });

    for (const feature of ["programs", "tryouts"]) {
      await expect(
        authorizeMutation({
          club: clubs.alpha,
          userId: USER_IDS.adminAal2,
          memberships,
          aal: "aal2",
          feature,
          payload: {},
        }),
      ).resolves.toMatchObject({ clubId: CLUB_ID });
    }

    await expect(
      authorizeMutation({
        club: { ...clubs.alpha, lifecycle: "archived" },
        userId: USER_IDS.adminAal2,
        memberships,
        aal: "aal2",
        feature: "contact",
        payload: {},
      }),
    ).rejects.toMatchObject({ code: "CLUB_ARCHIVED" });

    await expect(
      authorizeMutation({
        club: clubs.alpha,
        userId: USER_IDS.ownerAal1,
        memberships,
        aal: "aal1",
        feature: "contact",
        payload: {},
      }),
    ).resolves.toMatchObject({ clubId: CLUB_ID });

    await expect(
      authorizeMutation({
        club: clubs.alpha,
        userId: USER_IDS.unaffiliated,
        memberships,
        aal: "aal2",
        feature: "contact",
        payload: {},
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_REQUIRED" });

    await expect(
      authorizeMutation({
        club: clubs.alpha,
        userId: USER_IDS.adminAal2,
        memberships,
        aal: "aal2",
        feature: "contact",
        payload: { club_id: clubs.bravo.id },
      }),
    ).rejects.toMatchObject({ code: "UNTRUSTED_TENANT_INPUT" });
  });

  it("keeps the server mutation route on the verified authorization boundary", async () => {
    const source = await readFile(
      resolve(process.cwd(), "app/api/admin/data/route.ts"),
      "utf8",
    );
    for (const requiredBoundary of [
      "requireFreshClubSession(supabase)",
      "getClubContext({",
      "authorizeMutation({",
      "ADMIN_TABLE_FEATURES[parsed.data.table]",
      "club_id: clubId",
    ]) {
      expect(source).toContain(requiredBoundary);
    }
  });
});
