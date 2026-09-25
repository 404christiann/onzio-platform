import { describe, expect, it, vi } from "vitest";
import { acquireAcademyPageScrollLock } from "@/lib/academy-page-scroll-lock";

function makeDocument() {
  const rootStyle = { overflow: "auto" };
  const bodyStyle = {
    overflow: "clip",
    position: "relative",
    top: "3px",
    width: "96%",
  };
  const scrollTo = vi.fn();
  const location = { pathname: "/" };
  const doc = {
    documentElement: { style: rootStyle },
    body: { style: bodyStyle },
    defaultView: { scrollY: 143, scrollTo, location },
  } as unknown as Document;
  return { doc, rootStyle, bodyStyle, scrollTo, location };
}

describe("academy overlapping page scroll locks", () => {
  it("keeps the menu lock when the hero finishes, then restores original styles and scroll", () => {
    const { doc, rootStyle, bodyStyle, scrollTo } = makeDocument();
    const releaseHero = acquireAcademyPageScrollLock(doc);
    const releaseMenu = acquireAcademyPageScrollLock(doc);

    expect(rootStyle.overflow).toBe("hidden");
    expect(bodyStyle).toEqual({
      overflow: "hidden",
      position: "fixed",
      top: "-143px",
      width: "100%",
    });

    releaseHero();
    expect(bodyStyle.position).toBe("fixed");
    expect(bodyStyle.overflow).toBe("hidden");
    expect(scrollTo).not.toHaveBeenCalled();

    releaseMenu();
    expect(rootStyle.overflow).toBe("auto");
    expect(bodyStyle).toEqual({
      overflow: "clip",
      position: "relative",
      top: "3px",
      width: "96%",
    });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 143);
  });

  it("also restores only after the last owner when the menu closes first", () => {
    const { doc, bodyStyle, scrollTo } = makeDocument();
    const releaseMenu = acquireAcademyPageScrollLock(doc);
    const releaseHero = acquireAcademyPageScrollLock(doc);

    releaseMenu();
    expect(bodyStyle.position).toBe("fixed");
    expect(scrollTo).not.toHaveBeenCalled();

    releaseHero();
    releaseHero();
    expect(bodyStyle.position).toBe("relative");
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 143);
  });

  it("releases all styles without restoring the old scroll offset after navigation", () => {
    const { doc, rootStyle, bodyStyle, scrollTo, location } = makeDocument();
    const releaseHero = acquireAcademyPageScrollLock(doc);
    const releaseMenu = acquireAcademyPageScrollLock(doc);

    location.pathname = "/schedule";
    releaseHero();
    releaseMenu();

    expect(rootStyle.overflow).toBe("auto");
    expect(bodyStyle.position).toBe("relative");
    expect(bodyStyle.overflow).toBe("clip");
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
