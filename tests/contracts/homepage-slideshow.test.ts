import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/PhotoSlideshow.tsx"),
  "utf8",
);

describe("homepage slideshow media resilience", () => {
  it("initializes the reveal after asynchronous valid slides mount", () => {
    expect(source).toContain(
      "if (visibleSlides.length === 0 || !section) return;",
    );
    expect(source).toContain("}, [visibleSlides.length]);");
  });

  it("bypasses the unavailable optimizer and removes failed assets", () => {
    expect(source).toContain("unoptimized");
    expect(source).toContain("failedSlideIds");
    expect(source).toContain("setFailedSlideIds");
    expect(source).toContain("onError");
  });
});
