/** New homepage destinations. Existing tenant pages keep their own handlers. */
export const CINEMATIC_PLACEHOLDER_ROUTES: Readonly<Record<string, string>> = {
  "/tickets": "tickets",
  "/stadium": "stadium",
  "/stadium/parking": "stadium-parking",
  "/stadium/guidelines": "stadium-guidelines",
  "/stadium/chick-fil-a": "chick-fil-a",
  "/stadium/know-before-you": "know-before-you",
  "/stadium/fan-code": "fan-code",
  "/stadium/foothill-transit": "foothill-transit",
  "/stadium/media-credentials": "media-credentials",
  "/news": "news-page",
  "/news/injury-report": "injury-report",
  "/community/partnership": "partnership",
  "/community/national-anthem": "national-anthem",
};

export function cinematicPlaceholderLabelId(templateKey: string | null, path: string): string | null {
  return templateKey === "cinematic@2" ? CINEMATIC_PLACEHOLDER_ROUTES[path] ?? null : null;
}
