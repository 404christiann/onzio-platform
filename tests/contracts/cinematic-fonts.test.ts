import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CinematicAvenirFonts, { avenirFontFaceCss } from "@/components/cinematic/CinematicAvenirFonts";

const cinematicDir = resolve(process.cwd(), "components/cinematic");
const cinematicCss = readdirSync(cinematicDir)
  .filter(name => name.endsWith(".css"))
  .map(name => ({ name, css: readFileSync(resolve(cinematicDir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));

/** Every font-family list (from font-family, the font shorthand, or a custom property) that names Avenir. */
function avenirStacks(css: string): string[] {
  const stacks: string[] = [];
  for (const [, property, value] of css.matchAll(/(font-family|font|--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    if (!/avenir/i.test(value)) continue;
    // The font shorthand ends with the family list, after the size/line-height.
    const families = property === "font" ? value.replace(/^.*(?:\d|\))(?:\/[\d.]+[a-z%]*)?\s+/, "") : value;
    stacks.push(families.trim());
  }
  return stacks;
}

const familyList = (stack: string) => stack.split(",").map(family => family.trim().replace(/^['"]|['"]$/g, ""));

describe("cinematic fonts", () => {
  it("no cinematic stylesheet serves Avenir from the repository", () => {
    for (const { name, css } of cinematicCss) {
      expect(css, name).not.toMatch(/\/fonts\/avenir/i);
      expect(css, name).not.toMatch(/(Injury|Summary|News|Robinson|Ticket)AvenirHeavy/);
    }
  });

  it("declares the bundled Figtree variable faces", () => {
    const css = cinematicCss.find(file => file.name === "cinematic.css")!.css;
    const faces = css.match(/@font-face\{font-family:'CinematicFigtree';[^}]*\}/g) ?? [];
    expect(faces.map(face => face.match(/url\('([^']+)'\)/)?.[1]).sort()).toEqual([
      "/fonts/figtree/figtree-latin-ext-wght-normal.woff2",
      "/fonts/figtree/figtree-latin-wght-normal.woff2",
    ]);
    for (const face of faces) {
      expect(face).toContain("format('woff2')");
      expect(face).toContain("font-weight:300 900");
      expect(face).toContain("font-display:swap");
      expect(face).toContain("unicode-range:");
    }
  });

  it("every Avenir stack is Avenir first, then CinematicFigtree, then sans-serif, with no Arial", () => {
    const all = cinematicCss.flatMap(({ name, css }) => avenirStacks(css).map(stack => ({ name, stack })));
    expect(all.length).toBeGreaterThanOrEqual(8);
    for (const { name, stack } of all) {
      const families = familyList(stack);
      const label = `${name}: ${stack}`;
      expect(families[0], label).toMatch(/avenir/i);
      expect(families.slice(-2), label).toEqual(["CinematicFigtree", "sans-serif"]);
      expect(families.slice(0, -2).every(family => /avenir/i.test(family)), label).toBe(true);
      expect(stack, label).not.toMatch(/arial/i);
    }
    const body = all.find(({ name, stack }) => name === "cinematic.css" && stack.startsWith("'CinematicAvenir'"));
    expect(body?.stack).toBe("'CinematicAvenir',Avenir,'CinematicFigtree',sans-serif");
    const heavy = all.filter(({ stack }) => stack.includes("CinematicAvenirHeavy"));
    expect(heavy.length).toBe(5);
    for (const { stack } of heavy) expect(stack).toBe("'CinematicAvenirHeavy','CinematicFigtree',sans-serif");
  });

  it("every LEMON MILK stack falls back to CinematicFigtree, then sans-serif", () => {
    const stacks = cinematicCss.flatMap(({ name, css }) =>
      [...css.matchAll(/(font-family|font|--[\w-]+)\s*:\s*([^;{}]+)/g)]
        .filter(([, property, value]) => property !== "font-family" || !/src\s*:/.test(value))
        .filter(([, , value]) => /lemon\s*milk/i.test(value))
        // The family list starts at the first family; for the font shorthand that is LEMON MILK itself.
        .map(([, property, value]) => ({ name, property, stack: (property === "font" ? value.slice(value.search(/['"]?lemon\s*milk/i)) : value).trim() })),
    ).filter(({ property, stack }) => !(property === "font-family" && familyList(stack).length === 1 && /^lemon milk$/i.test(familyList(stack)[0])));
    // The one use today is the cinematic footer club name (.footer-brand strong).
    expect(stacks.length).toBeGreaterThanOrEqual(1);
    for (const { name, stack } of stacks) {
      const families = familyList(stack);
      expect(families.slice(-2), `${name}: ${stack}`).toEqual(["CinematicFigtree", "sans-serif"]);
    }
  });

  it("emits both Avenir faces from a valid https base", () => {
    const css = avenirFontFaceCss("https://example.supabase.co/storage/v1/object/public/fonts/");
    expect(css).toContain("font-family:'CinematicAvenir';src:url('https://example.supabase.co/storage/v1/object/public/fonts/Avenir-Medium.ttf') format('truetype')");
    expect(css).toContain("font-family:'CinematicAvenirHeavy';src:url('https://example.supabase.co/storage/v1/object/public/fonts/Avenir-Heavy.ttf') format('truetype')");
    expect(css).toMatch(/'CinematicAvenir';[^}]*font-weight:400 600;font-display:swap/);
    expect(css).toMatch(/'CinematicAvenirHeavy';[^}]*font-weight:800;font-display:swap/);
    expect(css).not.toContain("fonts//");
    expect((css.match(/@font-face/g) ?? []).length).toBe(2);
    expect(avenirFontFaceCss("http://127.0.0.1:54321/storage/v1/object/public/fonts")).toContain("http://127.0.0.1:54321/storage/v1/object/public/fonts/Avenir-Heavy.ttf");
    expect(avenirFontFaceCss("http://localhost:3000/fonts")).toContain("http://localhost:3000/fonts/Avenir-Medium.ttf");
  });

  it("renders nothing for an unset, non-https or injecting base", () => {
    for (const base of [
      undefined,
      "",
      "/",
      "fonts",
      "http://example.com/fonts",
      "http://localhost.example.com/fonts",
      "ftp://example.com/fonts",
      "javascript:alert(1)",
      "https://example.com/fonts')}body{color:red",
      "https://example.com/fonts\"",
      "https://example.com/fonts)",
      "https://example.com/fo nts",
      " https://example.com/fonts",
      "https://example.com/fonts\\",
      "https://example.com/fonts</style><script>",
      "https://example.com/fonts?x=1",
      "https://user:pass@example.com/fonts",
    ]) expect(avenirFontFaceCss(base), String(base)).toBe("");
  });

  it("the component renders one style from NEXT_PUBLIC_FONT_BASE_URL and nothing without it", () => {
    vi.stubEnv("NEXT_PUBLIC_FONT_BASE_URL", "https://example.supabase.co/storage/v1/object/public/fonts/");
    try {
      const html = renderToStaticMarkup(createElement(CinematicAvenirFonts));
      expect((html.match(/<style/g) ?? []).length).toBe(1);
      expect(html).toContain("url('https://example.supabase.co/storage/v1/object/public/fonts/Avenir-Medium.ttf')");
      vi.stubEnv("NEXT_PUBLIC_FONT_BASE_URL", "");
      expect(renderToStaticMarkup(createElement(CinematicAvenirFonts))).toBe("");
      vi.stubEnv("NEXT_PUBLIC_FONT_BASE_URL", "http://example.com/fonts");
      expect(renderToStaticMarkup(createElement(CinematicAvenirFonts))).toBe("");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ships the Figtree license", () => {
    expect(existsSync(resolve(process.cwd(), "public/fonts/figtree/OFL.txt"))).toBe(true);
  });
});
