import { describe, expect, it } from "vitest";
import {
  programRouteOptions,
  siteRouteOptionsWithFallback,
  STATIC_SITE_ROUTES,
} from "@/lib/site-routes";

const PROGRAMS = [
  { slug: "youth-academy", navLabel: "Youth Academy", displayTitle: "Building Future Champions" },
  { slug: "special-olympics-soccer", navLabel: "Special Olympics", displayTitle: "Empowering Athletes" },
];

describe("programRouteOptions", () => {
  it("builds a /programs/<slug> option per program, labeled by nav label", () => {
    const options = programRouteOptions(PROGRAMS);
    expect(options).toEqual([
      { href: "/programs/youth-academy", label: "Programs — Youth Academy" },
      { href: "/programs/special-olympics-soccer", label: "Programs — Special Olympics" },
    ]);
  });

  it("falls back to the display title when nav label is blank", () => {
    const options = programRouteOptions([
      { slug: "x", navLabel: "", displayTitle: "Fallback Title" },
    ]);
    expect(options[0].label).toBe("Programs — Fallback Title");
  });
});

describe("siteRouteOptionsWithFallback", () => {
  it("includes every static route plus every program route", () => {
    const options = siteRouteOptionsWithFallback(PROGRAMS, "/roster");
    for (const route of STATIC_SITE_ROUTES) {
      expect(options).toContainEqual(route);
    }
    expect(options).toContainEqual({
      href: "/programs/youth-academy",
      label: "Programs — Youth Academy",
    });
  });

  it("matches a known route exactly, without adding a duplicate or fallback entry", () => {
    const options = siteRouteOptionsWithFallback(PROGRAMS, "/shop");
    const matches = options.filter((option) => option.href === "/shop");
    expect(matches).toHaveLength(1);
    expect(options.some((option) => option.label.startsWith("Current value"))).toBe(false);
  });

  it("prepends a 'use template default' option for an empty current value, so the select always has a matching option", () => {
    const options = siteRouteOptionsWithFallback(PROGRAMS, "");
    expect(options[0]).toEqual({ href: "", label: "Use template default" });
  });

  it("treats a whitespace-only current value the same as empty", () => {
    const options = siteRouteOptionsWithFallback(PROGRAMS, "   ");
    expect(options[0].href).toBe("");
  });

  it("appends an unrecognized saved value instead of dropping it, so an unusual existing link is never silently lost", () => {
    const options = siteRouteOptionsWithFallback(PROGRAMS, "/some/legacy/path");
    const last = options[options.length - 1];
    expect(last).toEqual({
      href: "/some/legacy/path",
      label: "Current value (/some/legacy/path)",
    });
  });

  it("never returns duplicate href values", () => {
    const options = siteRouteOptionsWithFallback(PROGRAMS, "/shop");
    const hrefs = options.map((option) => option.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
