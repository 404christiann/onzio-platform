import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/stadium/RobinsonStadiumEditor", () => ({ default: function RobinsonStadiumEditor() { return null; } }));
vi.mock("@/components/admin/stadium/StadiumEditor", () => ({ default: function StadiumEditor() { return null; } }));
import RobinsonStadiumEditor from "@/components/admin/stadium/RobinsonStadiumEditor";
import StadiumEditor from "@/components/admin/stadium/StadiumEditor";
import StadiumAdminPage from "@/app/admin/(protected)/stadium/page";
import FoothillTransitAdminPage from "@/app/admin/(protected)/foothill-transit/page";
import { CINEMATIC_PAGE_SHORTCUTS } from "@/lib/cinematic-editor-shortcuts";

describe("Robinson Stadium and Foothill Transit admin routes", () => {
  it("opens the Robinson editor at /admin/stadium and the Bus Route editor at /admin/foothill-transit", () => {
    expect(StadiumAdminPage().type).toBe(RobinsonStadiumEditor);
    expect(FoothillTransitAdminPage().type).toBe(StadiumEditor);
  });

  it("lists both pages among the Homepage editor's cinematic@2 shortcuts", () => {
    expect(CINEMATIC_PAGE_SHORTCUTS).toEqual([
      { label: "Edit in Robinson Stadium", short: "Stadium", href: "/admin/stadium" },
      { label: "Edit in Foothill Transit", short: "Foothill Transit", href: "/admin/foothill-transit" },
      { label: "Edit in Chick-fil-A", short: "Chick-fil-A", href: "/admin/chick-fil-a" },
      { label: "Edit Stadium Guidelines & Fan Code", short: "Policies", href: "/admin/policies" },
      { label: "Edit in Partners", short: "Partners", href: "/admin/partners" },
      { label: "Edit in Injury Report", short: "Injury Report", href: "/admin/injury-report" },
      { label: "Edit in Season Ticket Membership", short: "Season Tickets", href: "/admin/season-membership" },
      { label: "Edit in Know Before You Go", short: "Know Before You Go", href: "/admin/know-before-you-go" },
    ]);
  });
});
