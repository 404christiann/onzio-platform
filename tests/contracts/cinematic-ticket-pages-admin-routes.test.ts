import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/ticket-pages/SeasonMembershipEditor", () => ({ default: function SeasonMembershipEditor() { return null; } }));
vi.mock("@/components/admin/ticket-pages/KnowBeforeYouGoEditor", () => ({ default: function KnowBeforeYouGoEditor() { return null; } }));
import SeasonMembershipEditor from "@/components/admin/ticket-pages/SeasonMembershipEditor";
import KnowBeforeYouGoEditor from "@/components/admin/ticket-pages/KnowBeforeYouGoEditor";
import SeasonMembershipAdminPage from "@/app/admin/(protected)/season-membership/page";
import KnowBeforeYouGoAdminPage from "@/app/admin/(protected)/know-before-you-go/page";
import { CINEMATIC_PAGE_SHORTCUTS } from "@/lib/cinematic-editor-shortcuts";

describe("Season Ticket Membership and Know Before You Go admin routes", () => {
  it("open each page's own editor", () => {
    expect(SeasonMembershipAdminPage().type).toBe(SeasonMembershipEditor);
    expect(KnowBeforeYouGoAdminPage().type).toBe(KnowBeforeYouGoEditor);
  });

  it("are reachable from the Homepage editor's cinematic@2 shortcuts", () => {
    expect(CINEMATIC_PAGE_SHORTCUTS).toEqual(expect.arrayContaining([
      { label: "Edit in Season Ticket Membership", short: "Season Tickets", href: "/admin/season-membership" },
      { label: "Edit in Know Before You Go", short: "Know Before You Go", href: "/admin/know-before-you-go" },
    ]));
  });
});
