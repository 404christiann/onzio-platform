import { describe, expect, it, vi } from "vitest";
import { buildRegistrationMix } from "@/lib/admin-dashboard-mix";
import { loadAdminDashboardData } from "@/lib/admin-dashboard-data";

describe("buildRegistrationMix", () => {
  const forms = Array.from({ length: 7 }, (_, index) => ({
    id: `form-${index + 1}`,
    title: `Form ${index + 1}`,
    createdAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
  }));

  it("counts only rows that belong to current forms", () => {
    expect(
      buildRegistrationMix(forms.slice(0, 2), [
        { formId: "form-1" },
        { formId: "form-1" },
        { formId: "archived-form" },
      ]),
    ).toEqual([{ id: "form-1", label: "Form 1", count: 2, percentage: 100 }]);
  });

  it("groups entries after the leading five into Other", () => {
    const registrations = forms.flatMap((form, index) =>
      Array.from({ length: 7 - index }, () => ({ formId: form.id })),
    );
    const result = buildRegistrationMix(forms, registrations);
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ id: "other", label: "Other", count: 3 });
  });

  it("uses stable tie ordering and exact whole percentages totaling 100", () => {
    const result = buildRegistrationMix(forms.slice(0, 3), [
      { formId: "form-1" },
      { formId: "form-2" },
      { formId: "form-3" },
    ]);
    expect(result.map((item) => item.id)).toEqual(["form-1", "form-2", "form-3"]);
    expect(result.map((item) => item.percentage)).toEqual([34, 33, 33]);
    expect(result.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
  });

  it("returns an empty mix when no current form has paid rows", () => {
    expect(buildRegistrationMix(forms, [])).toEqual([]);
  });
});

describe("loadAdminDashboardData uses the club's today (ADMIN-RE-03)", () => {
  // A chainable stand-in for the Supabase client: every builder call returns the
  // chain, awaiting it gives an empty result, and gte() calls are recorded.
  function recordingClient() {
    const gteCalls: Array<[string, unknown]> = [];
    const empty = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") return (resolve: (value: unknown) => void) => resolve(empty);
          if (property === "maybeSingle" || property === "single") {
            return () => Promise.resolve({ data: null, error: null });
          }
          if (property === "gte") {
            return (column: string, value: unknown) => {
              gteCalls.push([column, value]);
              return chain;
            };
          }
          return () => chain;
        },
      },
    );
    return { client: { schema: () => chain }, gteCalls };
  }

  it.each([
    // 2026-03-15 06:30 UTC: already the 15th in Chicago, still the 14th in Los Angeles.
    ["America/Chicago", "2026-03-15"],
    ["America/Los_Angeles", "2026-03-14"],
  ])("in %s, upcoming events start from %s", async (timeZone, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T06:30:00Z"));
    try {
      const { client, gteCalls } = recordingClient();
      await loadAdminDashboardData(client as never, "club-id", timeZone);
      expect(gteCalls).toContainEqual(["event_date", expected]);
    } finally {
      vi.useRealTimers();
    }
  });
});
