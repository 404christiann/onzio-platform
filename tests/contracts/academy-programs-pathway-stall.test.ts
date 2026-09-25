import { afterEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  fetchPrograms: vi.fn(),
  fetchProgramsPageContent: vi.fn(),
}));

vi.mock("@/lib/queries", () => queries);

import { ACADEMY_PATHWAY_PROGRAMS_FALLBACK_MS, loadPathwayData } from "@/components/academy-pathway-data";

const clubId = "11111111-1111-4111-8111-111111111111";

afterEach(() => vi.useRealTimers());

describe("academy homepage program pathway loading", () => {
  it("releases a stalled list loader and still accepts a late program response", async () => {
    vi.useFakeTimers();
    let resolvePrograms!: (value: never[]) => void;
    queries.fetchPrograms.mockImplementationOnce(() => new Promise((resolve) => { resolvePrograms = resolve; }));
    queries.fetchProgramsPageContent.mockImplementationOnce(() => new Promise(() => {}));
    const callbacks = { onPrograms: vi.fn(), onProgramsSettled: vi.fn(), onContent: vi.fn() };

    const stop = loadPathwayData(clubId, "Diverse City FC", callbacks);
    vi.advanceTimersByTime(ACADEMY_PATHWAY_PROGRAMS_FALLBACK_MS - 1);
    expect(callbacks.onProgramsSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callbacks.onProgramsSettled).toHaveBeenCalledOnce();

    const programs = [{ id: "program-1", slug: "upsl-mens-teams", displayTitle: "Men's Teams" }];
    resolvePrograms(programs as never[]);
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onPrograms).toHaveBeenCalledWith(programs);
    expect(callbacks.onProgramsSettled).toHaveBeenCalledOnce();
    stop();
  });

  it("reveals ready program links while the editable copy request remains stalled", async () => {
    const programs = [{ id: "program-1", slug: "upsl-mens-teams", displayTitle: "Men's Teams" }];
    queries.fetchPrograms.mockResolvedValueOnce(programs);
    queries.fetchProgramsPageContent.mockImplementationOnce(() => new Promise(() => {}));
    const onPrograms = vi.fn();
    const onProgramsSettled = vi.fn();
    const onContent = vi.fn();

    const stop = loadPathwayData(clubId, "Diverse City FC", {
      onPrograms,
      onProgramsSettled,
      onContent,
    });

    await vi.waitFor(() => expect(onProgramsSettled).toHaveBeenCalledOnce());
    expect(onPrograms).toHaveBeenCalledWith(programs);
    expect(onContent).not.toHaveBeenCalled();
    expect(queries.fetchPrograms).toHaveBeenCalledWith(clubId);
    expect(queries.fetchProgramsPageContent).toHaveBeenCalledWith(clubId, "Diverse City FC");
    stop();
  });

  it("does not apply late results after the club changes or the section unmounts", async () => {
    let resolvePrograms!: (value: never[]) => void;
    let resolveContent!: (value: { pathwayHeading: string }) => void;
    queries.fetchPrograms.mockImplementationOnce(() => new Promise((resolve) => { resolvePrograms = resolve; }));
    queries.fetchProgramsPageContent.mockImplementationOnce(() => new Promise((resolve) => { resolveContent = resolve; }));
    const callbacks = {
      onPrograms: vi.fn(),
      onProgramsSettled: vi.fn(),
      onContent: vi.fn(),
    };

    const stop = loadPathwayData(clubId, "Diverse City FC", callbacks);
    stop();
    resolvePrograms([]);
    resolveContent({ pathwayHeading: "Late copy" });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.onPrograms).not.toHaveBeenCalled();
    expect(callbacks.onProgramsSettled).not.toHaveBeenCalled();
    expect(callbacks.onContent).not.toHaveBeenCalled();
  });
});
