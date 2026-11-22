import { describe, expect, it } from "vitest";
import {
  PUBLIC_PAGE_KEYS,
  PUBLIC_PAGE_PATHS,
  isPublicPageKey,
  pageVisible,
  parsePublicPageVisibility,
} from "@/lib/public-page-visibility";

describe("pageVisible", () => {
  it.each(PUBLIC_PAGE_KEYS)("shows %s when the club, the map or the key is missing", (key) => {
    expect(pageVisible(undefined, key)).toBe(true);
    expect(pageVisible(null, key)).toBe(true);
    expect(pageVisible({}, key)).toBe(true);
    expect(pageVisible({ publicPageVisibility: undefined }, key)).toBe(true);
    expect(pageVisible({ publicPageVisibility: null }, key)).toBe(true);
    expect(pageVisible({ publicPageVisibility: {} }, key)).toBe(true);
  });

  it.each(PUBLIC_PAGE_KEYS)("shows %s when it is explicitly true", (key) => {
    expect(pageVisible({ publicPageVisibility: { [key]: true } }, key)).toBe(true);
  });

  it.each(PUBLIC_PAGE_KEYS)("hides %s only when it is explicitly false", (key) => {
    expect(pageVisible({ publicPageVisibility: { [key]: false } }, key)).toBe(false);
  });

  it("scopes a hidden page to its own key", () => {
    const club = { publicPageVisibility: { stadium: false } };
    expect(pageVisible(club, "stadium")).toBe(false);
    expect(pageVisible(club, "chick-fil-a")).toBe(true);
    expect(pageVisible(club, "foothill-transit")).toBe(true);
  });
});

describe("parsePublicPageVisibility", () => {
  it("keeps known keys with boolean values", () => {
    expect(parsePublicPageVisibility({ stadium: false, "chick-fil-a": true, "foothill-transit": false })).toEqual({
      stadium: false,
      "chick-fil-a": true,
      "foothill-transit": false,
    });
  });

  it("drops unknown keys and values that are not booleans", () => {
    expect(
      parsePublicPageVisibility({
        stadium: "false",
        "chick-fil-a": 0,
        "foothill-transit": null,
        shop: false,
        robinson: true,
        __proto__: { stadium: false },
      }),
    ).toEqual({});
    expect(parsePublicPageVisibility({ stadium: false, shop: false, "chick-fil-a": "no" })).toEqual({ stadium: false });
  });

  it.each([null, undefined, [], [true], "stadium", 7, true])("reads %j as nothing hidden", (raw) => {
    expect(parsePublicPageVisibility(raw)).toEqual({});
  });
});

describe("page keys", () => {
  it("recognises exactly the three pages", () => {
    expect([...PUBLIC_PAGE_KEYS]).toEqual(["stadium", "chick-fil-a", "foothill-transit"]);
    expect(PUBLIC_PAGE_KEYS.every(isPublicPageKey)).toBe(true);
    for (const other of ["shop", "robinson", "", "Stadium", null, undefined, 1]) expect(isPublicPageKey(other)).toBe(false);
  });

  it("has a public path for every key", () => {
    expect(Object.keys(PUBLIC_PAGE_PATHS).sort()).toEqual([...PUBLIC_PAGE_KEYS].sort());
  });
});
