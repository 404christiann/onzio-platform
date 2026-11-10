import { InsightsWaiting } from "@/components/admin/reimagined/InsightsWaiting";
import { TabPage } from "@/components/admin/reimagined/TabPage";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { getAdminTab } from "@/lib/admin-tabs";
import { PUBLIC_SITE_HOLD_SLUGS } from "@/lib/public-site-hold";

// ADMIN-RE-24: the Insights tab, for a club with the Sponsor Insights add-on
// (admin_flags.sponsor_insights; decisions 2 and 4 of 2026-11-09). While the
// club's website is held it says so instead of showing zeros, and lists what it
// will show. The full dashboard and the monthly report are a later design step;
// until the app counts visits, a live club sees the same list with a plain
// "no numbers yet" line.

export const dynamic = "force-dynamic";

export default async function InsightsTabPage() {
  const { club } = await loadAdminTabPage("insights");
  return (
    <TabPage
      tab="insights"
      title={getAdminTab("insights").title}
      subtitle="Who visits your website, and which sponsors they see."
    >
      <InsightsWaiting held={PUBLIC_SITE_HOLD_SLUGS.has(club.slug)} />
    </TabPage>
  );
}
