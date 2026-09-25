import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({ fetchHomepageStorySection: vi.fn() }));
vi.mock("@/lib/queries", () => queries);

import { ACADEMY_STORY_FALLBACK_MS, loadAcademyStoryData } from "@/components/academy-story-data";
import { resolveHomepageStorySection } from "@/lib/homepage-story-content";

const clubId = "11111111-1111-4111-8111-111111111111";
const clubName = "Diverse City FC";

beforeEach(() => {
  vi.useFakeTimers();
  queries.fetchHomepageStorySection.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("academy homepage story loading", () => {
  it("reveals approved fallback copy after a stalled read and accepts a late edited story", async () => {
    let resolveStory!: (story: ReturnType<typeof resolveHomepageStorySection>) => void;
    queries.fetchHomepageStorySection.mockImplementationOnce(
      () => new Promise((resolve) => { resolveStory = resolve; }),
    );
    const callbacks = { onContent: vi.fn(), onSettled: vi.fn() };
    const stop = loadAcademyStoryData(clubId, clubName, callbacks);

    expect(queries.fetchHomepageStorySection).toHaveBeenCalledWith(clubId, clubName);
    const fallback = resolveHomepageStorySection(null, clubName);
    expect(fallback.visible).toBe(true);
    expect(fallback.bodyPrimary).toContain(clubName);
    await vi.advanceTimersByTimeAsync(ACADEMY_STORY_FALLBACK_MS - 1);
    expect(callbacks.onSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callbacks.onSettled).toHaveBeenCalledOnce();
    expect(callbacks.onContent).not.toHaveBeenCalled();

    const edited = { ...fallback, heading: "Our edited story", visible: false };
    resolveStory(edited);
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onContent).toHaveBeenCalledWith(edited);
    expect(callbacks.onSettled).toHaveBeenCalledOnce();
    stop();
  });

  it("uses a timely club story without waiting for the fallback timer", async () => {
    const edited = { ...resolveHomepageStorySection(null, clubName), heading: "Club story" };
    queries.fetchHomepageStorySection.mockResolvedValueOnce(edited);
    const callbacks = { onContent: vi.fn(), onSettled: vi.fn() };
    loadAcademyStoryData(clubId, clubName, callbacks);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onContent).toHaveBeenCalledWith(edited);
    expect(callbacks.onSettled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reveals the fallback immediately after a failed story read", async () => {
    const error = new Error("story unavailable");
    queries.fetchHomepageStorySection.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const callbacks = { onContent: vi.fn(), onSettled: vi.fn() };
    loadAcademyStoryData(clubId, clubName, callbacks);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onContent).not.toHaveBeenCalled();
    expect(callbacks.onSettled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(log).toHaveBeenCalledWith("DevelopingNextGeneration:", error);
    log.mockRestore();
  });

  it("clears its timer and ignores a late response after unmount", async () => {
    let resolveStory!: (story: ReturnType<typeof resolveHomepageStorySection>) => void;
    queries.fetchHomepageStorySection.mockImplementationOnce(
      () => new Promise((resolve) => { resolveStory = resolve; }),
    );
    const callbacks = { onContent: vi.fn(), onSettled: vi.fn() };
    const stop = loadAcademyStoryData(clubId, clubName, callbacks);
    stop();
    expect(vi.getTimerCount()).toBe(0);

    resolveStory(resolveHomepageStorySection(null, clubName));
    await vi.advanceTimersByTimeAsync(ACADEMY_STORY_FALLBACK_MS);
    expect(callbacks.onContent).not.toHaveBeenCalled();
    expect(callbacks.onSettled).not.toHaveBeenCalled();
  });
});
