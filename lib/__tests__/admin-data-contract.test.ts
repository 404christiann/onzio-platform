import { describe, expect, it } from "vitest";
import {
  ADMIN_TABLE_FEATURES,
  adminDataRequestSchema,
} from "@/lib/admin-data-contract";

describe("admin data request contract", () => {
  it("accepts a tenant-free validated content mutation", () => {
    expect(
      adminDataRequestSchema.safeParse({
        table: "site_branding",
        operation: "update",
        payload: {
          primary_color: "#aabbcc",
          homepage_url: "https://example.test",
        },
      }).success,
    ).toBe(true);
  });

  it("accepts editable homepage hero content as a homepage mutation", () => {
    expect(
      adminDataRequestSchema.safeParse({
        table: "homepage_hero_content",
        operation: "upsert",
        payload: {
          headline_line_one: "Capital City.",
          headline_line_two: "Roar as One.",
          intro: "Semi-pro soccer built for Columbus.",
          primary_cta_label: "Next match",
          primary_cta_href: "/schedule",
          secondary_cta_label: "Meet the squad",
          secondary_cta_href: "/roster",
        },
      }).success,
    ).toBe(true);
  });

  it.each(["club_id", "clubId"])(
    "rejects client-controlled tenant field %s",
    (field) => {
      const parsed = adminDataRequestSchema.safeParse({
        table: "players",
        operation: "insert",
        payload: { name: "Forged Player", [field]: "bravo" },
      });
      expect(parsed.success).toBe(false);
    },
  );

  it("rejects unsafe URL protocols and malformed media references", () => {
    const parsed = adminDataRequestSchema.safeParse({
      table: "players",
      operation: "update",
      payload: {
        profile_url: "javascript:alert(1)",
        photo_asset_id: "not-a-uuid",
      },
    });
    expect(parsed.success).toBe(false);
  });

  it.each([
    "registrations",
    "registration_forms",
    "registration_form_fields",
    "registration_price_options",
  ] as const)("allows the %s registration admin entity", (table) => {
    expect(ADMIN_TABLE_FEATURES[table]).toBe("registrations");
    expect(
      adminDataRequestSchema.safeParse({
        table,
        operation: "select",
      }).success,
    ).toBe(true);
  });
});
