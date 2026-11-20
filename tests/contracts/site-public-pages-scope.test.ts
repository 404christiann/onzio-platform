import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// RC-CLS: Next ships every client component a route can reach to every club that visits it. Rose City's server pages
// must not leak its cinematic code into the routes Diverse City and other clubs share.
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const PAGES = [
  ["home", "Home", "app/%5Fclubs/[slug]/page.tsx"],
  ["roster", "Roster", "app/%5Fclubs/[slug]/roster/page.tsx"],
  ["schedule", "Schedule", "app/%5Fclubs/[slug]/schedule/page.tsx"],
  ["shop", "Shop", "app/%5Fclubs/[slug]/shop/page.tsx"],
] as const;

describe("site public pages stay scoped to their route and club", () => {
  it.each(PAGES)("the %s lookup references only its own site page", (page, Page) => {
    const lookup = source(`lib/site-public-pages/${page}.ts`);
    const imported = [...lookup.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imported).toEqual([`./index`, `@/components/sites/rose-city/RoseCity${Page}Page`].sort());
  });

  it.each(PAGES)("the %s route imports only its own lookup", (page, _Page, route) => {
    const code = source(route);
    expect(code).toContain(`from "@/lib/site-public-pages/${page}";`);
    expect(code).not.toMatch(/from "@\/lib\/site-public-pages(\/index)?";/);
    for (const [other] of PAGES) if (other !== page) expect(code).not.toContain(`@/lib/site-public-pages/${other}"`);
    expect(code).not.toMatch(/from "@\/components\/(sites\/rose-city|cinematic)\//);
  });

  it("Rose City's home reaches CinematicHome only through its own chunk", () => {
    const page = source("components/sites/rose-city/RoseCityHomePage.tsx");
    expect(page).toContain('import CinematicHomeDynamic from "@/components/cinematic/CinematicHomeDynamic";');
    expect(page).not.toContain('from "@/components/cinematic/CinematicHome"');
    const wrapper = source("components/cinematic/CinematicHomeDynamic.tsx");
    expect(wrapper.startsWith('"use client";')).toBe(true);
    expect(wrapper).toContain('nextDynamic(() => import("./CinematicHome"))');
    expect(wrapper).not.toContain("ssr: false");
  });
});
