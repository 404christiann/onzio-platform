import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { hydrateTicketPage, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import { seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";

vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";

function html(change: (heading: { visible?: boolean; title?: string }) => void) {
  const content = structuredClone(seasonMembershipReferenceContent);
  change(content.heading as { visible?: boolean; title?: string });
  return renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: hydrateTicketPage("season-membership", content as SeasonMembershipContent, []) }));
}
const h1s = (markup: string) => [...markup.matchAll(/<h1[^>]*>/g)].map(match => match[0]);

describe("RC-ADMIN-09 Season page keeps its h1", () => {
  it("renders exactly one visible h1 when the heading is on or the flag is absent, and the two are identical", () => {
    const absent = html(() => {});
    const on = html(heading => { heading.visible = true; });
    expect(h1s(absent)).toEqual(["<h1>"]);
    expect(h1s(on)).toEqual(["<h1>"]);
    expect(on).toBe(absent);
    expect(absent).toContain("tp-heading");
  });

  it("renders exactly one sr-only h1 and no banner when the heading is off", () => {
    const off = html(heading => { heading.visible = false; });
    expect(h1s(off)).toEqual(['<h1 class="sr-only">']);
    expect(off).toContain('<h1 class="sr-only">Season Ticket Membership</h1>');
    expect(off).not.toContain("tp-heading");
  });

  it("falls back to the default text when the heading is off and the title is blank", () => {
    for (const title of ["", "   "]) {
      const off = html(heading => { heading.visible = false; heading.title = title; });
      expect(h1s(off)).toEqual(['<h1 class="sr-only">']);
      expect(off).toContain('<h1 class="sr-only">Season Ticket Membership</h1>');
      expect(off).not.toContain("tp-heading");
    }
  });

  it("keeps a non-blank hidden title as written", () => {
    const off = html(heading => { heading.visible = false; heading.title = "Season Pass"; });
    expect(off).toContain('<h1 class="sr-only">Season Pass</h1>');
  });
});
