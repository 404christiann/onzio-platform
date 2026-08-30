import { describe, expect, it } from "vitest";
import {
  flagEmojiToCountryCode,
  getFlagCountryCode,
  getFlagUrl,
} from "@/lib/flags";
import { NATIONALITIES } from "@/lib/nationalities";

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

  it("uses bundled country codes for non-Rose-City clubs", () => {
    expect(getFlagCountryCode("American")).toBe("us");
    expect(getFlagCountryCode("🇺🇸")).toBe("us");
    expect(getFlagCountryCode("Unknown")).toBeNull();
    expect(getFlagUrl("American", "lions")).toBeNull();
  });
});

describe("flagEmojiToCountryCode", () => {
  it("decodes regional-indicator flag emoji to lowercase ISO alpha-2 codes", () => {
    expect(flagEmojiToCountryCode("🇵🇱")).toBe("pl");
    expect(flagEmojiToCountryCode("🇺🇸")).toBe("us");
    expect(flagEmojiToCountryCode("🇨🇮")).toBe("ci");
  });

  it("throws on input that is not a two-letter flag emoji", () => {
    expect(() => flagEmojiToCountryCode("PL")).toThrow();
    expect(() => flagEmojiToCountryCode("🇵")).toThrow();
    expect(() => flagEmojiToCountryCode("")).toThrow();
  });
});

describe("getFlagCountryCode nationality coverage", () => {
  it("resolves the reported bug case", () => {
    expect(getFlagCountryCode("Polish")).toBe("pl");
  });

  it("resolves every nationality offered by the admin roster editor", () => {
    for (const { flag, label } of NATIONALITIES) {
      const byLabel = getFlagCountryCode(label);
      expect(byLabel, `label "${label}" has no country code`).toMatch(
        /^[a-z]{2}$/,
      );
      expect(getFlagCountryCode(flag), `emoji for "${label}"`).toBe(byLabel);
    }
  });
});
