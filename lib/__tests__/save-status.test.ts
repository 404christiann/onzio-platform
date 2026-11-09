import { describe, expect, it } from "vitest";
import { savedLabel, websiteState } from "@/lib/save-status";

describe("websiteState", () => {
  it.each(["live", "grace"] as const)("is live for a public site with access %s", (publicAccess) => {
    expect(websiteState({ slug: "alpha", publicAccess })).toBe("live");
  });

  it.each(["preview", "suspended"] as const)("is paused for a site with access %s", (publicAccess) => {
    expect(websiteState({ slug: "alpha", publicAccess })).toBe("paused");
  });

  it("is paused for a held club even when its access is live", () => {
    expect(websiteState({ slug: "rose-city", publicAccess: "live" })).toBe("paused");
  });
});

describe("savedLabel", () => {
  it("says the change is on the website when the site is live", () => {
    expect(savedLabel("live")).toBe("Saved · on your website");
    expect(savedLabel("live", "Added")).toBe("Added · on your website");
  });

  it("says the website is paused instead of claiming the change is visible", () => {
    expect(savedLabel("paused")).toBe("Saved · your website is paused");
    expect(savedLabel("paused", "Added")).toBe("Added · your website is paused");
  });
});
