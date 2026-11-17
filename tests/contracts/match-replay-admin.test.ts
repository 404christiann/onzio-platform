import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";

// A match insert must carry its season, date, kickoff and venue (/api/admin/data).
const MATCH = { season_id: "00000000-0000-4000-8000-000000000001", date: "2026-11-14", time: "18:00", opponent: "Ocelot FC", venue: "Delta Park" };
const save = (operation: "insert" | "update", replay_video_url: unknown) =>
  adminDataRequestSchema.safeParse({ table: "matches", operation, payload: { ...MATCH, replay_video_url } }).success;

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
    // site_branding now has its own strict schema, so a table on the generic rules is used.
    expect(adminDataRequestSchema.safeParse({ table: "players", operation: "update", payload: { replay_video_url: "https://example.test" } }).success).toBe(true);
  });
});
