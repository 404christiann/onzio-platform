import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightsData } from "@/lib/telemetry/insights-data";

const { loadAdminTabPage, loadInsightsData } = vi.hoisted(() => ({
  loadAdminTabPage: vi.fn(),
  loadInsightsData: vi.fn(),
}));
vi.mock("@/lib/admin-tab-page", () => ({ loadAdminTabPage }));
vi.mock("@/lib/telemetry/insights-data", () => ({ loadInsightsData }));

import InsightsTabPage from "@/app/admin/(protected)/insights/page";

// TELEMETRY-04: the Insights tab never reaches the service-role client, the
// campaign builder makes no server calls, a held club never reads numbers, and
// the ready state renders the dashboard, dropped line and report slot.

const ROOT = resolve(process.cwd());
const FORBIDDEN = /supabase-service-role|SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient|service_role/;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null; // CSS modules and other assets
}

async function importGraph(entry: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = await readFile(file, "utf8");
    seen.set(file, source);
    const specifiers = [
      ...source.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g),
      ...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      const next = resolveLocal(specifier, file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

describe("insights import graph", () => {
  it.each([
    "app/admin/(protected)/insights/page.tsx",
    "components/admin/reimagined/InsightsDashboard.tsx",
    "components/admin/reimagined/CampaignLinkBuilder.tsx",
    "lib/telemetry/insights-data.ts",
  ])("%s never reaches the service-role client or key", async (entry) => {
    const graph = await importGraph(entry);
    expect([...graph].filter(([, source]) => FORBIDDEN.test(source)).map(([file]) => rel(file))).toEqual([]);
  });

  it("the campaign link builder makes no network or Supabase calls", async () => {
    const graph = await importGraph("components/admin/reimagined/CampaignLinkBuilder.tsx");
    const files = [...graph.keys()].map(rel);
    expect(files).toContain("lib/telemetry/campaign-link.ts");
    const offenders = [...graph]
      .filter(([, source]) => /\bfetch\(|@\/lib\/supabase/.test(source))
      .map(([file]) => rel(file));
    expect(offenders).toEqual([]);
  });
});

const READY: InsightsData = {
  status: "ready",
  range: 7,
  start: "2026-11-14",
  end: "2026-11-20",
  totals: { views: 1234, visitorDays: 456, visits: 500, engagedMs: 0, engagedViews: 0, avgTimeMs: null, dropped: 0 },
  daily: [
    { date: "2026-11-14", views: 100, visitorDays: 40, visits: 50, matchDay: true },
    { date: "2026-11-15", views: null, visitorDays: null, visits: null, matchDay: false },
  ],
  top: {
    path: [{ value: "/", views: 10, visitorDays: 5, engagedMs: 0, avgTimeMs: 125_000 }],
    source: [],
    device: [],
    country: [],
    city: [],
    referrer: [],
    utm_campaign: [],
    utm_source: [],
  },
  sponsors: [],
  matches: [{ date: "2026-11-14", opponent: "Rivals FC", home: true }],
  dropped: 12_345,
  computedAt: "2026-11-21T11:05:00.000Z",
  sitePaths: ["/", "/schedule"],
};

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const element = await InsightsTabPage({ searchParams: Promise.resolve(searchParams) });
  expect(isValidElement(element as unknown as ReactElement)).toBe(true);
  return renderToStaticMarkup(element);
}

function club(slug: string) {
  return { supabase: {}, club: { id: "club-1", slug, primaryDomain: "example.org" }, portal: { timeZone: "America/Los_Angeles" } };
}

describe("insights page", () => {
  beforeEach(() => {
    loadAdminTabPage.mockReset();
    loadInsightsData.mockReset();
  });

  it("a held club sees the waiting state and its numbers are never read", async () => {
    loadAdminTabPage.mockResolvedValue(club("rose-city"));
    const html = await render();
    expect(html).toContain('data-testid="insights-waiting"');
    expect(html).toContain("data-held");
    expect(html).not.toContain('data-testid="insights-totals"');
    expect(html).not.toContain('data-testid="campaign-link-builder"');
    expect(loadInsightsData).not.toHaveBeenCalled();
  });

  it("a live club with no rollups sees the waiting state without the hold", async () => {
    loadAdminTabPage.mockResolvedValue(club("other-club"));
    loadInsightsData.mockResolvedValue({ status: "no-rollups" });
    const html = await render();
    expect(html).toContain('data-testid="insights-waiting"');
    expect(html).not.toContain("data-held");
    expect(html).not.toContain('data-testid="insights-totals"');
  });

  it("a read failure shows a plain alert", async () => {
    loadAdminTabPage.mockResolvedValue(club("other-club"));
    loadInsightsData.mockResolvedValue({ status: "error" });
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Your numbers could not be loaded. Refresh the page to try again.");
  });

  it("passes the club, zone and parsed range to the reader", async () => {
    loadAdminTabPage.mockResolvedValue(club("other-club"));
    loadInsightsData.mockResolvedValue({ status: "no-rollups" });
    await render({ range: "90" });
    expect(loadInsightsData).toHaveBeenCalledWith({}, { clubId: "club-1", timeZone: "America/Los_Angeles", range: 90 });
    await render({ range: "bogus" });
    expect(loadInsightsData).toHaveBeenLastCalledWith({}, expect.objectContaining({ range: 30 }));
  });

  it("a ready club sees the dashboard, dropped line, builder and report slot", async () => {
    loadAdminTabPage.mockResolvedValue(club("other-club"));
    loadInsightsData.mockResolvedValue(READY);
    const html = await render();
    for (const id of [
      "insights-range",
      "insights-updated",
      "insights-totals",
      "insights-daily-chart",
      "insights-match-marker",
      "insights-top-pages",
      "insights-sources",
      "insights-devices",
      "insights-places",
      "insights-campaigns",
      "insights-sponsors",
      "campaign-link-builder",
      "insights-monthly-report-slot",
    ]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    expect(html).not.toContain('data-testid="insights-waiting"');
    expect(html).toContain("12,345 views weren&#x27;t counted because of unusual traffic spikes.");
    expect(html).toContain("Updated daily · last Nov 21, 3:05 AM");
    // Visible text only: the copy button's aria-live attribute is not a claim.
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/\b(live|real time)\b/i);
    expect(html).toContain("Not measured yet");
    expect(html).not.toContain("0:00");
    expect(html).toContain("Match day: vs Rivals FC, Nov 14");
    expect(html).toContain("No campaign visits in this range");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Monthly sponsor report");
  });

  it("shows nothing about dropped views at zero and uses the singular at one", async () => {
    loadAdminTabPage.mockResolvedValue(club("other-club"));
    loadInsightsData.mockResolvedValue({ ...READY, dropped: 0 });
    expect(await render()).not.toContain("insights-dropped");
    loadInsightsData.mockResolvedValue({ ...READY, dropped: 1 });
    expect(await render()).toContain("1 view wasn&#x27;t counted because of unusual traffic spikes.");
  });
});
