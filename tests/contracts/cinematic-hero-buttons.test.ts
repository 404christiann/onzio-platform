import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// RC-SAM-FIXES: Sam's MEET THE SQUAD button is a thin 1px border. Its "outline" class name also matches Tailwind's
// .outline utility (outline-style: solid), which drew a thick white ring around it on rc-sam.
const css = readFileSync(resolve(process.cwd(), "components/cinematic/cinematic.css"), "utf8");

describe("cinematic hero buttons", () => {
  it("cancels Tailwind's .outline ring on the hero's outlined button and keeps a keyboard focus ring", () => {
    expect(css).toContain(".cinematic-site .hero .outline{border:1px solid #ffffff99");
    expect(css).toContain(".cinematic-site .hero .outline{outline:0}");
    expect(css).toMatch(/\.cinematic-site \.hero \.outline:focus-visible\{outline:3px solid #4F8DC3/);
  });
});
