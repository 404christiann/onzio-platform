import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cinematicContactContentSchema, contactHref, starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import CinematicContact from "@/components/cinematic/CinematicContact";
import type { PublicPageVisibility } from "@/lib/public-page-visibility";

const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), content: vi.fn(), visibility: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/cinematic-contact-query", () => ({ fetchCinematicContactContent: mocks.content }));
vi.mock("@/lib/public-page-visibility-query", () => ({ fetchPublicPageVisibility: mocks.visibility }));
vi.mock("@/components/cinematic/CinematicDestination", () => ({ default: () => createElement("p", null, "Contact pending") }));
vi.mock("@/components/AcademyContactPage", () => ({ default: () => createElement("p", null, "Academy Contact") }));
vi.mock("@/components/editorial/EditorialContactPage", () => ({ default: () => createElement("p", null, "Editorial Contact") }));
vi.mock("@/lib/queries", () => ({ fetchContactContent: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
import ContactPage from "@/app/%5Fclubs/[slug]/contact/page";

const approved = {
  ...starterCinematicContactContent(),
  rows: {
    media: { prompt: "Media inquiries & requests", action: "Media" },
    tryouts: { prompt: "Try out for RCFC", action: "Tryouts" },
    tickets: { prompt: "Ticket questions & order information", action: "Tickets" },
    information: { prompt: "General questions", action: "Information" },
    partnerships: { prompt: "Interested in becoming a sponsor or partner?", action: "Partnerships" },
  },
};

describe("cinematic Contact source and routing", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.schema.mockReturnValue(mocks.trusted); mocks.content.mockResolvedValue(approved); mocks.visibility.mockResolvedValue({}); });
  it("renders five source rows with confirmed site routes and no Information link", () => {
    const html = renderToStaticMarkup(createElement(CinematicContact, { content: approved }));
    expect(html).toContain("Media inquiries &amp; requests");
    expect(html).toContain('href="/stadium/media-credentials"');
    expect(html).toContain('href="/tryouts"');
    expect(html).toContain('href="/tickets"');
    expect(html).toContain('href="/community/partnership"');
    expect(html).toContain("Link pending");
    expect((html.match(/<a /g) ?? []).length).toBe(4);
  });
  it("activates Information only after a safe destination is supplied", () => {
    const content = cinematicContactContentSchema.parse({ ...approved, informationHref: "mailto:office@example.com" });
    expect(renderToStaticMarkup(createElement(CinematicContact, { content }))).toContain('href="mailto:office@example.com"');
    expect(contactHref(content, "media")).toBe("/stadium/media-credentials");
  });
  it.each(["javascript:alert(1)", "//other.example", "https://user:password@example.com", "https://127.0.0.1/contact", "https://example.com/line\nbreak", "mailto:mailto:bad@example.com"])("rejects unsafe Information destination %s", href => {
    expect(cinematicContactContentSchema.safeParse({ ...approved, informationHref: href }).success).toBe(false);
  });
  // The shared link rule (lib/link-destination.ts): a typed email, http:// and a mailto query are accepted and stored normalized.
  it.each([["office@example.com", "mailto:office@example.com"], ["http://example.com", "https://example.com"], ["mailto:office@example.com?subject=Hi", "mailto:office@example.com?subject=Hi"]])("stores Information destination %s as %s", (href, stored) => {
    expect(cinematicContactContentSchema.parse({ ...approved, informationHref: href }).informationHref).toBe(stored);
  });
  it("rejects missing or invented row keys", () => {
    const { media, ...missing } = approved.rows;
    expect(cinematicContactContentSchema.safeParse({ ...approved, rows: missing }).success).toBe(false);
    expect(cinematicContactContentSchema.safeParse({ ...approved, rows: { ...approved.rows, news: media } }).success).toBe(false);
  });
  it("loads only the trusted tenant content for cinematic@2", async () => {
    mocks.club.mockResolvedValue({ id: "rose-city-id", presentationTemplateKey: "cinematic@2" });
    const html = renderToStaticMarkup(await ContactPage({ params: Promise.resolve({ slug: "rose-city" }) }));
    expect(html).toContain("Media inquiries &amp; requests");
    expect(mocks.content).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
  });
  it("keeps an unseeded cinematic tenant on the existing destination state", async () => {
    mocks.club.mockResolvedValue({ id: "empty-id", presentationTemplateKey: "cinematic@2" });
    mocks.content.mockResolvedValue(null);
    expect(renderToStaticMarkup(await ContactPage({ params: Promise.resolve({ slug: "empty" }) }))).toContain("Contact pending");
  });
});

