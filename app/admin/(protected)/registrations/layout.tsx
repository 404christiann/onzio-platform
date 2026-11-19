import { notFoundIfAdminRouteHidden } from "@/lib/admin-hidden-route";

export const dynamic = "force-dynamic";

// Rose City outsources tryouts, so its admin hides Registrations: 404 for this page and any page under it.
// Nothing here touches the registration API routes, data or public pages.
export default async function RegistrationsLayout({ children }: { children: React.ReactNode }) {
  await notFoundIfAdminRouteHidden("registrations");
  return children;
}
