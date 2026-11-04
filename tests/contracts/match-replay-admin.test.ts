import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";

const save = (operation: "insert" | "update", replay_video_url: unknown) =>
  adminDataRequestSchema.safeParse({ table: "matches", operation, payload: { opponent: "Ocelot FC", replay_video_url } }).success;

describe("match replay video through the admin data route", () => {
  it("accepts the stored embed link, a cleared field and no field", () => {
    expect(save("update", "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0")).toBe(true);
    expect(save("insert", null)).toBe(true);
    expect(save("update", "")).toBe(true);
    expect(adminDataRequestSchema.safeParse({ table: "matches", operation: "update", payload: { opponent: "Ocelot FC" } }).success).toBe(true);
  });
  it("rejects links that the editor would have normalized or refused", () => {
    expect(save("update", "https://www.youtube.com/watch?v=fJf_A4LdKDw")).toBe(false);
    expect(save("insert", "https://vimeo.com/123456")).toBe(false);
    expect(save("update", "/local/video")).toBe(false);
    expect(save("update", 42)).toBe(false);
  });
  it("leaves the same column name on other tables to the generic URL rule", () => {
    expect(adminDataRequestSchema.safeParse({ table: "site_branding", operation: "update", payload: { replay_video_url: "https://example.test" } }).success).toBe(true);
  });
});
