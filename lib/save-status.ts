export type WebsiteState = "live" | "paused";
export function websiteState(club: { slug: string; publicAccess: "preview" | "live" | "grace" | "suspended" }): WebsiteState {
  return club.publicAccess === "live" || club.publicAccess === "grace" ? "live" : "paused";
}
export function savedLabel(state: WebsiteState, verb: "Saved" | "Added" = "Saved"): string {
  return state === "live" ? `${verb} · on your website` : `${verb} · your website is paused`;
}
