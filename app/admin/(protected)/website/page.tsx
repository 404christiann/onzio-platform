import { IconEdit, IconExternalLink } from "@/components/admin/icons";
import { WebsiteNumbers } from "@/components/admin/reimagined/Glance";
import { TabPage, type TabButton } from "@/components/admin/reimagined/TabPage";
import { getVisibleAdminHomeJobs } from "@/lib/admin-route-manifest";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { getAdminTab, getAdminTabPages, getVisibleAdminTabs, websiteTabStatus } from "@/lib/admin-tabs";
import { PUBLIC_SITE_HOLD_SLUGS } from "@/lib/public-site-hold";
import { websiteState } from "@/lib/save-status";

// ADMIN-RE-24: the Website tab (design: admin-plain-search-two-clubs.html).
// Whether the website is live, Edit my website and View website, then every
// page of the website the club has.

export const dynamic = "force-dynamic";

export default async function WebsiteTabPage() {
  const { access, club } = await loadAdminTabPage("website");
  const edit = getVisibleAdminHomeJobs(access).find((job) => job.id === "edit-website");
  const buttons: TabButton[] = [
    ...(edit ? [{ label: edit.label, href: edit.href, icon: IconEdit, kind: "primary" as const }] : []),
    {
      label: "View website",
      href: "/",
      icon: IconExternalLink,
      kind: edit ? "secondary" : "primary",
      external: true,
      testId: "admin-view-website",
    },
  ];
  const state = PUBLIC_SITE_HOLD_SLUGS.has(club.slug) ? "held" : websiteState(club);
  return (
    <TabPage
      tab="website"
      title={getAdminTab("website").title}
      pill={websiteTabStatus(state)}
      buttons={buttons}
      pages={getAdminTabPages("website", access)}
    >
      {/* ADMIN-RE-24b: clubs with Sponsor Insights see their numbers on its own tab. */}
      {getVisibleAdminTabs(access).some((tab) => tab.id === "insights") ? null : <WebsiteNumbers held={state === "held"} />}
    </TabPage>
  );
}
