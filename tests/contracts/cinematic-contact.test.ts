import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cinematicContactContentSchema, contactHref, starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import CinematicContact from "@/components/cinematic/CinematicContact";

const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), content: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/cinematic-contact-query", () => ({ fetchCinematicContactContent: mocks.content }));
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
  beforeEach(() => { vi.clearAllMocks(); mocks.schema.mockReturnValue(mocks.trusted); mocks.content.mockResolvedValue(approved); });
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
  it.each(["javascript:alert(1)", "//other.example", "https://user:password@example.com", "http://example.com", "https://127.0.0.1/contact", "https://example.com/line\nbreak", "mailto:bad@example.com?subject=x"])("rejects unsafe Information destination %s", href => {
    expect(cinematicContactContentSchema.safeParse({ ...approved, informationHref: href }).success).toBe(false);
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
