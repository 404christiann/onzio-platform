import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DBProgram } from "@/lib/db-types";
import {
  buildProgramMutationPayload,
  emptyProgramDraft,
  moveHighlight,
  moveProgram,
  programToDraft,
  validateProgramDraft,
} from "@/lib/program-admin";
import { MEDIA_SURFACES } from "@/lib/storage-path";

const PROGRAM_ID = "44444444-4444-4444-8444-444444444401";
const HERO_ASSET_ID = "55555555-5555-4555-8555-555555555501";

function program(overrides: Partial<DBProgram> = {}): DBProgram {
  return {
    id: PROGRAM_ID,
    club_id: "11111111-1111-4111-8111-111111111111",
    slug: "youth-academy",
    nav_label: "Academy",
    display_title: "Youth Academy",
    kicker: "Player pathway",
    summary: "A place to grow.",
    body: "Long-form program copy.",
    highlights: ["Technical growth", "Team environment"],
    layout_variant: "statement_band",
    hero_media_asset_id: HERO_ASSET_ID,
    detail_media_asset_id: null,
    external_cta_label: "Learn more",
    external_cta_href: "https://registration.example.test/program",
    status: "active",
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("DCFC-301 Programs admin state and validation", () => {
  it("creates an honest empty draft at the requested list position", () => {
    expect(emptyProgramDraft(3)).toEqual(
      expect.objectContaining({
        id: null,
        slug: "",
        displayTitle: "",
        highlights: [],
        heroMediaAssetId: null,
        detailMediaAssetId: null,
        layoutVariant: "statement_band",
        status: "active",
        sortOrder: 3,
      }),
    );
  });

  it("maps every approved program field without carrying tenant identity", () => {
    const draft = programToDraft(program());
    expect(draft).toMatchObject({
      id: PROGRAM_ID,
      slug: "youth-academy",
      navLabel: "Academy",
      displayTitle: "Youth Academy",
      kicker: "Player pathway",
      summary: "A place to grow.",
      body: "Long-form program copy.",
      highlights: ["Technical growth", "Team environment"],
      layoutVariant: "statement_band",
      heroMediaAssetId: HERO_ASSET_ID,
      detailMediaAssetId: null,
      externalCtaLabel: "Learn more",
      externalCtaHref: "https://registration.example.test/program",
      status: "active",
      sortOrder: 0,
    });
    expect(draft).not.toHaveProperty("clubId");
    expect(draft).not.toHaveProperty("club_id");
  });

  it("rejects missing identity fields, unsafe CTAs, half-configured CTAs, and overlong highlights", () => {
    const missing = emptyProgramDraft(0);
    expect(validateProgramDraft(missing)).toMatchObject({
      slug: expect.any(String),
      displayTitle: expect.any(String),
    });

    expect(
      validateProgramDraft({
        ...missing,
        slug: "bad slug",
        displayTitle: "Program",
      }),
    ).toHaveProperty("slug");
    expect(
      validateProgramDraft({
        ...missing,
        slug: "program",
        displayTitle: "Program",
        externalCtaLabel: "Register",
        externalCtaHref: "javascript:alert(1)",
      }),
    ).toHaveProperty("externalCtaHref");
    expect(
      validateProgramDraft({
        ...missing,
        slug: "program",
        displayTitle: "Program",
        externalCtaLabel: "Register",
      }),
    ).toHaveProperty("externalCtaHref");
    expect(
      validateProgramDraft({
        ...missing,
        slug: "program",
        displayTitle: "Program",
        highlights: ["x".repeat(321)],
      }),
    ).toHaveProperty("highlights");
  });

  it("normalizes a complete mutation payload and never emits club identity", () => {
    const payload = buildProgramMutationPayload(
      programToDraft(
        program({
          nav_label: "  Academy  ",
          highlights: [" First ", "", " Second "],
        }),
      ),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        slug: "youth-academy",
        nav_label: "Academy",
        highlights: ["First", "Second"],
        hero_media_asset_id: HERO_ASSET_ID,
        detail_media_asset_id: null,
      }),
    );
    expect(payload).not.toHaveProperty("club_id");
    expect(payload).not.toHaveProperty("clubId");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updated_at");
  });

  it("reorders programs and highlights without dropping data", () => {
    const programs = [
      programToDraft(program({ id: "44444444-4444-4444-8444-444444444411" })),
      programToDraft(program({ id: "44444444-4444-4444-8444-444444444412" })),
      programToDraft(program({ id: "44444444-4444-4444-8444-444444444413" })),
    ];
    expect(moveProgram(programs, 2, -1).map((item) => item.id)).toEqual([
      "44444444-4444-4444-8444-444444444411",
      "44444444-4444-4444-8444-444444444413",
      "44444444-4444-4444-8444-444444444412",
    ]);
    expect(moveProgram(programs, 0, -1)).toBe(programs);
    expect(moveHighlight(["A", "B", "C"], 0, 1)).toEqual(["B", "A", "C"]);
  });
});

describe("DCFC-301 protected Programs admin surface", () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), "app/admin/(protected)/programs/page.tsx"),
    "utf8",
  );
  const shellSource = readFileSync(
    resolve(process.cwd(), "components/AdminShell.tsx"),
    "utf8",
  );
  const clientSource = readFileSync(
    resolve(process.cwd(), "lib/admin-client.ts"),
    "utf8",
  );

  it("registers Programs navigation without a tier gate", () => {
    expect(shellSource).toContain('label: "Programs"');
    expect(shellSource).toContain('href: "/admin/programs"');
    expect(pageSource).not.toContain("clubHasFeature");
    expect(pageSource).not.toContain("requires Pro");
  });

  it("uses only the server-mediated admin client for tenant-scoped program persistence", () => {
    expect(pageSource).toMatch(/createClient\(\)\s*\.from\("programs"\)/);
    expect(pageSource).toContain('.order("sort_order"');
    expect(pageSource).not.toContain('from("@/lib/supabase-browser")');
    expect(pageSource).not.toMatch(/club_id\s*:/);
  });

  it("exposes every approved field, both media roles, and complete UX states", () => {
    for (const label of [
      "Navigation label",
      "Display title",
      "Kicker",
      "Summary",
      "Body",
      "Highlights",
      "Layout variant",
      "CTA label",
      "CTA destination",
      "Visibility",
      "Hero image",
      "Detail image",
      "Create program",
      "Save changes",
      "No programs yet",
      "Loading programs",
      "Program saved",
      "Unable to load programs",
      "Upload failed",
    ]) {
      expect(pageSource).toContain(label);
    }
  });

  it("adds the Programs surface to secure media authorization and payload attachment", () => {
    expect(MEDIA_SURFACES).toContain("programs");
    expect(clientSource).toContain('programs: { surface: "programs", kind: "photo" }');
  });
});
