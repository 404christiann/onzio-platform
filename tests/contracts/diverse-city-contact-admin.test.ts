import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  DBContactPageContent,
  DBContactProfile,
} from "@/lib/db-types";
import {
  buildContactPagePayload,
  buildContactProfilePayload,
  contactRowsToDraft,
  emptyContactDraft,
  isValidPublicPhone,
  validateContactDraft,
} from "@/lib/contact-admin";
import { MEDIA_SURFACES } from "@/lib/storage-path";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const HERO_ASSET_ID = "55555555-5555-4555-8555-555555555501";

function profile(
  overrides: Partial<DBContactProfile> = {},
): DBContactProfile {
  return {
    club_id: CLUB_ID,
    public_email: "hello@diversecityfc.com",
    public_phone: "+1 (847) 555-0199",
    service_area: "Schaumburg, Illinois",
    hours: "Monday-Friday, 9:00 AM-5:00 PM",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function page(
  overrides: Partial<DBContactPageContent> = {},
): DBContactPageContent {
  return {
    club_id: CLUB_ID,
    eyebrow: "Contact Diverse City FC",
    headline: "Let's Build Something Together",
    intro: "Questions about the club, our programs, or community work? Reach out.",
    hero_media_asset_id: HERO_ASSET_ID,
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("DCFC-302 Contact admin state and validation", () => {
  it("creates an honest empty draft with explicit shared and page ownership", () => {
    expect(emptyContactDraft()).toEqual({
      profile: {
        publicEmail: "",
        publicPhone: "",
        serviceArea: "",
        hours: "",
      },
      page: {
        eyebrow: "",
        headline: "",
        intro: "",
        heroMediaAssetId: null,
        heroMediaPreviewUrl: "",
      },
    });
  });

  it("maps both singletons without carrying tenant identity", () => {
    const draft = contactRowsToDraft(profile(), page());
    expect(draft).toMatchObject({
      profile: {
        publicEmail: "hello@diversecityfc.com",
        publicPhone: "+1 (847) 555-0199",
        serviceArea: "Schaumburg, Illinois",
        hours: "Monday-Friday, 9:00 AM-5:00 PM",
      },
      page: {
        eyebrow: "Contact Diverse City FC",
        headline: "Let's Build Something Together",
        heroMediaAssetId: HERO_ASSET_ID,
      },
    });
    expect(JSON.stringify(draft)).not.toContain("club_id");
    expect(JSON.stringify(draft)).not.toContain("clubId");
  });

  it("validates public email and telephone destinations plus approved limits", () => {
    const draft = emptyContactDraft();
    expect(
      validateContactDraft({
        ...draft,
        profile: {
          ...draft.profile,
          publicEmail: "not-an-email",
          publicPhone: "javascript:alert(1)",
        },
        page: { ...draft.page, intro: "x".repeat(321) },
      }),
    ).toMatchObject({
      publicEmail: expect.any(String),
      publicPhone: expect.any(String),
      intro: expect.any(String),
    });

    expect(
      validateContactDraft({
        ...draft,
        profile: {
          ...draft.profile,
          publicEmail: "team@example.test",
          publicPhone: "+44 20 7946 0958 ext. 4",
        },
      }),
    ).toEqual({});
  });

  // Regression: PHONE_PATTERN required the string to begin with `+` or a digit,
  // so a number written the way North American clubs actually write it —
  // "(312) 731-9479" — never matched and /admin/contact refused to save it.
  it.each([
    "(312) 731-9479",
    "(312) 731-9479 x12",
    "(312)731-9479",
    "+1 (312) 731-9479",
    "312-731-9479",
    "312.731.9479",
    "+44 20 7946 0958 ext. 4",
    "",
  ])("accepts the valid public telephone %j", (publicPhone) => {
    expect(isValidPublicPhone(publicPhone)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "()",
    "(312) call-now",
    "(31) 22",
    "+1 (312) 731-9479 0123456789",
    "(312) 731-9479 x123456789",
    "<script>",
    "()-",
  ])("rejects the invalid public telephone %j", (publicPhone) => {
    expect(isValidPublicPhone(publicPhone)).toBe(false);
  });

  it("surfaces a field error for a phone number the pattern rejects", () => {
    const draft = emptyContactDraft();
    expect(
      validateContactDraft({
        ...draft,
        profile: { ...draft.profile, publicPhone: "(312) call-now" },
      }),
    ).toMatchObject({ publicPhone: expect.any(String) });
    expect(
      validateContactDraft({
        ...draft,
        profile: { ...draft.profile, publicPhone: "(312) 731-9479" },
      }),
    ).toEqual({});
  });

  it("builds separate normalized payloads and never emits club identity", () => {
    const draft = contactRowsToDraft(
      profile({ public_email: " team@example.test " }),
      page({ eyebrow: "  Reach us  " }),
    );
    const profilePayload = buildContactProfilePayload(draft.profile);
    const pagePayload = buildContactPagePayload(draft.page);
    expect(profilePayload).toEqual({
      public_email: "team@example.test",
      public_phone: "+1 (847) 555-0199",
      service_area: "Schaumburg, Illinois",
      hours: "Monday-Friday, 9:00 AM-5:00 PM",
    });
    expect(pagePayload).toEqual({
      eyebrow: "Reach us",
      headline: "Let's Build Something Together",
      intro: "Questions about the club, our programs, or community work? Reach out.",
      hero_media_asset_id: HERO_ASSET_ID,
    });
    expect(profilePayload).not.toHaveProperty("club_id");
    expect(pagePayload).not.toHaveProperty("club_id");
  });
});

describe("DCFC-302 protected Contact admin surface", () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), "app/admin/(protected)/contact/page.tsx"),
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
  const migrationSources = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260802020000_dcfc_302_contact_media_entitlement.sql",
    ),
    "utf8",
  );

  it("registers Starter-accessible Contact navigation", () => {
    expect(shellSource).toContain('label: "Contact"');
    expect(shellSource).toContain('href: "/admin/contact"');
    expect(shellSource).toContain('feature: "contact"');
  });

  it("uses only server-mediated singleton writes at the two ownership boundaries", () => {
    expect(pageSource).toContain('.from("contact_profile")');
    expect(pageSource).toContain('.from("contact_page_content")');
    expect(pageSource).toContain("buildContactProfilePayload");
    expect(pageSource).toContain("buildContactPagePayload");
    expect(pageSource).not.toContain('from("@/lib/supabase-browser")');
    expect(pageSource).not.toMatch(/club_id\s*:/);
  });

  it("makes shared ownership, page-only content, social ownership, and UX states explicit", () => {
    for (const label of [
      "Shared club data",
      "Contact page only",
      "Public email",
      "Public phone",
      "Service area",
      "Hours",
      "Eyebrow",
      "Headline",
      "Introduction",
      "Hero image",
      "Social links are managed in Branding",
      "Loading contact content",
      "Contact content saved",
      "Unable to load contact content",
      "Upload failed",
    ]) {
      expect(pageSource).toContain(label);
    }
  });

  it("adds an explicitly entitled Contact secure-media surface", () => {
    expect(MEDIA_SURFACES).toContain("contact");
    expect(clientSource).toContain(
      'contact: { surface: "contact", kind: "photo" }',
    );
    expect(migrationSources).toContain("when 'contact' then 'contact'");
  });

  it("does not introduce a public message-submission backend", () => {
    expect(pageSource).not.toContain('.from("contact_messages")');
    expect(pageSource).not.toContain("submitContactMessage");
    expect(pageSource).not.toContain("<form");
  });
});