// RC-PAGE-VISIBILITY: a Contact row has one button. When that button leads to a page the owner hid, the whole row is left out of the
// public page, so Contact never links to a 404. Editor previews pass no map and keep drawing every row.
describe("Contact follows the Visible to visitors switches", () => {
  const rows = (html: string) => (html.match(/class="contact-row"/g) ?? []).length;
  const links = (html: string) => [...html.matchAll(/<a href="([^"]*)"/g)].map(match => match[1]);
  const render = (pageVisibility?: PublicPageVisibility | null, content = approved) => renderToStaticMarkup(createElement(CinematicContact, { content, pageVisibility }));
  const TICKET_PROMPT = "Ticket questions &amp; order information";
  const OTHERS = ["/stadium/media-credentials", "/tryouts", "/community/partnership"];

  it("draws all five rows, including the Tickets button, with the map absent, empty, true or only another page hidden", () => {
    const base = render();
    expect(rows(base)).toBe(5);
    expect(links(base)).toEqual([...OTHERS.slice(0, 2), "/tickets", OTHERS[2]]);
    for (const map of [null, {}, { tickets: true }, { "season-membership": false }, { stadium: false, "chick-fil-a": false, "foothill-transit": false }]) expect(render(map), JSON.stringify(map)).toBe(base);
  });

  it("drops the whole Tickets row when Single match tickets is hidden, and nothing else", () => {
    const html = render({ tickets: false });
    expect(rows(html)).toBe(4);
    expect(html).not.toContain('href="/tickets"');
    expect(html).not.toContain(TICKET_PROMPT);
    expect(html).not.toContain(">Tickets</a>");
    expect(links(html)).toEqual(OTHERS.slice(0, 2).concat(OTHERS[2]));
    expect(html).toContain("Media inquiries &amp; requests");
    expect(html).toContain("General questions");
    expect(html).toContain("Link pending");
    expect(render({ tickets: false, "season-membership": false, stadium: false })).toBe(html);
  });

  it("keeps the rows in the same order around the gap", () => {
    const prompts = (html: string) => [...html.matchAll(/<div class="contact-row"><span>([^<]*)<\/span>/g)].map(match => match[1]);
    expect(prompts(render())).toEqual(["Media inquiries &amp; requests", "Try out for RCFC", TICKET_PROMPT, "General questions", "Interested in becoming a sponsor or partner?"]);
    expect(prompts(render({ tickets: false }))).toEqual(["Media inquiries &amp; requests", "Try out for RCFC", "General questions", "Interested in becoming a sponsor or partner?"]);
  });

  it("also leaves out an owner-typed Information destination that points at a hidden page, and keeps the others", () => {
    const withInformation = (informationHref: string) => cinematicContactContentSchema.parse({ ...approved, informationHref });
    const hidden = render({ tickets: false }, withInformation("/tickets"));
    expect(rows(hidden)).toBe(3);
    expect(hidden).not.toContain("General questions");
    for (const href of ["/tickets/know-before-you-go", "/tickets/season-membership", "mailto:office@example.com", "https://example.com/tickets"]) {
      const html = render({ tickets: false }, withInformation(href));
      expect(rows(html), href).toBe(4);
      expect(html, href).toContain(`href="${href}"`);
    }
    expect(rows(render({ tickets: false }, withInformation("/tickets/")))).toBe(3);
    expect(rows(render({ tickets: true }, withInformation("/tickets")))).toBe(5);
  });

  it("never drops a row in an editor preview, whatever the club's map says (previews pass none)", () => {
    expect(rows(render(undefined))).toBe(5);
    expect(rows(renderToStaticMarkup(createElement(CinematicContact, { content: approved })))).toBe(5);
  });

  describe("public page", () => {
    const visit = async (slug = "rose-city") => renderToStaticMarkup(await ContactPage({ params: Promise.resolve({ slug }) }));
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.schema.mockReturnValue(mocks.trusted); mocks.content.mockResolvedValue(approved); mocks.visibility.mockResolvedValue({});
      mocks.club.mockResolvedValue({ id: "rose-city-id", presentationTemplateKey: "cinematic@2" });
    });

    it("shows the Tickets row while the page is shown, from an empty or a missing map", async () => {
      for (const map of [{}, { tickets: true }, { "season-membership": false }]) {
        mocks.visibility.mockResolvedValue(map);
        const html = await visit();
        expect(rows(html), JSON.stringify(map)).toBe(5);
        expect(html).toContain('href="/tickets"');
      }
      expect(mocks.visibility).toHaveBeenCalledWith("rose-city-id");
    });
    it("leaves the Tickets row out once Single match tickets is hidden", async () => {
      mocks.visibility.mockResolvedValue({ tickets: false });
      const html = await visit();
      expect(rows(html)).toBe(4);
      expect(html).not.toContain('href="/tickets"');
      expect(html).not.toContain(TICKET_PROMPT);
      expect(html).toContain('href="/tryouts"');
      expect(mocks.content).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
    });
    it("keeps every row when the visibility read failed open (it resolves {})", async () => {
      mocks.visibility.mockResolvedValue({});
      expect(rows(await visit())).toBe(5);
    });
    it("keeps an unseeded cinematic tenant on the existing destination state, hidden or not", async () => {
      mocks.content.mockResolvedValue(null);
      mocks.visibility.mockResolvedValue({ tickets: false });
      expect(await visit("empty")).toContain("Contact pending");
    });
    it("reads the map only for cinematic@2", async () => {
      mocks.club.mockResolvedValue({ id: "other-id", presentationTemplateKey: "cinematic@1" });
      await expect(ContactPage({ params: Promise.resolve({ slug: "other" }) })).rejects.toThrow("not found");
      expect(mocks.visibility).not.toHaveBeenCalled();
    });
  });
});
