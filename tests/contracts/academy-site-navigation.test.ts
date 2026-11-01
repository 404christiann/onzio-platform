import { describe, expect, it } from "vitest";
import {
  academyFooterLinks,
  academyNavItems,
  isNavItemActive,
} from "@/components/sites/diverse-city/navigation";
import {
  academyHeroHeader,
  academyHref,
  academyLoadingRoute,
  academyPathname,
  type AcademyHref,
} from "@/components/sites/diverse-city/routes";

const programs = [
  { slug: "upsl-mens-teams", navLabel: "Men's Teams", displayTitle: "UPSL Men's Teams" },
  { slug: "youth-academy", navLabel: "", displayTitle: "Youth Academy" },
];

function plain(items: ReturnType<typeof academyNavItems>) {
  return items.map((item) =>
    "href" in item
      ? [item.label, item.href]
      : [item.label, item.children.map((child) => [child.label, child.href])],
  );
}

describe("Academy navigation derived from implemented routes", () => {
  it("keeps the visitor-facing header items, labels and order", () => {
    expect(plain(academyNavItems(programs))).toEqual([
      ["Home", "/"],
      ["About", "/club/about"],
      ["Roster", "/roster"],
      ["Schedule", [["Fixtures", "/schedule"], ["Tryouts", "/tryouts"]]],
      ["Programs", [["Men's Teams", "/programs/upsl-mens-teams"], ["Youth Academy", "/programs/youth-academy"]]],
      ["Store", "/shop"],
      ["Contact", "/contact"],
    ]);
  });

  it("keeps Programs a menu without a page of its own, even with no programs", () => {
    const programsItem = academyNavItems([]).find((item) => item.label === "Programs");
    expect(programsItem).toEqual({ label: "Programs", children: [] });
  });

  it("keeps the footer Explore links", () => {
    expect(academyFooterLinks.map((link) => [link.label, link.href])).toEqual([
      ["Club", "/club/about"],
      ["Programs", "/programs"],
      ["Roster", "/roster"],
      ["Schedule", "/schedule"],
      ["Sponsors", "/sponsors"],
      ["Contact", "/contact"],
      ["Tryouts", "/tryouts"],
    ]);
  });

  it("marks a link active on its page and below it, and a menu only on its own children", () => {
    const items = academyNavItems(programs);
    const active = (path: string) => items.filter((item) => isNavItemActive(path, item)).map((item) => item.label);
    expect(active("/")).toEqual(["Home"]);
    expect(active("/roster")).toEqual(["Roster"]);
    expect(active("/roster/9c4a6f4e")).toEqual(["Roster"]);
    expect(active("/schedule")).toEqual(["Schedule"]);
    expect(active("/schedule/9c4a6f4e")).toEqual([]);
    expect(active("/tryouts")).toEqual(["Schedule"]);
    expect(active("/programs/youth-academy")).toEqual(["Programs"]);
    expect(active("/programs")).toEqual([]);
    expect(active("/club/logo")).toEqual([]);
  });

  it("names which routes open on a hero the header floats over", () => {
    expect(academyHeroHeader("/")).toBe("scroll");
    expect(academyHeroHeader("/programs/youth-academy")).toBe("scroll");
    expect(academyHeroHeader("/club/logo")).toBe("always");
    expect(academyHeroHeader("/shop")).toBe("scroll-desktop");
    for (const path of ["/programs", "/contact", "/tryouts", "/schedule/9c4a6f4e", "/standings", "/club/about"]) {
      expect(academyHeroHeader(path)).toBeUndefined();
    }
  });

  it("reads the same public path whichever internal prefix the request carries", () => {
    expect(academyPathname("/_clubs/diverse-city/roster")).toBe("/roster");
    expect(academyPathname("/%5Fclubs/diverse-city")).toBe("/");
    expect(academyPathname("/roster/")).toBe("/roster");
    expect(academyLoadingRoute("/_clubs/diverse-city/programs/upsl-mens-teams")).toBe("program-detail");
  });

  it("refuses a destination that is not an implemented route at compile time", () => {
    // @ts-expect-error a hand-written path is not a route-table destination
    const handWritten: AcademyHref = "/standings";
    // @ts-expect-error standings is not an implemented route
    const unknown = () => academyHref("standings");
    // @ts-expect-error a dynamic route needs its parameter
    const missingParameter = () => academyHref("programDetail");
    expect([handWritten, unknown, missingParameter]).toHaveLength(3);
  });
});
