import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("player modal media delivery", () => {
  it("serves carousel photos directly from the raw source", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/PlayerModal.tsx"),
      "utf8",
    );

    const modalImage = source.match(
      /<Image[\s\S]*?key=\{currentPhotoSrc\}[\s\S]*?\/>/,
    )?.[0];

    expect(modalImage).toBeDefined();
    expect(modalImage).toContain("unoptimized");
    expect(modalImage).toContain("onError");
  });

  it("falls back through valid photos and then to player initials", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/PlayerModal.tsx"),
      "utf8",
    );

    expect(source).toContain("failedPhotoSrcs");
    expect(source).toContain("visiblePhotos");
    expect(source).toContain("photo unavailable");
  });
});
