import { redirect } from "next/navigation";

/** Keep bookmarked Season Stats links pointing at the matching combined view. */
export default function SeasonStatsPage() {
  redirect("/admin/stats?view=season");
}
