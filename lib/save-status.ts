import { PUBLIC_SITE_HOLD_SLUGS } from "@/lib/public-site-hold";
export type WebsiteState = "live" | "paused";
export function websiteState(club: { slug: string; publicAccess: "preview" | "live" | "grace" | "suspended" }): WebsiteState {
  if (PUBLIC_SITE_HOLD_SLUGS.has(club.slug)) return "paused";
  return club.publicAccess === "live" || club.publicAccess === "grace" ? "live" : "paused";
}
export function savedLabel(state: WebsiteState, verb: "Saved" | "Added" = "Saved"): string {
  return state === "live" ? `${verb} · on your website` : `${verb} · your website is paused`;
}
