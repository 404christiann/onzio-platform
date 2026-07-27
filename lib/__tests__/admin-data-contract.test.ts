import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";

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
});
