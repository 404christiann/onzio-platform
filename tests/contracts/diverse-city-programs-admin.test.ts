import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DBProgram } from "@/lib/db-types";
import {
  buildProgramMutationPayload,
  emptyProgramDraft,
  moveHighlight,
  moveProgram,
  programDraftToContent,
  programToDraft,
  validateProgramDraft,
} from "@/lib/program-admin";
import { DEFAULT_PROGRAM_REGISTRATION_CONTENT } from "@/lib/program-content";
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
        registrationFormId: null,
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
      registrationFormId: null,
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

describe("Programs admin draft preview", () => {
  it("renders an unsaved draft through the real public program shape", () => {
    const draft = programToDraft(
      program({
        nav_label: "  Academy  ",
        body: "  Long-form program copy.  ",
      }),
    );
    const content = programDraftToContent({
      ...draft,
      heroMediaPreviewUrl: "https://media.example.test/hero.webp",
      detailMediaPreviewUrl: "https://media.example.test/detail.webp",
    });
    expect(content).toMatchObject({
      id: PROGRAM_ID,
      slug: "youth-academy",
      // Trimmed exactly as saving would trim it, so the preview shows what
      // publishing produces rather than what is currently typed.
      navLabel: "Academy",
      body: "Long-form program copy.",
      displayTitle: "Youth Academy",
      layoutVariant: "statement_band",
      heroMediaUrl: "https://media.example.test/hero.webp",
      detailMediaUrl: "https://media.example.test/detail.webp",
      externalCta: {
        label: "Learn more",
        href: "https://registration.example.test/program",
      },
    });
    expect(content).not.toHaveProperty("club_id");
    expect(content).not.toHaveProperty("clubId");
  });

  it("gives a brand new program a stable preview identity", () => {
    expect(programDraftToContent(emptyProgramDraft(0)).id).toBe(
      "draft-program",
    );
  });

  it("previews the registration band exactly as the public page resolves it", () => {
    const base = programToDraft(program({ registration_enabled: true }));

    // Blank registration copy previews the approved template defaults, not
    // empty paragraphs.
    const defaults = programDraftToContent(base).registration;
    expect(defaults).toEqual({
      enabled: true,
      ...DEFAULT_PROGRAM_REGISTRATION_CONTENT,
    });

    // A club value wins over the default.
    expect(
      programDraftToContent({
        ...base,
        registrationHeadline: "  Join the academy  ",
      }).registration.headline,
    ).toBe("Join the academy");

    // The toggle is what the public template branches on, and it is off by
    // default for a new program — this redesign does not change that.
    expect(
      programDraftToContent(emptyProgramDraft(0)).registration.enabled,
    ).toBe(false);
  });

  it("previews unsaved gallery uploads as ordered slides", () => {
    const content = programDraftToContent(
      programToDraft(program({ registration_enabled: true })),
      [
        {
          id: null,
          url: "https://media.example.test/two.webp",
          mediaAssetId: null,
          alt: "Second",
          sortOrder: 1,
        },
        {
          id: "77777777-7777-4777-8777-777777777701",
          url: "https://media.example.test/one.webp",
          mediaAssetId: null,
          alt: "First",
          sortOrder: 0,
        },
      ],
    );
    // Order comes from the draft's list position, so a just-reordered gallery
    // previews in its new order before it is saved.
    expect(content.media.map((item) => item.alt)).toEqual(["Second", "First"]);
    expect(content.media[0].url).toBe("https://media.example.test/two.webp");
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
      "Button label",
      "Button link",
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
    expect(clientSource).toContain(
      'programs: { surface: "programs", kind: "photo" }',
    );
  });

  it("organizes the per-program editor into Content, Media, and Registration tabs", () => {
    expect(pageSource).toContain(
      'type ProgramEditorTab = "content" | "media" | "registration"',
    );
    for (const label of [
      '{ id: "content", label: "Content" }',
      '{ id: "media", label: "Media" }',
      '{ id: "registration", label: "Registration" }',
    ]) {
      expect(pageSource).toContain(label);
    }
    for (const branch of [
      'activeTab === "content"',
      'activeTab === "media"',
      'activeTab === "registration"',
    ]) {
      expect(pageSource).toContain(branch);
    }
    // The switcher matches the shape /admin/about's SectionNav already uses.
    const aboutSource = readFileSync(
      resolve(process.cwd(), "app/admin/(protected)/about/page.tsx"),
      "utf8",
    );
    const switcherClass =
      'className="mt-3 grid gap-1 rounded-lg bg-card p-1 sm:grid-cols-3"';
    expect(aboutSource).toContain(switcherClass);
    expect(pageSource).toContain(switcherClass);
  });

  it("keeps the academy@1 slug hide working inside the Content tab", () => {
    expect(pageSource).toContain(
      'const hidesSlugField = club.presentationTemplateKey === "academy@1"',
    );
    expect(pageSource).toContain("{hidesSlugField ? (");
    expect(pageSource).toContain("Page address");
    // Still the manual Slug input for every other template.
    expect(pageSource).toMatch(/<FormField\s+label="Slug"/);
  });

  it("reveals the tab owning a validation error instead of hiding it", () => {
    expect(pageSource).toContain("PROGRAM_FIELD_TABS");
    // Tab switching now goes through `selectTab`, which additionally records
    // the slide direction for the shared SlidingPanel transition before
    // setting `activeTab`. Same requirement, same reveal, renamed setter.
    expect(pageSource).toContain("selectTab(PROGRAM_FIELD_TABS[firstField])");
  });

  it("renders a full-page live preview from the unsaved draft", () => {
    expect(pageSource).toContain("ScaledProgramPreview");
    expect(pageSource).toContain("program={previewProgram}");
    expect(pageSource).toContain("otherPrograms={previewOtherPrograms}");
    expect(pageSource).toContain("programDraftToContent");

    const previewSource = readFileSync(
      resolve(process.cwd(), "components/admin/ScaledProgramPreview.tsx"),
      "utf8",
    );
    // The whole public page, through the shared scaler every other admin
    // preview uses — not a fragment and not a second copy of the layout.
    expect(previewSource).toContain("AcademyProgramDetailPage");
    expect(previewSource).toContain("ScaledPagePreview");
    // No template gate on the preview itself; the route registry decides where
    // /programs exists.
    expect(previewSource).not.toContain("presentationTemplateKey");
  });

  it("adds an opt-in native registration mechanism with the old CTA fallback", () => {
    const detailSource = readFileSync(
      resolve(process.cwd(), "components/AcademyProgramDetailPage.tsx"),
      "utf8",
    );
    expect(detailSource).toContain("program.nativeRegistration !== null");
    expect(detailSource).toContain("<RegistrationCtaButton");
    expect(detailSource).toContain(": program.externalCta ? (");
    // A new program still defaults to the registration section switched off.
    expect(emptyProgramDraft(0).registrationEnabled).toBe(false);
    expect(emptyProgramDraft(0).registrationFormId).toBeNull();
    expect(buildProgramMutationPayload(emptyProgramDraft(0))).toMatchObject({
      registration_enabled: false,
      registration_form_id: null,
    });
  });
});
