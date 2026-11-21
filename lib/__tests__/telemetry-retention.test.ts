import { describe, expect, it, vi } from "vitest";
import { RETENTION_MAX_EVENTS_PER_RUN, runTelemetryRetention } from "@/lib/telemetry/retention";

const SWEPT = {
  maxEvents: 100000,
  eventsDeleted: 5000,
  saltsDeleted: 2,
  rateWindowsDeleted: 31,
  dropCountsDeleted: 4,
  moreEventsRemain: true,
};

function harness(response: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null, ...response }));
  const schema = vi.fn(() => ({ rpc }));
  return { service: { schema } as never, rpc, schema };
}

describe("runTelemetryRetention", () => {
  it("calls onzio.sweep_page_telemetry once with the per-run bound and returns the counts", async () => {
    const { service, rpc, schema } = harness({ data: SWEPT });
    await expect(runTelemetryRetention({ service })).resolves.toEqual(SWEPT);
    expect(schema).toHaveBeenCalledWith("onzio");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("sweep_page_telemetry", { p_max_events: RETENTION_MAX_EVENTS_PER_RUN });
    expect(RETENTION_MAX_EVENTS_PER_RUN).toBe(100_000);
  });

  it("passes a different bound through", async () => {
    const { service, rpc } = harness({ data: { ...SWEPT, maxEvents: 500 } });
    await expect(runTelemetryRetention({ service, maxEvents: 500 })).resolves.toMatchObject({ maxEvents: 500 });
    expect(rpc).toHaveBeenCalledWith("sweep_page_telemetry", { p_max_events: 500 });
  });

  it("throws, without leaking detail into a result, when the database call fails", async () => {
    await expect(runTelemetryRetention({ service: harness({ error: { message: "boom" } }).service })).rejects.toThrow("boom");
    await expect(runTelemetryRetention({ service: harness({ data: null }).service })).rejects.toThrow("empty result");
  });

  it.each([
    ["an array", []],
    ["a string", "swept"],
    ["a missing flag", { ...SWEPT, moreEventsRemain: undefined }],
    ["a text flag", { ...SWEPT, moreEventsRemain: "false" }],
    ["a text count", { ...SWEPT, eventsDeleted: "5000" }],
    ["a negative count", { ...SWEPT, saltsDeleted: -1 }],
    ["a fractional count", { ...SWEPT, rateWindowsDeleted: 1.5 }],
    ["a missing count", { ...SWEPT, dropCountsDeleted: undefined }],
  ])("refuses %s from the database instead of reporting a clean run", async (_label, data) => {
    await expect(runTelemetryRetention({ service: harness({ data }).service })).rejects.toThrow();
  });
});
