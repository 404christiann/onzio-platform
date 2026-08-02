import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import type { DBTryout } from "@/lib/db-types";
import {
  buildTryoutMutationPayload,
  emptyTryoutDraft,
  moveTryout,
  tryoutToDraft,
  validateTryoutDraft,
} from "@/lib/tryout-admin";
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

describe("DCFC-303 protected Tryouts admin surface", () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), "app/admin/(protected)/tryouts/page.tsx"),
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
  const migrationSource = readdirSync(
    resolve(process.cwd(), "supabase/migrations"),
  )
    .filter((file) => file.endsWith(".sql"))
    .map((file) =>
      readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
    )
    .join("\n");

  it("registers Tryouts navigation and enforces Pro entitlement before loading", () => {
    expect(shellSource).toContain('label: "Tryouts"');
    expect(shellSource).toContain('href: "/admin/tryouts"');
    expect(shellSource).toContain('feature: "tryouts"');
    expect(pageSource).toContain('clubHasFeature(club.tier, "tryouts")');
    expect(pageSource).toContain("Tryouts requires Pro");
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
      "Eyebrow",
      "Headline",
      "Introduction",
      "Eligibility",
      "What to expect",
      "Preparation",
      "Event date",
      "Location",
      "Cost",
      "CTA label",
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

  it("adds a Pro-entitled secure Tryouts media surface", () => {
    expect(MEDIA_SURFACES).toContain("tryouts");
    expect(clientSource).toContain(
      'tryouts: { surface: "tryouts", kind: "photo" }',
    );
    expect(migrationSource).toContain("when 'tryouts' then 'tryouts'");
  });

  it("keeps registration external and stores no participant, payment, waiver, medical, or FAQ data", () => {
    expect(pageSource).toContain("Registration stays on the external destination");
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
