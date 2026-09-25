export type AcademyLoadingRoute = "home" | "program-detail" | "programs" | "navy" | "shop" | "about" | "roster" | "schedule" | "logo" | "registration" | "simple";

/** Pick a loading label from the public route without using club-specific data. */
export function academyLoadingRoute(pathname: string): AcademyLoadingRoute {
  const route = pathname
    .replace(/^\/(?:_clubs|%5fclubs)\/[^/]+/i, "")
    .replace(/\/+$/, "") || "/";
  if (route === "/") return "home";
  if (/^\/programs\/[^/]+$/.test(route)) return "program-detail";
  if (route === "/programs") return "programs";
  if (["/contact", "/tryouts", "/sponsors"].includes(route)) return "navy";
  if (route === "/shop") return "shop";
  if (route === "/club/about") return "about";
  if (route === "/club/logo") return "logo";
  if (route === "/roster") return "roster";
  if (route === "/schedule") return "schedule";
  if (/^\/register\/[^/]+(?:\/confirmation)?$/.test(route)) return "registration";
  return "simple";
}
