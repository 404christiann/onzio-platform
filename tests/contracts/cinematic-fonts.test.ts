import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const preloadMock = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async importOriginal => ({ ...(await importOriginal<typeof import("react-dom")>()), preload: preloadMock }));

import CinematicAvenirFonts, { avenirFontFaceCss } from "@/components/cinematic/CinematicAvenirFonts";
import CinematicDisplayFont, { DISPLAY_FONT_FACE } from "@/components/cinematic/CinematicDisplayFont";

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
    expect(body?.stack).toBe("'CinematicAvenir','CinematicAvenirLocal','CinematicAvenirMetric',Avenir,'CinematicFigtree',sans-serif");
    const heavy = all.filter(({ stack }) => stack.includes("CinematicAvenirHeavy"));
    expect(heavy.length).toBe(6); // RC-SAM-FIXES adds Robinson's bold directions headings
    for (const { stack } of heavy) expect(stack).toBe("'CinematicAvenirHeavy','CinematicAvenirHeavyLocal','CinematicAvenirHeavyMetric','CinematicFigtree',sans-serif");
  });

  it("MuseoModerno's Latin set is inlined at 900 by a server component in the cinematic layout only (RC-CLS-2)", () => {
    const css = cinematicCss.find(file => file.name === "cinematic.css")!.css;
    // cinematic.css reaches Diverse City's pages too (the tenant layout imports the shell), so it keeps only the full file.
    const faces = [...css.matchAll(/@font-face\{font-family:CinematicMuseoModerno;([^}]*)\}/g)].map(([, body]) => body);
    expect(faces).toEqual(["src:url('/fonts/museomoderno/MuseoModerno.ttf') format('truetype');font-weight:100 900;font-display:swap"]);
    expect(css).toContain("--display:CinematicMuseoModerno,sans-serif");
    expect(DISPLAY_FONT_FACE).toMatch(/^@font-face\{font-family:CinematicMuseoModerno;src:url\(data:font\/ttf;base64,[A-Za-z0-9+/=]+\) format\('truetype'\);font-weight:100 900;font-display:swap;unicode-range:U\+0020-007E,U\+00A0-00FF,[^}]+\}$/);
    const bytes = Buffer.from(DISPLAY_FONT_FACE.match(/base64,([^)]+)\)/)![1], "base64");
    expect(bytes.subarray(0, 4).toString("hex")).toBe("00010000");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("a54a23537a1ebdd4c1d7b8df325c1f7e5a445274568b7f381d9f6193e88fccce");
    const html = renderToStaticMarkup(createElement(CinematicDisplayFont));
    expect(html.indexOf("<style data-cinematic-display-font")).toBeLessThan(html.indexOf("<script data-cinematic-font-warmup"));
    expect(html).toContain('<script data-cinematic-font-warmup="">document.fonts&amp;&amp;document.fonts.load(&quot;900 1em CinematicMuseoModerno&quot;).catch(function(){})</script>'.replaceAll("&amp;", "&").replaceAll("&quot;", '"'));
  });

  it("the inlined font bytes stay server-side: only the server component imports them, inside the cinematic layout branch", () => {
    const importers = execSync("git grep --untracked -l museo-moderno-latin-900 -- app components lib", { encoding: "utf8" }).trim().split("\n").sort();
    expect(importers).toEqual(["components/cinematic/CinematicDisplayFont.tsx"]);
    for (const file of ["components/cinematic/CinematicDisplayFont.tsx", "components/cinematic/museo-moderno-latin-900.ts"]) expect(readFileSync(file, "utf8")).not.toMatch(/["']use client["']/);
    expect(execSync("git grep --untracked -l CinematicDisplayFont -- app components lib", { encoding: "utf8" }).trim().split("\n").sort()).toEqual(["app/%5Fclubs/[slug]/layout.tsx", "components/cinematic/CinematicDisplayFont.tsx", "components/cinematic/museo-moderno-latin-900.ts"]);
    const layout = readFileSync("app/%5Fclubs/[slug]/layout.tsx", "utf8");
    const cinematicBranch = layout.slice(layout.indexOf('if (club.presentationTemplateKey === "cinematic@2")'), layout.indexOf("codeSiteFor(club)"));
    expect(cinematicBranch).toMatch(/<CinematicDisplayFont \/>.*<CinematicShell /);
    expect(layout.split("<CinematicDisplayFont />").length - 1).toBe(1);
  });

  it("the swap stand-ins are the installed Avenir or the bundled Figtree, sized to the real face, never Arial", () => {
    const css = avenirFontFaceCss("https://example.supabase.co/fonts") + cinematicCss.find(file => file.name === "cinematic.css")!.css;
    const faces = Object.fromEntries([...css.matchAll(/@font-face\{font-family:'?([\w ]+?)'?;([^}]*)\}/g)].map(([, family, body]) => [family, body]));
    for (const family of ["CinematicAvenirLocal", "CinematicAvenirHeavyLocal"]) expect(faces[family], family).toMatch(/^src:local\('Avenir (Medium|Heavy)'\),local\('Avenir-(Medium|Heavy)'\);/);
    for (const family of ["CinematicAvenirMetric", "CinematicAvenirHeavyMetric"]) {
      expect(faces[family], family).toContain("src:url('/fonts/figtree/figtree-latin-wght-normal.woff2') format('woff2')");
      // swap, not the default block: on a device without Avenir, text must not stay invisible while Figtree loads.
      expect(faces[family], family).toMatch(/font-display:swap;size-adjust:\d+(\.\d+)?%/);
    }
    for (const family of ["CinematicAvenirLocal", "CinematicAvenirHeavyLocal", "CinematicAvenirMetric", "CinematicAvenirHeavyMetric"]) {
      expect(faces[family], family).toMatch(/ascent-override:[\d.]+%;descent-override:[\d.]+%;line-gap-override:0%/);
      expect(faces[family], family).not.toMatch(/arial/i);
    }
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
    expect((css.match(/@font-face/g) ?? []).length).toBe(6);
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

  it("the component renders one style and preloads both files and the Figtree stand-in from NEXT_PUBLIC_FONT_BASE_URL, and nothing without it", () => {
    vi.stubEnv("NEXT_PUBLIC_FONT_BASE_URL", "https://example.supabase.co/storage/v1/object/public/fonts/");
    try {
      preloadMock.mockClear();
      const html = renderToStaticMarkup(createElement(CinematicAvenirFonts));
      expect((html.match(/<style/g) ?? []).length).toBe(1);
      expect(html).toContain("url('https://example.supabase.co/storage/v1/object/public/fonts/Avenir-Medium.ttf')");
      expect(preloadMock.mock.calls).toEqual([
        ...["Avenir-Medium.ttf", "Avenir-Heavy.ttf"].map(file =>
          [`https://example.supabase.co/storage/v1/object/public/fonts/${file}`, { as: "font", type: "font/ttf", crossOrigin: "anonymous" }]),
        ["/fonts/figtree/figtree-latin-wght-normal.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" }],
      ]);
      preloadMock.mockClear();
      vi.stubEnv("NEXT_PUBLIC_FONT_BASE_URL", "");
      expect(renderToStaticMarkup(createElement(CinematicAvenirFonts))).toBe("");
      vi.stubEnv("NEXT_PUBLIC_FONT_BASE_URL", "http://example.com/fonts");
      expect(renderToStaticMarkup(createElement(CinematicAvenirFonts))).toBe("");
      expect(preloadMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ships the Figtree license", () => {
    expect(existsSync(resolve(process.cwd(), "public/fonts/figtree/OFL.txt"))).toBe(true);
  });
});
