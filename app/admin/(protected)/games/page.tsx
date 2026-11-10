import { IconSchedule, IconStandings } from "@/components/admin/icons";
import { TabPage, type TabButton } from "@/components/admin/reimagined/TabPage";
import { getVisibleAdminHomeJobs } from "@/lib/admin-route-manifest";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { gamesTabStatus, getAdminTab, getAdminTabPages } from "@/lib/admin-tabs";

// ADMIN-RE-24: the Games tab (design: admin-plain-search-two-clubs.html).
// Whether a score is missing, Enter a score and Add a game, then the season's
// pages. Only in the reimagined admin; a classic club is sent to /admin.

export const dynamic = "force-dynamic";

export default async function GamesTabPage() {
  const { access, home } = await loadAdminTabPage("games");
  const jobs = getVisibleAdminHomeJobs(access);
  const buttons: TabButton[] = jobs.flatMap((job): TabButton[] =>
    job.id === "enter-score"
      ? [{ label: job.label, href: job.href, icon: IconStandings, kind: "primary" }]
      : job.id === "add-game"
        ? [{ label: job.label, href: job.href, icon: IconSchedule, kind: "secondary" }]
        : [],
  );
  return (
    <TabPage
      tab="games"
      title={getAdminTab("games").title}
      pill={gamesTabStatus(home.gamesNeedingScore)}
      buttons={buttons}
      pages={getAdminTabPages("games", access)}
    />
  );
}
