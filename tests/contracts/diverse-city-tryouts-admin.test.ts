import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_TABLE_FEATURES,
  adminDataRequestSchema,
  SINGLETON_TABLES,
} from "@/lib/admin-data-contract";
import type { DBTryout } from "@/lib/db-types";
import {
  buildTryoutMutationPayload,
  buildTryoutsPageMutationPayload,
  emptyTryoutsPageDraft,
  emptyTryoutDraft,
  moveTryout,
  tryoutsPageToDraft,
  tryoutToDraft,
  validateTryoutDraft,
  validateTryoutsPageDraft,
} from "@/lib/tryout-admin";
import {
  DEFAULT_TRYOUTS_PAGE_CONTENT,
  resolveTryoutsPageContent,
  TRYOUTS_PAGE_LIMITS,
} from "@/lib/tryouts-page-content";
import { MEDIA_SURFACES } from "@/lib/storage-path";

const TRYOUT_ID = "88888888-8888-4888-8888-888888888801";
const PROGRAM_ID = "66666666-6666-4666-8666-666666666601";
const HERO_ASSET_ID = "55555555-5555-4555-8555-555555555501";

function tryout(overrides: Partial<DBTryout> = {}): DBTryout {
  return {
    id: TRYOUT_ID,
    club_id: "11111111-1111-4111-8111-111111111111",
    program_id: PROGRAM_ID,
    status: "open",
    eyebrow: "UPSL tryouts",
    headline: "Earn your place",
    intro: "Meet the staff and compete in a professional environment.",
    hero_media_asset_id: HERO_ASSET_ID,
    eligibility_copy: "Open to eligible players age 18 and older.",
    what_to_expect_copy: "Technical and small-sided evaluation.",
    preparation_copy: "Bring boots, water, and identification.",
    event_date: "2026-09-12",
    location: "Diverse City Training Ground",
    cost_text: "Contact the club",
    cta_label: "Register externally",
    registration_href: "https://registration.example.test/tryouts",
    registration_form_id: null,
    closed_message: "Registration is closed for this opportunity.",
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("DCFC-303 Tryouts admin state and validation", () => {
  it("creates an honest upcoming draft at the requested list position", () => {
    expect(emptyTryoutDraft(3)).toEqual(
      expect.objectContaining({
        id: null,
        programId: null,
        status: "upcoming",
        eventDate: "",
        registrationHref: "",
        registrationFormId: null,
        heroMediaAssetId: null,
        sortOrder: 3,
      }),
    );
  });

  it("maps every approved event field without carrying tenant identity", () => {
    const draft = tryoutToDraft(tryout());
    expect(draft).toMatchObject({
      id: TRYOUT_ID,
      programId: PROGRAM_ID,
      status: "open",
      eyebrow: "UPSL tryouts",
      headline: "Earn your place",
      heroMediaAssetId: HERO_ASSET_ID,
      eligibilityCopy: "Open to eligible players age 18 and older.",
      whatToExpectCopy: "Technical and small-sided evaluation.",
      preparationCopy: "Bring boots, water, and identification.",
      eventDate: "2026-09-12",
      location: "Diverse City Training Ground",
      costText: "Contact the club",
      ctaLabel: "Register externally",
      registrationHref: "https://registration.example.test/tryouts",
      registrationFormId: null,
      closedMessage: "Registration is closed for this opportunity.",
      sortOrder: 0,
    });
    expect(draft).not.toHaveProperty("clubId");
    expect(draft).not.toHaveProperty("club_id");
    expect(draft).not.toHaveProperty("participants");
    expect(draft).not.toHaveProperty("faq");
  });

  it("accepts missing registration as a fail-closed state and rejects unsafe or malformed content", () => {
    const empty = emptyTryoutDraft();
    expect(validateTryoutDraft(empty)).toEqual({});
    expect(
      validateTryoutDraft({
        ...empty,
        eventDate: "2026-02-30",
        registrationHref: "javascript:alert(1)",
        intro: "x".repeat(321),
      }),
    ).toMatchObject({
      eventDate: expect.any(String),
      registrationHref: expect.any(String),
      intro: expect.any(String),
    });
    expect(
      validateTryoutDraft({
        ...empty,
        registrationHref: "https://registration.example.test/tryouts",
      }),
    ).toHaveProperty("ctaLabel");
  });

  it("normalizes a complete mutation payload and never emits tenant or participant identity", () => {
    const payload = buildTryoutMutationPayload(
      tryoutToDraft(
        tryout({
          headline: "  Earn your place  ",
          registration_href: "  https://registration.example.test/tryouts  ",
        }),
      ),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        program_id: PROGRAM_ID,
        status: "open",
        headline: "Earn your place",
        event_date: "2026-09-12",
        hero_media_asset_id: HERO_ASSET_ID,
        registration_href: "https://registration.example.test/tryouts",
      }),
    );
    for (const forbidden of [
      "club_id",
      "clubId",
      "participant_id",
      "participants",
      "registration_data",
      "payment",
      "waiver",
      "medical",
      "faq",
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it("reorders event rows without dropping content", () => {
    const rows = [
      tryoutToDraft(tryout({ id: "88888888-8888-4888-8888-888888888811" })),
      tryoutToDraft(tryout({ id: "88888888-8888-4888-8888-888888888812" })),
      tryoutToDraft(tryout({ id: "88888888-8888-4888-8888-888888888813" })),
    ];
    expect(moveTryout(rows, 2, -1).map((row) => row.id)).toEqual([
      "88888888-8888-4888-8888-888888888811",
      "88888888-8888-4888-8888-888888888813",
      "88888888-8888-4888-8888-888888888812",
    ]);
    expect(moveTryout(rows, 0, -1)).toBe(rows);
  });

  it("rejects participant, payment, waiver, medical, and FAQ payload fields", () => {
    for (const forbiddenField of [
      "participant_name",
      "participant_email",
      "payment_status",
      "waiver_accepted",
      "medical_notes",
      "faq",
    ]) {
      const parsed = adminDataRequestSchema.safeParse({
        table: "tryouts",
        operation: "insert",
        payload: { [forbiddenField]: "must not be stored" },
      });
      expect(parsed.success, forbiddenField).toBe(false);
    }
  });
});

describe("Tryouts page intro copy", () => {
  it("falls back to the approved wording for a missing row and for blanks", () => {
    expect(resolveTryoutsPageContent(null)).toEqual(
      DEFAULT_TRYOUTS_PAGE_CONTENT,
    );
    expect(
      resolveTryoutsPageContent({
        intro_with_tryouts: "",
        intro_no_tryouts: "   ",
      }),
    ).toEqual(DEFAULT_TRYOUTS_PAGE_CONTENT);
  });

  it("reproduces the previously hardcoded sentences byte for byte", () => {
    // A club with no row must render exactly what AcademyTryoutsPage used to
    // hardcode; anything else is a silent copy change at deploy time.
    expect(DEFAULT_TRYOUTS_PAGE_CONTENT.introWithTryouts).toBe(
      "Review current club evaluations below. Registration, waivers, and participant information stay with the club's external provider.",
    );
    expect(DEFAULT_TRYOUTS_PAGE_CONTENT.introNoTryouts).toBe(
      "Tryout dates and locations are still being finalized. Register your interest below to stay informed once details are announced.",
    );
    const component = readFileSync(
      resolve(process.cwd(), "components/AcademyTryoutsPage.tsx"),
      "utf8",
    );
    expect(component).not.toContain("Review current club evaluations below.");
    expect(component).not.toContain("Tryout dates and locations are still");
    expect(component).toContain(
      "{hasTryouts ? copy.introWithTryouts : copy.introNoTryouts}",
    );
  });

  it("lets a saved value win over the default, independently per field", () => {
    expect(
      resolveTryoutsPageContent({
        intro_with_tryouts: "  Come and try out.  ",
      }),
    ).toEqual({
      introWithTryouts: "Come and try out.",
      introNoTryouts: DEFAULT_TRYOUTS_PAGE_CONTENT.introNoTryouts,
    });
  });

  it("keeps the retired per-event prose off the public event card", () => {
    const component = readFileSync(
      resolve(process.cwd(), "components/AcademyTryoutsPage.tsx"),
      "utf8",
    );
    for (const retired of [
      "tryout.eyebrow",
      "tryout.intro",
      "tryout.eligibilityCopy",
      "Club evaluation",
      "Eligibility:",
    ]) {
      expect(component).not.toContain(retired);
    }
    // The name, the status, the logistics, and the action all still render.
    expect(component).toContain('{tryout.headline || "Tryout opportunity"}');
    expect(component).toContain("{tryout.status}");
    expect(component).toContain("tryout.action");
  });

  it("drafts, validates, and normalizes the page-copy editor state", () => {
    // Shows and saves the resolved template default as a real, editable
    // value rather than a placeholder hint (Christian found the
    // placeholder-only pattern confusing, 2026-08-09) — his explicit choice
    // over preserving the old "stays blank forever" auto-update behavior.
    expect(emptyTryoutsPageDraft()).toEqual(DEFAULT_TRYOUTS_PAGE_CONTENT);
    expect(tryoutsPageToDraft(null)).toEqual(emptyTryoutsPageDraft());
    expect(
      tryoutsPageToDraft({
        intro_with_tryouts: "One",
        intro_no_tryouts: "Two",
      }),
    ).toEqual({ introWithTryouts: "One", introNoTryouts: "Two" });

    expect(validateTryoutsPageDraft(emptyTryoutsPageDraft())).toEqual({});
    expect(
      validateTryoutsPageDraft({
        introWithTryouts: "x".repeat(TRYOUTS_PAGE_LIMITS.introWithTryouts + 1),
        introNoTryouts: "x".repeat(TRYOUTS_PAGE_LIMITS.introNoTryouts),
      }),
    ).toMatchObject({ introWithTryouts: expect.any(String) });

    const payload = buildTryoutsPageMutationPayload({
      introWithTryouts: "  Come and try out.  ",
      introNoTryouts: "",
    });
    expect(payload).toEqual({
      intro_with_tryouts: "Come and try out.",
      // Empty is preserved: it means "use the template default", not "render
      // nothing".
      intro_no_tryouts: "",
    });
    expect(payload).not.toHaveProperty("club_id");
    expect(payload).not.toHaveProperty("clubId");
  });

  it("registers the table as a tryouts-gated per-club singleton", () => {
    expect(ADMIN_TABLE_FEATURES.tryouts_page_content).toBe("tryouts");
    expect(SINGLETON_TABLES.has("tryouts_page_content")).toBe(true);
    expect(
      adminDataRequestSchema.safeParse({
        table: "tryouts_page_content",
        operation: "upsert",
        payload: { intro_with_tryouts: "Come and try out." },
      }).success,
    ).toBe(true);
    // Ceilings mirror the migration's CHECK constraints.
    expect(
      adminDataRequestSchema.safeParse({
        table: "tryouts_page_content",
        operation: "upsert",
        payload: { intro_with_tryouts: "x".repeat(321) },
      }).success,
    ).toBe(false);
    // Strict schema: nothing outside the two approved columns.
    expect(
      adminDataRequestSchema.safeParse({
        table: "tryouts_page_content",
        operation: "upsert",
        payload: { participant_email: "nope@example.test" },
      }).success,
    ).toBe(false);
  });

  it("creates the table with RLS, feature-scoped policies, and grants", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260809120000_tryouts_page_content.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("create table onzio.tryouts_page_content");
    expect(migration).toContain(
      "club_id uuid primary key references onzio.clubs(id) on delete restrict",
    );
    expect(migration).toContain("intro_with_tryouts text not null default ''");
    expect(migration).toContain("intro_no_tryouts text not null default ''");
    expect(migration).toContain(
      "check (char_length(intro_with_tryouts) <= 320)",
    );
    expect(migration).toContain("check (char_length(intro_no_tryouts) <= 320)");
    expect(migration).toContain(
      "alter table onzio.tryouts_page_content enable row level security",
    );
    expect(migration).toContain(
      "onzio_private.can_read_feature(club_id, 'tryouts')",
    );
    expect(migration).toContain(
      "onzio_private.can_mutate_feature(club_id, 'tryouts')",
    );
    expect(migration).toContain(
      "grant select on onzio.tryouts_page_content to anon, authenticated",
    );
    expect(migration).toContain(
      "grant insert, update, delete on onzio.tryouts_page_content to authenticated",
    );
    expect(migration).toContain(
      "grant all on onzio.tryouts_page_content to service_role",
    );
  });

  it("serves the resolved copy to the public page from the tenant route", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/%5Fclubs/[slug]/tryouts/page.tsx"),
      "utf8",
    );
    expect(route).toContain("fetchTryoutsPageContent");
    expect(route).toContain("content={content}");
    // The route stays academy@1-only, exactly as before.
    expect(route).toContain(
      'if (club.presentationTemplateKey !== "academy@1") notFound();',
    );
  });
});

describe("DCFC-303 protected Tryouts admin surface", () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), "app/admin/(protected)/tryouts/page.tsx"),
    "utf8",
  );
  const shellSource = readFileSync(
    resolve(process.cwd(), "lib/admin-route-manifest.ts"),
    "utf8",
  );
  const clientSource = readFileSync(
    resolve(process.cwd(), "lib/admin-client.ts"),
    "utf8",
  );
  const migrationSource = readdirSync(
    resolve(process.cwd(), "supabase/migrations"),
  )
    .filter((file) => file.endsWith(".sql"))
    .map((file) =>
      readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
    )
    .join("\n");

  it("registers Tryouts navigation without a tier gate", () => {
    expect(shellSource).toContain('label: "Tryouts"');
    expect(shellSource).toContain('href: "/admin/tryouts"');
    expect(shellSource).toContain('feature: "tryouts"');
    expect(pageSource).not.toContain("clubHasFeature");
    expect(pageSource).not.toContain("requires Pro");
  });

  it("uses only server-mediated tenant-scoped persistence", () => {
    expect(pageSource).toMatch(/createClient\(\)\s*\.from\("tryouts"\)/);
    expect(pageSource).toContain('.from("programs")');
    expect(pageSource).toContain('.order("sort_order"');
    expect(pageSource).not.toContain('from("@/lib/supabase-browser")');
    expect(pageSource).not.toMatch(/club_id\s*:/);
  });

  it("exposes the approved event, state, association, media, and complete UX fields", () => {
    for (const label of [
      "Program association",
      "Status",
      // The merged single name field, stored in the existing `headline`
      // column. It replaced the Eyebrow + Headline pair.
      'label="Name"',
      "Event date",
      "Location",
      "Cost",
      "Button text",
      "External registration destination",
      "Closed message",
      "Hero image",
      "Create tryout",
      "Save changes",
      "No tryout events yet",
      "Loading tryout events",
      "Tryout saved",
      "Unable to load tryout events",
      "Upload failed",
    ]) {
      expect(pageSource).toContain(label);
    }
  });

  it("no longer offers the retired per-event copy editors", () => {
    // The eyebrow/headline pair rendered as a small label stacked over a big
    // heading, and the four long-form blocks were cut outright. Each is asserted
    // as a `label="…"` prop so this cannot pass on an unrelated mention of the
    // word inside a comment or a placeholder.
    for (const retired of [
      'label="Eyebrow"',
      'label="Headline"',
      'label="Introduction"',
      'label="Eligibility"',
      'label="What to expect"',
      'label="Preparation"',
    ]) {
      expect(pageSource).not.toContain(retired);
    }
    // No input is bound to any of the retired drafts either.
    for (const binding of [
      "draft.eyebrow",
      "draft.intro",
      "draft.eligibilityCopy",
      "draft.whatToExpectCopy",
      "draft.preparationCopy",
    ]) {
      expect(pageSource).not.toContain(binding);
    }
    // The event list label falls back straight to "Untitled tryout" — the
    // eyebrow is no longer a naming source anywhere.
    expect(pageSource).not.toContain("tryout.eyebrow");
    expect(pageSource).toContain('{tryout.headline || "Untitled tryout"}');
  });

  it("keeps the retired columns writable so stored values survive a save", () => {
    // "Hide the UI, do not drop the column": the payload still round-trips
    // every retired field, so saving a tryout through the simplified editor
    // cannot blank content a club entered before the simplification.
    const payload = buildTryoutMutationPayload(tryoutToDraft(tryout()));
    expect(payload).toMatchObject({
      eyebrow: "UPSL tryouts",
      intro: "Meet the staff and compete in a professional environment.",
      eligibility_copy: "Open to eligible players age 18 and older.",
      what_to_expect_copy: "Technical and small-sided evaluation.",
      preparation_copy: "Bring boots, water, and identification.",
    });
  });

  it("adds a secure Tryouts media surface", () => {
    expect(MEDIA_SURFACES).toContain("tryouts");
    expect(clientSource).toContain(
      'tryouts: { surface: "tryouts", kind: "photo" }',
    );
    expect(migrationSource).toContain("when 'tryouts' then 'tryouts'");
  });

  it("edits both page-level intro paragraphs above the event list", () => {
    for (const label of [
      "Tryouts page intro",
      "Intro shown when tryouts are published",
      "Intro shown when none are published",
    ]) {
      expect(pageSource).toContain(label);
    }
    // Its own save action, following the "each section saves independently"
    // pattern the Shop and Programs editors already use.
    expect(pageSource).toContain("Save page intro");
    expect(pageSource).toMatch(
      /createClient\(\)\s*\.from\("tryouts_page_content"\)/,
    );
    expect(pageSource).toContain("savePageCopy");
    // The preview reflects the unsaved page-copy draft, not just saved rows.
    expect(pageSource).toContain("content={previewPageContent}");
  });

  it("offers native registration with external fallback and stores no submission data here", () => {
    expect(pageSource).toContain('label="Onzio registration form"');
    expect(pageSource).toContain("Draft, closed, or");
    expect(pageSource).not.toContain("<form");
    for (const forbidden of [
      "participant_name",
      "participant_email",
      "payment_status",
      "waiver_accepted",
      "medical_notes",
      "faq_items",
    ]) {
      expect(pageSource).not.toContain(forbidden);
    }
  });
});
