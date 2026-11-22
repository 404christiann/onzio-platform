import { CampaignLinkBuilder } from "@/components/admin/reimagined/CampaignLinkBuilder";
import { InsightsDashboard } from "@/components/admin/reimagined/InsightsDashboard";
import { InsightsWaiting } from "@/components/admin/reimagined/InsightsWaiting";
import { TabPage } from "@/components/admin/reimagined/TabPage";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { getAdminTab } from "@/lib/admin-tabs";
import { PUBLIC_SITE_HOLD_SLUGS } from "@/lib/public-site-hold";
import { loadInsightsData } from "@/lib/telemetry/insights-data";
import { parseInsightsRange } from "@/lib/telemetry/insights-math";
import frame from "@/components/admin/reimagined/frame.module.css";
import styles from "@/components/admin/reimagined/insights.module.css";

// ADMIN-RE-24 + TELEMETRY-04: the Insights tab, for a club with the Sponsor
// Insights add-on (admin_flags.sponsor_insights; decisions 2 and 4 of
// 2026-11-09). While the club's website is held it says so instead of showing
// zeros, and the numbers are not read at all. Otherwise the dashboard shows the
// club's page rollups (user-scoped read, never the service role), or the same
// "no numbers yet" list until the first rollup exists. The campaign link
// builder sits under the numbers; the monthly sponsor report fills its slot in
// TELEMETRY-05.

export const dynamic = "force-dynamic";

export default async function InsightsTabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, club, portal } = await loadAdminTabPage("insights");
  const held = PUBLIC_SITE_HOLD_SLUGS.has(club.slug);
  const result = held
    ? null
    : await loadInsightsData(supabase, {
        clubId: club.id,
        timeZone: portal.timeZone,
        range: parseInsightsRange((await searchParams).range),
      });

  return (
    <TabPage
      tab="insights"
      title={getAdminTab("insights").title}
      subtitle="Who visits your website, and which sponsors they see."
    >
      {result === null ? (
        <InsightsWaiting held />
      ) : result.status === "no-rollups" ? (
        <InsightsWaiting held={false} />
      ) : result.status === "error" ? (
        <p role="alert" className={`${frame.card} ${frame.empty} ${frame.wide}`}>
          Your numbers could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <div className={`${frame.wide} ${styles.dashboard}`}>
          <InsightsDashboard data={result} timeZone={portal.timeZone} />
          <CampaignLinkBuilder host={club.primaryDomain} paths={result.sitePaths} />
          <section
            aria-labelledby="insights-monthly-report-heading"
            className={frame.wide}
            data-testid="insights-monthly-report-slot"
          >
            {/* TELEMETRY-05: the monthly sponsor report fills this slot. */}
            <div className={`${frame.card} ${styles.slot}`}>
              <b id="insights-monthly-report-heading">Monthly sponsor report</b>
              <small>Coming soon: a one-page report per sponsor to send each month.</small>
            </div>
          </section>
        </div>
      )}
    </TabPage>
  );
}
