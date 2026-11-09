import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADMIN-RE-10a (Christian, Rose City walk-through 2026-11-09): typing 30 into
// a stepper that showed 0 left "030" in the box. React compares a number
// input's DOM text to a numeric value loosely ("030" == 30), so it never
// rewrites the text. Passing the value as a string makes the comparison
// textual and the box shows "30". Whole-number boxes only: a decimal box
// (the About logo icon scale) must keep "1." while it's being typed.
const WHOLE_NUMBER_INPUTS = [
  "components/ui/number-stepper.tsx",
  "components/admin/StatInput.tsx",
  "components/admin/stats/StatsWorkspace.tsx",
  "app/admin/(protected)/standings/page.tsx",
  "app/admin/(protected)/roster/page.tsx",
  "app/admin/(protected)/schedule/page.tsx",
];

function numberInputs(source: string): string[] {
  return [...source.matchAll(/<input\b[^>]*?type="number"[\s\S]*?\/>/g)].map((match) => match[0]);
}

describe("whole-number admin inputs never keep a leading zero", () => {
  for (const file of WHOLE_NUMBER_INPUTS) {
    it(`${file} passes each number input's value as a string`, () => {
      const inputs = numberInputs(readFileSync(file, "utf8"));
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(input, input).toMatch(/\bvalue=\{String\(/);
      }
    });
  }
});

describe("the stats stepper's focus ring is not clipped", () => {
  const css = readFileSync("components/admin/stats/stats-workspace.module.css", "utf8");

  it("draws the typing focus around the whole stepper, not as two side bars", () => {
    expect(css).toMatch(/\.stepper input:focus\s*\{[^}]*outline:\s*none/);
    expect(css).toMatch(/\.stepper:has\(input:focus\)\s*\{[^}]*border-color:\s*hsl\(var\(--ring\)\)/);
  });

  it("keeps the button focus ring inside the stepper's rounded box", () => {
    expect(css).toMatch(/\.stepper button:focus-visible\s*\{[^}]*outline-offset:\s*-\d+px/);
  });
});
