import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchClubBranding } from "@/lib/queries";
import { academyLoadingRoute } from "@/lib/academy-loading-route";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const loadingSource = readFileSync(resolve(process.cwd(), "components/AcademyLoadingSkeleton.tsx"), "utf8");
const routeSource = readFileSync(resolve(process.cwd(), "components/AcademyRouteLoadingSkeleton.tsx"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "app/%5Fclubs/[slug]/layout.tsx"), "utf8");
const navSource = readFileSync(resolve(process.cwd(), "components/Nav.tsx"), "utf8");

describe("academy Header Stays loading", () => {
  it("uses the roster-inspired centered loader without placeholder geometry", () => {
    expect(loadingSource).toContain('aria-busy="true"');
    expect(loadingSource).toContain('role="status"');
    expect(loadingSource).toContain("items-center justify-center bg-white");
    expect(loadingSource).toContain("motion-safe:animate-spin");
    expect(loadingSource).toContain("min-h-[100svh] pt-24 sm:pt-28");
    expect(loadingSource).toContain("Loading squad…");
    expect(loadingSource).not.toContain("DIVERSE_CITY_HERO_VIDEO.posterSrc");
    expect(loadingSource).not.toContain("grid-cols-2");
  });

  it("keeps the real header mounted during branding and page waits", () => {
    expect(routeSource).toContain("<ClubBrandingProvider>");
    expect(routeSource).toContain("<Nav loadingAppearance />");
    expect(routeSource).toContain("<AcademyPageLoadingSurface label={labels[route]} />");
    expect(layoutSource).toContain("<Suspense fallback={<AcademyPageLoadingSkeleton />}>");
    expect(layoutSource).toContain("<Nav />");
    expect(layoutSource).toContain("<Suspense fallback={<AcademyRouteLoadingSkeleton />}>");
  });

  it("keeps the academy mobile menu scrollable while the homepage is covered", () => {
    expect(navSource).toContain("useAcademyPageScrollLock(isAcademy && menuOpen)");
    expect(navSource).toContain("overflow-y-auto overscroll-contain bg-white");
    expect(navSource).toContain("flex min-h-full flex-col justify-center px-8 pb-16");
    expect(navSource).toContain("aria-expanded={menuOpen}");
  });

  it("recognizes the program detail route without showing its old geometric frame", () => {
    expect(academyLoadingRoute("/programs/upsl-mens-teams")).toBe("program-detail");
    expect(academyLoadingRoute("/_clubs/diverse-city/programs/upsl-mens-teams")).toBe("program-detail");
    expect(academyLoadingRoute("/programs")).toBe("programs");
    expect(academyLoadingRoute("/shop")).toBe("shop");
    expect(academyLoadingRoute("/")).toBe("home");
    expect(routeSource).toContain('"program-detail": "Loading program…"');
  });

  it("maps every academy navigation surface to its loading label", () => {
    expect([
      ["/", "home"],
      ["/club/about", "about"],
      ["/club/logo", "logo"],
      ["/roster", "roster"],
      ["/schedule", "schedule"],
      ["/programs", "programs"],
      ["/programs/upsl-mens-teams", "program-detail"],
      ["/tryouts", "navy"],
      ["/contact", "navy"],
      ["/sponsors", "navy"],
      ["/shop", "shop"],
      ["/register/fall-2026", "registration"],
      ["/register/fall-2026/confirmation", "registration"],
    ].map(([path]) => academyLoadingRoute(path))).toEqual([
      "home", "about", "logo", "roster", "schedule", "programs", "program-detail",
      "navy", "navy", "navy", "shop", "registration", "registration",
    ]);
    expect(academyLoadingRoute("/stats")).toBe("simple");
  });

  it("uses the same quiet loading treatment for client reads", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    expect(read("components/AcademyShopPage.tsx")).toContain("<AcademyInteriorLoadingSkeleton shop />");
    expect(read("app/(public)/roster/page.tsx")).toContain("loading && isAcademy && <AcademyRosterLoadingSkeleton />");
    expect(read("app/(public)/schedule/page.tsx")).toContain("loading && isAcademy && <AcademyScheduleLoadingSkeleton />");
    expect(read("app/%5Fclubs/[slug]/loading.tsx")).toContain("<AcademyPageLoadingSkeleton />");
    expect(loadingSource).toContain("Loading club store…");
    expect(loadingSource).toContain("Loading next match…");
    expect(loadingSource).toContain("Loading club story…");
    expect(loadingSource).not.toContain("rounded-[5px] bg-[#c8deea]");
  });

  it("reveals the homepage over a loaded poster while the video buffers", () => {
    const heroSource = readFileSync(resolve(process.cwd(), "components/Hero.tsx"), "utf8");
    const homeSource = readFileSync(resolve(process.cwd(), "components/HomePageClient.tsx"), "utf8");
    const videoSource = readFileSync(resolve(process.cwd(), "components/ResilientBunnyVideo.tsx"), "utf8");
    expect(heroSource).toContain("!editing && !academyMediaReady");
    expect(heroSource).toContain("<AcademyHeroLoadingSkeleton clubName={club.name} />");
    expect(heroSource).toContain("setAcademyMediaReady(true);");
    expect(heroSource).toContain("showPosterUntilPlaying");
    expect(heroSource).toContain("onAcademyMediaReady?.();");
    expect(heroSource).toContain("inert={!editing && !academyMediaReady}");
    expect(homeSource).toContain("onAcademyMediaReady={() => setAcademyHeroReady(true)}");
    expect(homeSource).toContain("<div inert={covered} aria-hidden={covered}");
    expect(videoSource).toContain("showPosterUntilPlaying ? undefined : markVisualReady");
    expect(videoSource).toContain("setPlaying(true);");
    expect(videoSource).toContain("onLoad={markVisualReady}");
    expect(videoSource).toContain("10_000");
    expect(loadingSource).toContain('"Loading " + clubName + "…"');
    expect(loadingSource).toContain("data-academy-page-loading");
    expect(loadingSource).toContain("data-academy-hero-loading");
    expect(loadingSource).toContain("useAcademyPageScrollLock(true)");
  });

  it("resolves the first-paint crest through the supplied tenant-scoped server client", async () => {
    const clubId = "11111111-1111-4111-8111-111111111111";
    const calls: Array<[string, string]> = [];
    const scopedClient = {
      from(table: string) {
        expect(table).toBe("site_branding");
        return {
          select() {
            return {
              eq(column: string, value: string) {
                calls.push([column, value]);
                return {
                  async limit() {
                    return { data: [{
                      club_id: clubId,
                      club_logo_path: "/tenant-crest.webp",
                      club_logo_asset_id: null,
                      inverse_logo_path: "",
                      inverse_logo_asset_id: null,
                      footer_tagline: "Club first",
                    }], error: null };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as typeof import("@/lib/supabase").supabase;

    const branding = await fetchClubBranding(clubId, scopedClient);
    expect(calls).toEqual([["club_id", clubId]]);
    expect(branding.logoPath).toBe("/tenant-crest.webp");
    expect(branding.footerTagline).toBe("Club first");
  });
});
