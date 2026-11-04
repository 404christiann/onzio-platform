import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ club: vi.fn(), schema: vi.fn(), homepage: vi.fn(), trusted: {} }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.club }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: mocks.schema }) }));
vi.mock("@/lib/queries", () => ({ fetchContactProfile: vi.fn(), fetchTryouts: vi.fn(), fetchTryoutsPageContent: vi.fn() }));
vi.mock("@/lib/cinematic-homepage-content", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/cinematic-homepage-content")>(),
  fetchCinematicHomepageContent: mocks.homepage,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found"); },
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));
vi.mock("@/components/cinematic/CinematicDestination", () => ({ default: ({ labelId }: { labelId: string }) => createElement("div", null, labelId) }));
vi.mock("@/components/AcademyTryoutsPage", () => ({ default: () => createElement("div", null, "academy tryouts") }));
vi.mock("@/components/editorial/EditorialTryouts", () => ({ default: () => createElement("div", null, "editorial tryouts") }));

import TryoutsPage from "@/app/%5Fclubs/[slug]/tryouts/page";
import MediaCredentialsPage from "@/app/%5Fclubs/[slug]/stadium/media-credentials/page";
import NationalAnthemRequestPage from "@/app/%5Fclubs/[slug]/community/national-anthem/page";

const tryoutsUrl = "https://docs.google.com/forms/d/tryouts/viewform?edit_requested=true";
const mediaUrl = "https://docs.google.com/forms/d/media/viewform?edit_requested=true";
const anthemUrl = "https://forms.gle/tAezhCRdXH1Z1bMR7";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.club.mockResolvedValue({ id: "rose-city-id", presentationTemplateKey: "cinematic@2" });
  mocks.schema.mockReturnValue(mocks.trusted);
  mocks.homepage.mockResolvedValue({ navigation: { destinations: { tryouts: tryoutsUrl, mediaCredentials: mediaUrl, nationalAnthem: anthemUrl } } });
});

it("redirects the 2027 tenant's tryouts, media, and anthem routes to its saved forms", async () => {
  await expect(TryoutsPage({ params: Promise.resolve({ slug: "rose-city" }) })).rejects.toThrow(`redirect:${tryoutsUrl}`);
  await expect(MediaCredentialsPage({ params: Promise.resolve({ slug: "rose-city" }) })).rejects.toThrow(`redirect:${mediaUrl}`);
  await expect(NationalAnthemRequestPage({ params: Promise.resolve({ slug: "rose-city" }) })).rejects.toThrow(`redirect:${anthemUrl}`);
  expect(mocks.homepage).toHaveBeenCalledTimes(3);
  expect(mocks.homepage).toHaveBeenCalledWith("rose-city-id", mocks.trusted);
});

it("shows a placeholder while an external destination is missing", async () => {
  mocks.homepage.mockResolvedValue({ navigation: { destinations: { tryouts: "", mediaCredentials: "", nationalAnthem: "" } } });
  expect(renderToStaticMarkup(await TryoutsPage({ params: Promise.resolve({ slug: "rose-city" }) }))).toContain("tryouts");
  expect(renderToStaticMarkup(await MediaCredentialsPage({ params: Promise.resolve({ slug: "rose-city" }) }))).toContain("media-credentials");
  expect(renderToStaticMarkup(await NationalAnthemRequestPage({ params: Promise.resolve({ slug: "rose-city" }) }))).toContain("national-anthem");
});

it("does not redirect to an unsafe anthem destination", async () => {
  mocks.homepage.mockResolvedValue({ navigation: { destinations: { nationalAnthem: "javascript:alert(1)" } } });
  expect(renderToStaticMarkup(await NationalAnthemRequestPage({ params: Promise.resolve({ slug: "rose-city" }) }))).toContain("national-anthem");
});

it("does not expose the media or anthem routes to other templates", async () => {
  mocks.club.mockResolvedValue({ id: "other-id", presentationTemplateKey: "academy@1" });
  await expect(MediaCredentialsPage({ params: Promise.resolve({ slug: "other" }) })).rejects.toThrow("not found");
  await expect(NationalAnthemRequestPage({ params: Promise.resolve({ slug: "other" }) })).rejects.toThrow("not found");
  expect(mocks.homepage).not.toHaveBeenCalled();
});

it.each([["academy@1", "academy tryouts"], ["editorial@1", "editorial tryouts"]])("preserves the %s Tryouts page", async (template, expected) => {
  mocks.club.mockResolvedValue({ id: "other-id", presentationTemplateKey: template });
  const html = renderToStaticMarkup(await TryoutsPage({ params: Promise.resolve({ slug: "other" }) }));
  expect(html).toContain(expected);
  expect(mocks.homepage).not.toHaveBeenCalled();
});
