import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RC-DESKTOP-FIT: Rose City's cinematic sections fit one desktop screen. Each stylesheet below ends with one appended
 * block, wrapped in `@media (min-width:1025px)`, so nothing at 1024px and below changes and the existing rules stay as
 * they were. The base styles switch at `max-width:1024px`.
 */
const MARKER = "/* RC-DESKTOP-FIT: desktop fit, wider than 1024px only. */";
const FILES = [
  "cinematic.css",
  "shop.css",
  "crest.css",
  "robinson-page.css",
  "stadium.css",
  "chick-fil-a.css",
  "policies.css",
  "tickets.css",
  "ticket-pages.css",
  "partners.css",
] as const;

const read = (name: string) => readFileSync(resolve(process.cwd(), "components/cinematic", name), "utf8");

/** The appended block's body: what sits inside `@media (min-width:1025px){ … }`, comments removed. */
function desktopBlock(name: string): string {
  const css = read(name);
  const start = css.indexOf(MARKER);
  expect(start, `${name} has the RC-DESKTOP-FIT block`).toBeGreaterThanOrEqual(0);
  expect(css.indexOf(MARKER, start + 1), `${name} has one RC-DESKTOP-FIT block`).toBe(-1);
  const tail = css.slice(start + MARKER.length).replace(/\/\*[\s\S]*?\*\//g, "").trim();
  expect(tail.startsWith("@media (min-width:1025px){"), `${name} block is desktop-only`).toBe(true);
  const open = tail.indexOf("{");
  let depth = 0;
  let end = -1;
  for (let i = open; i < tail.length; i++) {
    if (tail[i] === "{") depth++;
    else if (tail[i] === "}" && --depth === 0) { end = i; break; }
  }
  expect(end, `${name} block is closed`).toBeGreaterThan(open);
  expect(tail.slice(end + 1).trim(), `${name} block is the last thing in the file`).toBe("");
  return tail.slice(open + 1, end);
}

/** Top-level selectors of every rule in a block, split on commas outside parentheses. */
function selectors(block: string): string[] {
  const out: string[] = [];
  for (const [, prelude] of block.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    let depth = 0;
    let current = "";
    for (const ch of prelude) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(current.trim()); current = ""; } else current += ch;
    }
    out.push(current.trim());
  }
  return out.filter(Boolean);
}

const rule = (block: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return block.match(new RegExp(`(?:^|[},])\\s*[^{}]*${escaped}[^{}]*\\{([^{}]*)\\}`))?.[1] ?? "";
};

describe("RC-DESKTOP-FIT: desktop-only fit rules", () => {
  it.each(FILES)("%s ends with one desktop-only block whose rules are all cinematic-scoped", (name) => {
    const block = desktopBlock(name);
    const found = selectors(block);
    expect(found.length, name).toBeGreaterThan(0);
    for (const selector of found) expect(selector, name).toMatch(/^\.cinematic-site\s/);
    // Logos, crests, maps and artwork with text are never cropped to fit.
    expect(block, name).not.toMatch(/object-fit\s*:\s*cover/);
  });

  it("club identity feature cards sit in two columns; an odd last card and the editor placeholder span both", () => {
    const block = desktopBlock("crest.css");
    expect(rule(block, ".identity-features")).toMatch(/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    expect(selectors(block)).toEqual(expect.arrayContaining([
      ".cinematic-site .identity-feature:last-child:nth-child(odd)",
      ".cinematic-site .identity-features>.identity-empty",
    ]));
    expect(rule(block, ".identity-features>.identity-empty")).toMatch(/grid-column:1\/-1/);
  });

  it("match-day facts and member benefits run five tiles across", () => {
    const block = desktopBlock("ticket-pages.css");
    expect(rule(block, ".tp-fact-tiles>li")).toMatch(/flex:0 0 calc\(\(100% - 4 \* var\(--tp-tile-gap\)\) \/ 5/);
    expect(rule(block, ".tp-benefit-tiles>li")).toMatch(/\/ 5/);
    expect(rule(block, ".tp-raffle-photo")).toMatch(/object-fit:contain/);
  });

  it("Single Match Tickets goes two-column only when both the artwork and the prices are present", () => {
    const block = desktopBlock("tickets.css");
    for (const selector of selectors(block)) expect(selector).toContain(".tickets-top:has(.ticket-banner):has(.tickets-prices)");
  });

  it("long directions read in two columns on the Foothill and Robinson Stadium pages", () => {
    expect(rule(desktopBlock("stadium.css"), ".robinson-directions")).toMatch(/columns:2/);
    expect(desktopBlock("robinson-page.css")).toMatch(/columns:2/);
  });
});
