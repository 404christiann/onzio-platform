import { beforeEach, expect, it, vi } from "vitest";
import { openCoordinationProof } from "../helpers/site-coordination-proof";

const db = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));

vi.mock("pg", () => ({
  Client: vi.fn(function () { return db; }),
}));
vi.mock("../helpers/environment", () => ({ assertSafeTestEnvironment: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  db.connect.mockResolvedValue(undefined);
  db.end.mockResolvedValue(undefined);
});

it.each([
  "statement timeout",
  "fingerprint",
  "trigger query",
  "trigger assertion",
])("closes the database when %s preflight fails", async stage => {
  const failure = new Error("preflight failed");
  db.query.mockImplementation(async (sql: string) => {
    const triggerQuery = sql.startsWith("select tgenabled");
    if (
      (stage === "statement timeout" && sql.startsWith("set statement_timeout")) ||
      (stage === "fingerprint" && sql.includes("jsonb_agg")) ||
      (stage === "trigger query" && triggerQuery)
    ) throw failure;
    return { rows: triggerQuery ? [{ tgenabled: "D" }] : [{ data: null }] };
  });

  await expect(openCoordinationProof()).rejects.toThrow(
    stage === "trigger assertion" ? "Presentation immutability must be enabled" : failure,
  );
  expect(db.connect).toHaveBeenCalledOnce();
  expect(db.end).toHaveBeenCalledOnce();
  expect(db.query.mock.calls.some(([sql]) => sql === "begin")).toBe(false);
});
