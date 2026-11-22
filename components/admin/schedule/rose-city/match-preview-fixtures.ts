import { scheduleDisplay } from "@/lib/cinematic-schedule";
import type { Fixture } from "@/lib/data";

/**
 * The fixtures a match's preview feeds the public Schedule. Next is passed along so the row looks as it will on the
 * site. The public page lists upcoming matches only up to Next, so a later one would render nothing and leave its
 * card blank; that match is previewed on its own instead, and `listed` says it is not on the site yet (the preview shows it as it will look once it is Next).
 */
export function matchPreviewFixtures(own: Fixture, next: Fixture | null, timeZone: string, now = new Date()): { fixtures: Fixture[]; listed: boolean } {
  if (!next || next.id === own.id) return { fixtures: [own], listed: true };
  const withNext = [next, own];
  const listed = scheduleDisplay(withNext, now, timeZone).list.some(item => item.fixture === own);
  return { fixtures: listed ? withNext : [own], listed };
}
