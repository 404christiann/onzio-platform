export const ABOUT_CONTENT_DESTINATIONS = [
  "/", "/roster", "/schedule", "/club/about", "/club/logo", "/shop",
  "/sponsors", "/staff", "/standings", "/stats", "/tryouts", "/programs", "/contact",
] as const;

export type AboutContentDestination = typeof ABOUT_CONTENT_DESTINATIONS[number];

export function isAboutContentDestination(value: unknown): value is AboutContentDestination {
  return typeof value === "string" && ABOUT_CONTENT_DESTINATIONS.some(href => href === value);
}
