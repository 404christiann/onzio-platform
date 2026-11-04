import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), transit: vi.fn(), tickets: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/stadium-query", () => ({ fetchStadiumContent: mocks.transit }));
vi.mock("@/lib/tickets-query", () => ({ fetchTicketsContent: mocks.tickets }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/components/cinematic/CinematicStadium", () => ({ default: ({ content }: { content: { title: string } }) => createElement("div", null, content.title) }));

import FoothillTransitPage from "@/app/%5Fclubs/[slug]/stadium/foothill-transit/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schema.mockReturnValue(mocks.trusted);
  mocks.transit.mockResolvedValue({ title: "Road to the Match" });
  mocks.tickets.mockResolvedValue({ purchaseUrl: "" });
});

it("renders the tenant's bus route content from the trusted server schema", async () => {
  mocks.club.mockResolvedValue({ id: "rose-city-id", presentationTemplateKey: "cinematic@2" });
  const html = renderToStaticMarkup(await FoothillTransitPage({ params: Promise.resolve({ slug: "rose-city" }) }));
  expect(html).toContain("Road to the Match");
  expect(mocks.club).toHaveBeenCalledWith("rose-city");
  expect(mocks.schema).toHaveBeenCalledWith("onzio");
  expect(mocks.transit).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
  expect(mocks.tickets).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
});

it.each(["academy@1", "clubhouse@1", "editorial@1", "cinematic@1"])("does not expose the bus page for %s", async template => {
  mocks.club.mockResolvedValue({ id: "other", presentationTemplateKey: template });
  await expect(FoothillTransitPage({ params: Promise.resolve({ slug: "other" }) })).rejects.toThrow("not found");
  expect(mocks.transit).not.toHaveBeenCalled();
  expect(mocks.tickets).not.toHaveBeenCalled();
});
