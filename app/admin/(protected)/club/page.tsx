import { TabPage } from "@/components/admin/reimagined/TabPage";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { getAdminTab, getAdminTabPages } from "@/lib/admin-tabs";

// ADMIN-RE-24: the Club tab (design: admin-plain-search-two-clubs.html). Your
// club, who can sign in, payments and plan; owner-only pages follow the
// manifest's owner and billing rules.

export const dynamic = "force-dynamic";

export default async function ClubTabPage() {
  const { access } = await loadAdminTabPage("club");
  return <TabPage tab="club" title={getAdminTab("club").title} pages={getAdminTabPages("club", access)} />;
}
