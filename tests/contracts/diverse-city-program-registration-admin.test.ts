import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_TABLE_FEATURES,
  adminDataRequestSchema,
} from "@/lib/admin-data-contract";
import type { DBProgram, DBProgramMedia } from "@/lib/db-types";
import {
  buildProgramMediaMutationPayload,
  buildProgramMutationPayload,
  moveProgramMedia,
  programMediaToDraft,
  programToDraft,
  validateProgramDraft,
  validateProgramMedia,
  type ProgramMediaDraft,
} from "@/lib/program-admin";
import {
  DEFAULT_PROGRAM_REGISTRATION_CONTENT,
  normalizeProgramMedia,
  PROGRAM_MEDIA_LIMITS,
  resolveProgramRegistration,
} from "@/lib/program-content";

const ROOT = resolve(__dirname, "../..");
const PROGRAM_ID = "44444444-4444-4444-8444-444444444401";
const MEDIA_ID = "44444444-4444-4444-8444-444444444402";
const ASSET_ID = "55555555-5555-4555-8555-555555555501";

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function program(overrides: Partial<DBProgram> = {}): DBProgram {
  return {
    id: PROGRAM_ID,
    club_id: "11111111-1111-4111-8111-111111111111",
    slug: "special-olympics-soccer",
    nav_label: "Special Olympics",
    display_title: "Empowering Athletes",
    kicker: "Train, compete, belong",
    summary: "Training and competition.",
    body: "Long-form program copy.",
    highlights: ["Training and competition"],
    layout_variant: "statement_band",
    hero_media_asset_id: ASSET_ID,
    detail_media_asset_id: null,
    external_cta_label: "",
    external_cta_href: "",
    registration_form_id: null,
    registration_enabled: false,
    registration_eyebrow: "",
    registration_headline: "",
    registration_body: "",
    registration_pending_body: "",
    registration_pending_label: "",
    status: "active",
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function mediaRow(overrides: Partial<DBProgramMedia> = {}): DBProgramMedia {
  return {
    id: MEDIA_ID,
    club_id: "11111111-1111-4111-8111-111111111111",
    program_id: PROGRAM_ID,
    url: "/images/programs/special-olympics-slide-01.webp",
    media_asset_id: null,
    alt: "Athletes greeting competitors",
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function request(overrides: Record<string, unknown>) {
  return adminDataRequestSchema.safeParse({
    table: "program_media",
    operation: "insert",
    columns: "*",
    filters: [],
    ...overrides,
  });
}

describe("program registration copy is real admin content", () => {
  it("falls back to the approved academy@1 wording when a club has changed nothing", () => {
    expect(resolveProgramRegistration(program())).toEqual({
      enabled: false,
      ...DEFAULT_PROGRAM_REGISTRATION_CONTENT,
    });
  });

  it("prefers every stored value over the template default", () => {
    const stored = program({
      registration_enabled: true,
      registration_eyebrow: "Join the team",
      registration_headline: "Spring registration is open.",
      registration_body: "Complete registration with our partner.",
      registration_pending_body: "Details land here shortly.",
      registration_pending_label: "Opening soon",
    });
    expect(resolveProgramRegistration(stored)).toEqual({
      enabled: true,
      eyebrow: "Join the team",
      headline: "Spring registration is open.",
      body: "Complete registration with our partner.",
      pendingBody: "Details land here shortly.",
      pendingLabel: "Opening soon",
    });
  });

  it("treats whitespace-only copy as unset rather than rendering a blank band", () => {
    const registration = resolveProgramRegistration(
      program({ registration_headline: "   " }),
    );
    expect(registration.headline).toBe(
      DEFAULT_PROGRAM_REGISTRATION_CONTENT.headline,
    );
  });

  it("round-trips every registration field through the admin draft", () => {
    const row = program({
      registration_enabled: true,
      registration_eyebrow: "Join the team",
      registration_headline: "Spring registration is open.",
      registration_body: "Complete registration with our partner.",
      registration_pending_body: "Details land here shortly.",
      registration_pending_label: "Opening soon",
      registration_form_id: "77777777-7777-4777-8777-777777777701",
    });
    const payload = buildProgramMutationPayload(programToDraft(row));
    expect(payload).toMatchObject({
      registration_enabled: true,
      registration_eyebrow: "Join the team",
      registration_headline: "Spring registration is open.",
      registration_body: "Complete registration with our partner.",
      registration_pending_body: "Details land here shortly.",
      registration_pending_label: "Opening soon",
      registration_form_id: "77777777-7777-4777-8777-777777777701",
    });
    expect(payload).not.toHaveProperty("club_id");
  });

  it.each([
    ["registrationEyebrow", 80],
    ["registrationHeadline", 120],
    ["registrationBody", 1_200],
    ["registrationPendingBody", 1_200],
    ["registrationPendingLabel", 60],
  ] as const)("rejects %s beyond %i characters", (field, maximum) => {
    const draft = programToDraft(program());
    const errors = validateProgramDraft({
      ...draft,
      [field]: "x".repeat(maximum + 1),
    });
    expect(errors[field]).toBeTruthy();
    expect(
      validateProgramDraft({ ...draft, [field]: "x".repeat(maximum) })[field],
    ).toBeUndefined();
  });
});

describe("program gallery admin state", () => {
  it("normalizes rows into ordered slides and drops sourceless ones", () => {
    expect(
      normalizeProgramMedia([
        mediaRow({ id: "b", url: "/images/b.webp", sort_order: 1 }),
        mediaRow({ id: "a", url: "/images/a.webp", sort_order: 0 }),
        mediaRow({ id: "blank", url: "   ", sort_order: 2 }),
      ]).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });

  it("returns no slides for a program with no gallery", () => {
    expect(normalizeProgramMedia(undefined)).toEqual([]);
    expect(normalizeProgramMedia([])).toEqual([]);
  });

  it("renumbers sort order when an image is reordered", () => {
    const gallery: ProgramMediaDraft[] = [
      { id: "a", url: "/a.webp", mediaAssetId: null, alt: "", sortOrder: 0 },
      { id: "b", url: "/b.webp", mediaAssetId: null, alt: "", sortOrder: 1 },
      { id: "c", url: "/c.webp", mediaAssetId: null, alt: "", sortOrder: 2 },
    ];
    expect(
      moveProgramMedia(gallery, 2, -1).map((i) => [i.id, i.sortOrder]),
    ).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ]);
    expect(moveProgramMedia(gallery, 0, -1)).toBe(gallery);
  });

  it("builds a mutation payload without tenant identity", () => {
    const payload = buildProgramMediaMutationPayload(
      programMediaToDraft(mediaRow({ media_asset_id: ASSET_ID })),
      PROGRAM_ID,
    );
    expect(payload).toEqual({
      program_id: PROGRAM_ID,
      url: "/images/programs/special-olympics-slide-01.webp",
      media_asset_id: ASSET_ID,
      alt: "Athletes greeting competitors",
      sort_order: 0,
    });
    expect(payload).not.toHaveProperty("club_id");
  });

  it("refuses a gallery that exceeds the admin ceiling or loses its source", () => {
    const item: ProgramMediaDraft = {
      id: null,
      url: "/a.webp",
      mediaAssetId: null,
      alt: "",
      sortOrder: 0,
    };
    expect(validateProgramMedia([item])).toBeNull();
    expect(
      validateProgramMedia(
        Array.from({ length: PROGRAM_MEDIA_LIMITS.items + 1 }, () => item),
      ),
    ).toMatch(/at most/);
    expect(
      validateProgramMedia([{ ...item, url: "", mediaAssetId: null }]),
    ).toMatch(/uploaded file/);
    expect(
      validateProgramMedia([
        { ...item, alt: "x".repeat(PROGRAM_MEDIA_LIMITS.alt + 1) },
      ]),
    ).toMatch(/characters or fewer/);
  });
});

describe("program_media admin data contract", () => {
  it("gates the table behind the programs feature", () => {
    expect(ADMIN_TABLE_FEATURES.program_media).toBe("programs");
  });

  it("accepts a well-formed gallery insert", () => {
    expect(
      request({
        payload: {
          program_id: PROGRAM_ID,
          url: "/images/programs/slide-01.webp",
          media_asset_id: ASSET_ID,
          alt: "Slide one",
          sort_order: 0,
        },
      }).success,
    ).toBe(true);
  });

  it("requires a program and a renderable source on insert", () => {
    expect(
      request({ payload: { url: "/images/programs/slide-01.webp" } }).success,
    ).toBe(false);
    expect(
      request({ payload: { program_id: PROGRAM_ID, alt: "No source" } })
        .success,
    ).toBe(false);
  });

  it.each([
    "mailto:club@example.test",
    "javascript:alert(1)",
    "//evil.example.test/photo.webp",
    "/\\evil.example.test/photo.webp",
  ])("rejects %s as an image source", (url) => {
    expect(request({ payload: { program_id: PROGRAM_ID, url } }).success).toBe(
      false,
    );
  });

  it("rejects a client-supplied tenant identity", () => {
    expect(
      request({
        payload: {
          club_id: "11111111-1111-4111-8111-111111111111",
          program_id: PROGRAM_ID,
          url: "/images/programs/slide-01.webp",
        },
      }).success,
    ).toBe(false);
  });

  it("allows a reorder update that carries only sort_order", () => {
    expect(
      request({ operation: "update", payload: { sort_order: 2 } }).success,
    ).toBe(true);
  });

  it("caps registration copy on the programs mutation schema", () => {
    const base = {
      table: "programs",
      operation: "update",
      columns: "*",
      filters: [],
    };
    expect(
      adminDataRequestSchema.safeParse({
        ...base,
        payload: { registration_headline: "x".repeat(120) },
      }).success,
    ).toBe(true);
    expect(
      adminDataRequestSchema.safeParse({
        ...base,
        payload: { registration_headline: "x".repeat(121) },
      }).success,
    ).toBe(false);
    expect(
      adminDataRequestSchema.safeParse({
        ...base,
        payload: { registration_body: "x".repeat(1_201) },
      }).success,
    ).toBe(false);
  });
});

describe("academy@1 program surfaces render stored content, not literals", () => {
  const detailPage = source("components/AcademyProgramDetailPage.tsx");

  it("no longer hardcodes the registration band copy", () => {
    for (const literal of [
      "Program Registration",
      "Ready to take the field?",
      "Registration Link Coming Soon",
      "Registration is completed through our external registration partner",
    ]) {
      expect(
        detailPage.includes(literal),
        `${literal} must come from admin content, not component source`,
      ).toBe(false);
    }
  });

  it("no longer hardcodes the Special Olympics slideshow or its slug", () => {
    expect(detailPage).not.toContain("special-olympics-soccer");
    expect(detailPage).not.toContain("special-olympics-slide-");
    expect(detailPage).not.toContain("SPECIAL_OLYMPICS_SLIDES");
  });

  it("renders the resolved registration values and the stored gallery", () => {
    expect(detailPage).toContain("registration.eyebrow");
    expect(detailPage).toContain("registration.headline");
    expect(detailPage).toContain("registration.body");
    expect(detailPage).toContain("registration.pendingBody");
    expect(detailPage).toContain("registration.pendingLabel");
    expect(detailPage).toContain("program.media.map");
  });

  it("keeps the homepage Next Match band on admin-editable club facts", () => {
    const nextMatch = source("components/AcademyNextMatch.tsx");
    expect(
      nextMatch.includes("UPSL Midwest Central"),
      "the competition name belongs to the standings settings a club edits",
    ).toBe(false);
    expect(
      nextMatch.includes("Schaumburg, Illinois"),
      "the fallback location belongs to the club's contact service area",
    ).toBe(false);
    expect(nextMatch).toContain("fetchLeagueStandings");
    expect(nextMatch).toContain("fetchContactProfile");
  });

  it("keeps no club's name written into a shared academy@1 template", () => {
    for (const path of [
      "components/AcademySponsorsPage.tsx",
      "components/AcademyProgramDetailPage.tsx",
      "components/AcademyProgramsPage.tsx",
      "components/AcademyContactPage.tsx",
      "components/AcademyTryoutsPage.tsx",
    ]) {
      expect(
        source(path).includes("Diverse City"),
        `${path} must take the club name as data, not a literal`,
      ).toBe(false);
    }
  });

  it("exposes every new field in the programs admin form", () => {
    const adminPage = source("app/admin/(protected)/programs/page.tsx");
    for (const field of [
      "registrationFormId",
      "registrationEnabled",
      "registrationEyebrow",
      "registrationHeadline",
      "registrationBody",
      "registrationPendingBody",
      "registrationPendingLabel",
    ]) {
      expect(
        adminPage,
        `${field} must be editable in /admin/programs`,
      ).toContain(field);
    }
    expect(adminPage).toContain("uploadGalleryImage");
    expect(adminPage).toContain("program_media");
  });
});
