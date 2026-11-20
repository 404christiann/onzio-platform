import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/queries", () => ({}));
import { ClubContextProvider } from "@/components/ClubContextProvider";
import CinematicRouteLoading from "@/components/cinematic/CinematicRouteLoading";
import type { ClubContext } from "@/lib/club-context";

// RC-CLS-B: the footer must not be visible under a short fallback and then pushed down when the page streams in.
const club = (presentationTemplateKey: string) => ({ id: "c", slug: "s", name: "S", presentationTemplateKey, storeEnabled: true } as unknown as ClubContext);
const render = (key: string) => renderToStaticMarkup(createElement(ClubContextProvider, { club: club(key), children: createElement(CinematicRouteLoading) }));
describe("cinematic route loading fallback", () => {
  it("is a full viewport tall for cinematic@2", () => {
    expect(render("cinematic@2")).toContain("min-height:100svh");
  });
  it("keeps the shared fallback for other templates", () => {
    const html = render("heritage@1");
    expect(html).toContain("min-h-[60svh]");
    expect(html).not.toContain("100svh");
  });
  it.each(["roster", "schedule", "shop", "club/logo"])("%s route uses it", (route) => {
    expect(existsSync(resolve(process.cwd(), `app/%5Fclubs/[slug]/${route}/loading.tsx`))).toBe(true);
  });
});
