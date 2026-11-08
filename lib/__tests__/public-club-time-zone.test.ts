import { afterEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createPublicClient: () => ({
    schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
  }),
}));

const { readPublicClubTimeZone } = await import("../public-club-time-zone");

afterEach(() => {
  maybeSingle.mockReset();
  vi.useRealTimers();
});

describe("readPublicClubTimeZone is fail-safe", () => {
  it("returns the club's zone", async () => {
    maybeSingle.mockResolvedValue({ data: { time_zone: "America/Chicago" }, error: null });
    await expect(readPublicClubTimeZone("club")).resolves.toBe("America/Chicago");
  });

  it.each([
    ["the query errors", () => maybeSingle.mockResolvedValue({ data: null, error: { code: "42703" } })],
    ["the row is missing", () => maybeSingle.mockResolvedValue({ data: null, error: null })],
    ["the stored zone is not real", () => maybeSingle.mockResolvedValue({ data: { time_zone: "Mars/Phobos" }, error: null })],
    ["the client throws", () => maybeSingle.mockRejectedValue(new Error("network down"))],
  ])("falls back to Los Angeles when %s", async (_label, arrange) => {
    arrange();
    await expect(readPublicClubTimeZone("club")).resolves.toBe("America/Los_Angeles");
  });

  it("never holds the page longer than its budget", async () => {
    vi.useFakeTimers();
    maybeSingle.mockReturnValue(new Promise(() => undefined));
    const pending = readPublicClubTimeZone("club");
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toBe("America/Los_Angeles");
  });
});
