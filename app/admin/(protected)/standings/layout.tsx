import { notFoundIfAdminRouteHidden } from "@/lib/admin-hidden-route";

export const dynamic = "force-dynamic";

// Rose City's public site never shows standings, so its admin hides Standings: 404 for this page and any page under it.
// The standings code, data and Diverse City's page are untouched.
export default async function StandingsLayout({ children }: { children: React.ReactNode }) {
  await notFoundIfAdminRouteHidden("standings");
  return children;
}
