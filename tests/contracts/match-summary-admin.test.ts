import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import { EMPTY_MATCH_SUMMARY } from "@/lib/match-summary";

const summary = { ...EMPTY_MATCH_SUMMARY, events: [{ minute: "23′", side: "club", kind: "goal", player: "#8 J. Hernandez", detail: "" }] };
const save = (operation: "insert" | "update", value: unknown, table = "matches") =>
  adminDataRequestSchema.safeParse({ table, operation, payload: { opponent: "Ocelot FC", summary: value } }).success;

describe("match summary through the admin data route", () => {
  it("accepts a well-formed summary, a cleared summary and no summary field", () => {
    expect(save("update", summary)).toBe(true);
    expect(save("insert", null)).toBe(true);
    expect(adminDataRequestSchema.safeParse({ table: "matches", operation: "update", payload: { opponent: "Ocelot FC" } }).success).toBe(true);
  });
  it("rejects a malformed summary before it reaches the database", () => {
    expect(save("update", { ...summary, events: [{ ...summary.events[0], kind: "penalty" }] })).toBe(false);
    expect(save("insert", { events: [] })).toBe(false);
    expect(save("update", "summary")).toBe(false);
  });
  it("leaves a summary column on other tables to the generic rules", () => {
    expect(save("update", { anything: true }, "site_branding")).toBe(true);
  });
});
