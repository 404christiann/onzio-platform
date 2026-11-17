import { describe, expect, it } from "vitest";
import { insertedRowsMatch, newStandingRow, prepareStandingsCommand, reconcileStandingsDraft, type StandingsDraft } from "@/lib/admin-standings-draft";
import { DEFAULT_STANDINGS_SETTINGS } from "@/lib/standings-content";

const row = () => ({ ...newStandingRow(0), id: "11111111-1111-4111-8111-111111111111", team_name: " Team ", team_abbreviation: "", played: -1, goal_difference: -4 });
const draft = (): StandingsDraft => ({ settings: { ...DEFAULT_STANDINGS_SETTINGS, eyebrow: " ", title: " ", intro: " intro " }, rows: [row()] });
describe("classic standings immutable save commands", () => {
  it("keeps exact payload fields, cleaning, entry order and stable new IDs", () => {
    const input = draft(), original = { ...input, rows: [] };
    const request = prepareStandingsCommand(input, original, "season", ["old", "old"], "2026-11-15T00:00:00.000Z");
    input.rows[0].team_name = "Newer";
    expect(request.submitted.rows[0].team_name).toBe(" Team ");
    expect(request.steps.map((step) => step.operation)).toEqual(["upsert", "insert"]);
    expect(request.steps[1].payload?.[0]).toEqual({
      id: input.rows[0].id, season_id: "season", team_name: "Team", team_abbreviation: "T",
      logo_url: null, played: 0, wins: 0, draws: 0, losses: 0, goal_difference: -4,
      points: 0, is_club: false, sort_order: 0, updated_at: "2026-11-15T00:00:00.000Z",
    });
    expect(request.droppedLogos).toEqual(["old"]);
  });
  it("requires every inserted identity and value before accepting an unknown response", () => {
    const request = prepareStandingsCommand(draft(), { ...draft(), rows: [] }, "season", []);
    const step = request.steps[1], payload = step.payload!;
    expect(insertedRowsMatch(step, [])).toBe("missing");
    expect(insertedRowsMatch(step, payload)).toBe("confirmed");
    expect(insertedRowsMatch(step, payload, "club")).toBe("conflict");
    expect(insertedRowsMatch(step, payload.map((row) => ({ ...row, club_id: "club" })), "club")).toBe("confirmed");
    expect(insertedRowsMatch(step, [{ ...payload[0], team_name: "Different" }])).toBe("conflict");
    expect(insertedRowsMatch(step, [...payload, { id: "extra" }])).toBe("conflict");
  });
  it("preserves newer edits and remaps sample identities only after confirmation", () => {
    const input = draft(); input.rows[0].id = "default-sample";
    const request = prepareStandingsCommand(input, { ...input, rows: [] }, "season", []);
    const newer = structuredClone(input); newer.rows[0].team_name = "Newer team";
    const result = reconcileStandingsDraft(newer, request, request.confirmed);
    expect(result.rows[0]).toMatchObject({ id: request.confirmed.rows[0].id, team_name: "Newer team", isNew: false });
    expect(reconcileStandingsDraft(input, request, request.confirmed)).toEqual(request.confirmed);
  });
  it("deletes only removed persisted IDs, preserving the submitted row order", () => {
    const first = { ...row(), isNew: false }, second = { ...row(), id: "22222222-2222-4222-8222-222222222222", isNew: false };
    const request = prepareStandingsCommand({ ...draft(), rows: [second] }, { ...draft(), rows: [first, second] }, "season", []);
    expect(request.steps.map((step) => step.operation)).toEqual(["upsert", "delete", "upsert"]);
    expect(request.steps[1].ids).toEqual([first.id]);
    expect(request.steps[2].payload?.[0].sort_order).toBe(0);
  });
});
