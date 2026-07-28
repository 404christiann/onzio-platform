import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/Nav.tsx"),
  "utf8",
);

describe("Rose City affiliation logo resilience", () => {
  it("uses the migrated versioned raw-media paths", () => {
    expect(source).toContain("/storage/v1/object/public/onzio-media/");
    expect(source).toContain("/branding");
    expect(source).not.toContain("logos_v2");

    const versionedWebpPaths =
      source.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp/g,
      ) ?? [];
    expect(versionedWebpPaths).toHaveLength(8);
  });

  it("bypasses the optimizer and swaps color variants on failure", () => {
    expect(source).toContain('imageDeliveryProps("small-graphic")');
    expect(source).toContain("fallbackApplied");
    expect(source).toContain("event.currentTarget.srcset");
    expect(source).toContain("onError");
  });
});
