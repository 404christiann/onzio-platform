import type { ClubContext } from "@/lib/club-context";

export type CodeSiteId = "diverse-city";

export function codeSiteFor(
  club: Pick<ClubContext, "presentationTemplateKey">,
): CodeSiteId | null {
  return club.presentationTemplateKey === "academy@1" ? "diverse-city" : null;
}
