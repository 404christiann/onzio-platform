import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage slideshow reveal", () => {
  it("initializes the reveal after asynchronous slides mount the section", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/PhotoSlideshow.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "if (slides.length === 0 || !section) return;",
    );
    expect(source).toContain("}, [slides.length]);");
    expect(source).toContain("unoptimized");
  });
});
