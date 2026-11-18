import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyTicketsContent, hydrateTicketsContent } from "@/lib/tickets-content";
const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), content: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/tickets-query", () => ({ fetchTicketsContent: mocks.content }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/components/cinematic/CinematicTickets", () => ({ default: ({ content }: {
        content: {
            title: string;
        };
    }) => createElement("div", null, content.title) }));
import TicketsPage from "@/app/%5Fclubs/[slug]/tickets/page";
beforeEach(() => { vi.clearAllMocks(); mocks.schema.mockReturnValue(mocks.trusted); mocks.content.mockResolvedValue(hydrateTicketsContent({ ...emptyTicketsContent(), title: "Tenant tickets" }, [])); });
it("uses the trusted server schema for this tenant and renderer", async () => { mocks.club.mockResolvedValue({ id: "tenant", presentationTemplateKey: "cinematic@2" }); expect(renderToStaticMarkup(await TicketsPage({ params: Promise.resolve({ slug: "tenant" }) }))).toContain("Tenant tickets"); expect(mocks.content).toHaveBeenCalledWith("tenant", mocks.trusted); });
it.each(["cinematic@1", "academy@1", "clubhouse@1", "editorial@1"])("does not expose Tickets for %s", async (template) => { mocks.club.mockResolvedValue({ id: "tenant", presentationTemplateKey: template }); await expect(TicketsPage({ params: Promise.resolve({ slug: "tenant" }) })).rejects.toThrow("not found"); expect(mocks.content).not.toHaveBeenCalled(); });
