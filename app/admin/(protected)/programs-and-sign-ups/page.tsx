import { IconSeasonStats, IconTryouts } from "@/components/admin/icons";
import { TabPage, type TabButton } from "@/components/admin/reimagined/TabPage";
import { getVisibleAdminHomeJobs, getVisibleAdminRoutes } from "@/lib/admin-route-manifest";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { getAdminTab, getAdminTabPages, signUpsTabStatus } from "@/lib/admin-tabs";

// ADMIN-RE-24: the Programs tab, for clubs whose website has programs or
// tryouts (design: admin-plain-search-two-clubs.html, Diverse City). New
// sign-ups this week, See sign-ups and the tryouts page, then programs,
// tryouts, the roster and the sign-up forms.

export const dynamic = "force-dynamic";

export default async function ProgramsTabPage() {
  const { access, home } = await loadAdminTabPage("programs");
  const buttons: TabButton[] = [];
  const signUps = getVisibleAdminHomeJobs(access).find((job) => job.id === "see-registrations");
  if (signUps) buttons.push({ label: "See sign-ups", href: signUps.href, icon: IconSeasonStats, kind: "primary" });
  const tryouts = getVisibleAdminRoutes(access).find((route) => route.id === "tryouts");
  if (tryouts && access.canMutateContent) {
    buttons.push({ label: "Add a tryout", href: tryouts.href, icon: IconTryouts, kind: signUps ? "secondary" : "primary" });
  }
  return (
    <TabPage
      tab="programs"
      title={getAdminTab("programs").title}
      pill={signUpsTabStatus(home.newSignUps)}
      buttons={buttons}
      pages={getAdminTabPages("programs", access)}
    />
  );
}
