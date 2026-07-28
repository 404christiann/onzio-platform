import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("roster media resilience", () => {
  it("serves the raw origin and replaces a failed source without looping", () => {
    const component = source("components/ResilientImage.tsx");

    expect(component).toContain("nextImageDeliveryAttempt");
    expect(component).toContain('useState<ResilientImageAttempt>("raw")');
    expect(component).toContain('attempt === "failed"');
    expect(component).toContain("fallback");
    expect(component).toContain("onError");
  });

  it("uses resilient delivery for every roster card and staff modal", () => {
    for (const path of [
      "components/PlayerCard.tsx",
      "components/StaffCard.tsx",
      "components/StaffModal.tsx",
    ]) {
      const component = source(path);
      expect(component).toContain(
        'import ResilientImage from "@/components/ResilientImage"',
      );
      expect(component).toContain("<ResilientImage");
      expect(component).toContain("photo unavailable");
    }
  });

  it("matches the two-column mobile roster grid", () => {
    const playerCard = source("components/PlayerCard.tsx");

    expect(playerCard).toContain(
      'sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"',
    );
    expect(playerCard).not.toContain("(max-width: 640px) 100vw");
  });

  it("exposes stable browser-verification hooks", () => {
    expect(source("components/PlayerCard.tsx")).toContain(
      'data-roster-card-image="true"',
    );
    expect(source("components/StaffCard.tsx")).toContain(
      'data-roster-card-image="true"',
    );
    expect(source("components/PlayerModal.tsx")).toContain(
      'data-roster-modal-image="true"',
    );
    expect(source("components/StaffModal.tsx")).toContain(
      'data-roster-modal-image="true"',
    );
  });
});
