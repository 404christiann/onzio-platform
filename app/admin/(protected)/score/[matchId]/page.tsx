import { redirectRetiredAdminRoute } from "@/lib/retired-admin-route";

// Retired reimagined-admin address: a classic club goes on to the match stats view, as before.
export const dynamic = "force-dynamic";

export default async function RetiredAdminPage(): Promise<never> {
  return redirectRetiredAdminRoute("/admin/stats?view=match");
}
