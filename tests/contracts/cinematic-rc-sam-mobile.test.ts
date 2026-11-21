import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// RC-SAM-MOBILE-HEADINGS: Christian's phone showed the Foothill Transit directions headings in regular Avenir, and asked for
// the shop's Jersey Details photo boxes to be square.
const css = (name: string) => readFileSync(resolve(process.cwd(), `components/cinematic/${name}`), "utf8");
const rules = (sheet: string, selector: string) => [...sheet.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(([, selectors]) => selectors.split(",").some(s => s.trim() === selector)).map(([, , body]) => body);

describe("Rose City mobile follow-ups", () => {
  it("lets the Foothill Transit directions headings show bold even when the browser picks a face without Heavy", () => {
    const heading = rules(css("stadium.css"), ".cinematic-site .robinson-directions h2");
    expect(heading.some(body => /font:800 /.test(body))).toBe(true);
    for (const body of heading) expect(body).not.toMatch(/font-synthesis\s*:\s*none/);
  });
  it("draws the Jersey Details photo boxes square on desktop and phones", () => {
    const boxes = [...rules(css("shop.css"), ".cinematic-site .shop-photo-pending"), ...rules(css("shop.css"), ".cinematic-site .shop-detail-photo")];
    expect(boxes.length).toBeGreaterThan(0);
    for (const body of boxes) if (/border-radius/.test(body)) expect(body).toMatch(/border-radius:0(;|$)/);
  });
});
