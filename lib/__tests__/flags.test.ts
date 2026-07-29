import { describe, expect, it } from "vitest";
import { getFlagUrl } from "@/lib/flags";

describe("getFlagUrl", () => {
  it("uses the migrated Rose City media asset instead of the legacy flags bucket", () => {
    const url = getFlagUrl("American", "rose-city");

    expect(url).toContain("/storage/v1/object/public/onzio-media/");
    expect(url).toContain("/flags/def61117-0b21-5ffb-b25b-05158cf77a9a.webp");
    expect(url).not.toContain("/storage/v1/object/public/flags/");
  });

  it("fails closed for an unmapped Rose City nationality", () => {
    expect(getFlagUrl("Spanish", "rose-city")).toBeNull();
  });
});
