import { describe, expect, it } from "vitest";
import { withoutClientTenantIdentity } from "@/lib/admin-payload";

describe("withoutClientTenantIdentity", () => {
  it("removes tenant keys copied from an admin select before mutation", () => {
    const source = {
      club_id: "untrusted-club",
      clubId: "also-untrusted",
      hero_title: "About Club",
    };

    expect(withoutClientTenantIdentity(source)).toEqual({
      hero_title: "About Club",
    });
    expect(source.club_id).toBe("untrusted-club");
  });
});
