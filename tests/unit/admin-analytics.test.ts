import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

const PRODUCTION = { vercelEnv: "production", key: "phc_test_key" };
const IDENTITY = { userId: "user-1", clubId: "club-1", clubSlug: "rose-city", role: "owner" } as const;

// Each case gets fresh module state (the wrapper remembers init and club context).
async function load() {
  vi.resetModules();
  return import("@/lib/admin-analytics");
}

function postHogCalls() {
  return Object.values(posthog).reduce((count, fn) => count + fn.mock.calls.length, 0);
}

const browser = { location: { pathname: "/admin/homepage" } };

beforeEach(() => {
  browser.location.pathname = "/admin/homepage";
  vi.stubGlobal("window", browser);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveAdminAnalyticsConfig", () => {
  it("needs both Vercel production and a key", async () => {
    const { resolveAdminAnalyticsConfig } = await load();
    expect(resolveAdminAnalyticsConfig({ vercelEnv: "production" })).toBeNull();
    expect(resolveAdminAnalyticsConfig({ vercelEnv: "production", key: "  " })).toBeNull();
    expect(resolveAdminAnalyticsConfig({ vercelEnv: "preview", key: "phc_test_key" })).toBeNull();
    expect(resolveAdminAnalyticsConfig({ key: "phc_test_key" })).toBeNull();
  });

  it("defaults the host to PostHog US cloud and honours an override", async () => {
    const { resolveAdminAnalyticsConfig } = await load();
    expect(resolveAdminAnalyticsConfig(PRODUCTION)).toEqual({ key: "phc_test_key", host: "https://us.i.posthog.com" });
    expect(resolveAdminAnalyticsConfig({ ...PRODUCTION, host: "https://eu.i.posthog.com" })?.host).toBe("https://eu.i.posthog.com");
  });
});

describe("silent no-op", () => {
  it.each([
    ["no key", { vercelEnv: "production" }],
    ["preview deployment", { vercelEnv: "preview", key: "phc_test_key" }],
    ["local development", { key: "phc_test_key" }],
  ])("does nothing with %s", async (_label, env) => {
    const analytics = await load();
    expect(analytics.initAdminAnalytics(env)).toBe(false);
    analytics.identifyAdminSession(IDENTITY);
    analytics.trackAdminEvent("admin_tab_viewed", { tab: "homepage" });
    analytics.trackAdminEvent("admin_checkout_started");
    analytics.resetAdminAnalytics();
    expect(postHogCalls()).toBe(0);
  });

  it("does nothing on the server even with a production key", async () => {
    vi.unstubAllGlobals();
    const analytics = await load();
    expect(analytics.initAdminAnalytics(PRODUCTION)).toBe(false);
    analytics.trackAdminEvent("admin_tab_viewed", { tab: "homepage" });
    expect(postHogCalls()).toBe(0);
  });

  it("does nothing before init", async () => {
    const analytics = await load();
    analytics.identifyAdminSession(IDENTITY);
    analytics.trackAdminEvent("admin_modal_opened", { modal: "schedule:dialog" });
    analytics.resetAdminAnalytics();
    expect(postHogCalls()).toBe(0);
  });
});

describe("initAdminAnalytics", () => {
  it("initializes once with the masked, identified-only config", async () => {
    const { initAdminAnalytics } = await load();
    expect(initAdminAnalytics(PRODUCTION)).toBe(true);
    expect(initAdminAnalytics(PRODUCTION)).toBe(true);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith("phc_test_key", {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: { dom_event_allowlist: ["click"], element_attribute_ignorelist: ["value"] },
      session_recording: { maskAllInputs: true },
      before_send: expect.any(Function),
    });
  });
});

