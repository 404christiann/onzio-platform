import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACADEMY_HERO_CONTENT_FALLBACK_MS, loadAcademyHeroContent } from "@/components/academy-hero-content-load";

afterEach(() => {
  vi.useRealTimers();
});

describe("academy hero retry after a failed server read", () => {
  it("uses a dedicated tenant hero read and bounds only the academy veil", () => {
    const hero = readFileSync(resolve(process.cwd(), "components/Hero.tsx"), "utf8");
    expect(hero).toContain('if (isAcademy) {\n      return loadAcademyHeroContent({');
    expect(hero).toContain("read: () => fetchHomepageHeroContent(club.id)");
    expect(hero).toContain("fetchHomepageContent(club.id)");
  });

  it("reveals the neutral hero after one second when the retry never settles", async () => {
    vi.useFakeTimers();
    const callbacks = {
      onContent: vi.fn(),
      onReady: vi.fn(),
      onError: vi.fn(),
    };
    const read = vi.fn().mockImplementation(() => new Promise(() => {}));
    const stop = loadAcademyHeroContent({ read, ...callbacks });

    await Promise.resolve();
    expect(read).toHaveBeenCalledOnce();
    expect(ACADEMY_HERO_CONTENT_FALLBACK_MS).toBe(1_000);
    await vi.advanceTimersByTimeAsync(999);
    expect(callbacks.onReady).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callbacks.onReady).toHaveBeenCalledOnce();
    expect(callbacks.onContent).not.toHaveBeenCalled();
    stop();
  });

  it("applies a late tenant hero without covering the page again", async () => {
    vi.useFakeTimers();
    let resolveHero!: (value: { headline_line_one: string }) => void;
    const callbacks = {
      onContent: vi.fn(),
      onReady: vi.fn(),
      onError: vi.fn(),
    };
    const stop = loadAcademyHeroContent({
      read: () => new Promise((resolve) => { resolveHero = resolve; }),
      ...callbacks,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(ACADEMY_HERO_CONTENT_FALLBACK_MS);
    expect(callbacks.onReady).toHaveBeenCalledOnce();
    const tenantHero = { headline_line_one: "Diverse City FC" };
    resolveHero(tenantHero);
    await vi.waitFor(() => expect(callbacks.onContent).toHaveBeenCalledWith(tenantHero));
    expect(callbacks.onReady).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
    stop();
  });

  it("settles promptly on success and ignores results after unmount", async () => {
    vi.useFakeTimers();
    const onContent = vi.fn();
    const onReady = vi.fn();
    const stop = loadAcademyHeroContent({
      read: async () => ({ headline_line_one: "Diverse City FC" }),
      onContent,
      onReady,
      onError: vi.fn(),
    });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(onContent).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(ACADEMY_HERO_CONTENT_FALLBACK_MS);
    expect(onReady).toHaveBeenCalledOnce();
    stop();

    let resolveLate!: (value: { headline_line_one: string }) => void;
    const stopped = loadAcademyHeroContent({
      read: () => new Promise((resolve) => { resolveLate = resolve; }),
      onContent,
      onReady,
      onError: vi.fn(),
    });
    await Promise.resolve();
    stopped();
    resolveLate({ headline_line_one: "Other club" });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(ACADEMY_HERO_CONTENT_FALLBACK_MS);
    expect(onContent).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
  });
});