describe("identifyAdminSession", () => {
  it("sends only the opaque ids and role, stripping PII keys", async () => {
    const analytics = await load();
    analytics.initAdminAnalytics(PRODUCTION);
    const withPii = {
      ...IDENTITY,
      email: "owner@example.com",
      name: "Pat Owner",
      billingEmail: "billing@example.com",
      phone: "555-0100",
    };
    analytics.identifyAdminSession(withPii as typeof IDENTITY);

    const clubContext = { club_id: "club-1", club_slug: "rose-city", role: "owner" };
    expect(posthog.identify).toHaveBeenCalledWith("user-1", clubContext);
    expect(posthog.register).toHaveBeenCalledWith(clubContext);

    analytics.trackAdminEvent("admin_content_saved", { editor: "homepage" });
    expect(posthog.capture).toHaveBeenCalledWith("admin_content_saved", { editor: "homepage", ...clubContext });

    const sent = JSON.stringify([posthog.identify.mock.calls, posthog.register.mock.calls, posthog.capture.mock.calls]);
    for (const pii of ["owner@example.com", "Pat Owner", "billing@example.com", "555-0100"]) {
      expect(sent).not.toContain(pii);
    }
  });
});

describe("leaving the classic admin", () => {
  it("logout stops replay, resets PostHog and makes later calls no-ops", async () => {
    const analytics = await load();
    analytics.initAdminAnalytics(PRODUCTION);
    analytics.identifyAdminSession(IDENTITY);
    analytics.resetAdminAnalytics();

    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(posthog.reset).toHaveBeenCalledTimes(1);
    expect(posthog.stopSessionRecording.mock.invocationCallOrder[0]).toBeLessThan(posthog.reset.mock.invocationCallOrder[0]);
    analytics.trackAdminEvent("admin_tab_viewed", { tab: "dashboard" });
    analytics.identifyAdminSession(IDENTITY);
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).toHaveBeenCalledTimes(1);
  });

  it("an unmount pauses capture; coming back resumes replay without a second init and with a fresh identity", async () => {
    const analytics = await load();
    analytics.initAdminAnalytics(PRODUCTION);
    analytics.identifyAdminSession(IDENTITY);
    analytics.pauseAdminAnalytics();
    expect(posthog.stopSessionRecording).toHaveBeenCalledTimes(1);
    analytics.trackAdminEvent("admin_tab_viewed", { tab: "dashboard" });
    expect(posthog.capture).not.toHaveBeenCalled();

    expect(analytics.initAdminAnalytics(PRODUCTION)).toBe(true);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.startSessionRecording).toHaveBeenCalledTimes(1);
    analytics.trackAdminEvent("admin_tab_viewed", { tab: "dashboard" });
    expect(posthog.capture).toHaveBeenCalledTimes(1);
  });

  it("before_send drops everything (events, $pageleave, replay snapshots) off a classic admin page or while paused", async () => {
    const analytics = await load();
    analytics.initAdminAnalytics(PRODUCTION);
    const beforeSend = posthog.init.mock.calls[0][1].before_send as (event: unknown) => unknown;
    const event = { event: "$snapshot" };

    expect(beforeSend(event)).toBe(event);
    for (const pathname of ["/admin/login", "/admin/login?error=session_expired", "/admin/auth/callback", "/", "/schedule"]) {
      browser.location.pathname = pathname.split("?")[0];
      expect(beforeSend(event)).toBeNull();
    }
    browser.location.pathname = "/admin/homepage";
    analytics.pauseAdminAnalytics();
    expect(beforeSend(event)).toBeNull();
  });
});

describe("isClassicAdminPath", () => {
  it("accepts /admin pages and rejects login, auth and public pages", async () => {
    const { isClassicAdminPath } = await load();
    for (const path of ["/admin", "/admin/homepage", "/admin/seasons/totals", "/admin/login-help"]) expect(isClassicAdminPath(path)).toBe(true);
    for (const path of ["/admin/login", "/admin/login/verify", "/admin/auth", "/admin/auth/callback", "/", "/administrator", "/news"]) {
      expect(isClassicAdminPath(path)).toBe(false);
    }
  });
});

describe("adminTabForPath", () => {
  it("maps paths to static route ids, never the raw URL", async () => {
    const { adminTabForPath } = await import("@/lib/admin-analytics");
    expect(adminTabForPath("/admin")).toBe("dashboard");
    expect(adminTabForPath("/admin/homepage")).toBe("homepage");
    expect(adminTabForPath("/admin/seasons/totals")).toBe("seasons");
    expect(adminTabForPath("/admin/season-membership")).toBe("season-membership");
    expect(adminTabForPath("/admin/schedule/0d9c1f7e-1234")).toBe("schedule");
    expect(adminTabForPath("/admin/not-a-route")).toBe("other");
  });
});
