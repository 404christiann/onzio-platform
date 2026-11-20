"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubTimeZone } from "@/components/ClubTimeZoneProvider";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import CinematicSchedule, { type CinematicScheduleData } from "./CinematicSchedule";

/** Server-fetched result for the first paint, with the server clock so "Next" matches between server and browser. */
export type CinematicScheduleInitial = { data: CinematicScheduleData | null; failed: boolean; nowIso: string };

export default function CinematicSchedulePage({ initial }: { initial?: CinematicScheduleInitial }) {
  const { id: clubId } = useClubContext();
  const timeZone = useClubTimeZone();
  const [retry, setRetry] = useState(0);
  const seeded = useRef(initial ? clubId : null);
  const initialNow = useMemo(() => initial ? new Date(initial.nowIso) : undefined, [initial]);
  const [state, setState] = useState<{ clubId: string; data: CinematicScheduleData | null; failed: boolean }>({ clubId, data: initial?.data ?? null, failed: initial?.failed ?? false });
  useEffect(() => {
    if (retry === 0 && seeded.current === clubId) return;
    let active = true;
    setState({ clubId, data: null, failed: false });
    void fetchActiveSeason(clubId).then(async season => {
      const fixtures = season ? await fetchSchedule(season.id, clubId) : [];
      if (active) setState({ clubId, data: { fixtures, seasonLabel: season?.label ?? "Current", timeZone }, failed: false });
    }).catch(() => { if (active) setState({ clubId, data: null, failed: true }); });
    return () => { active = false; };
  }, [clubId, retry, timeZone]);
  const current = state.clubId === clubId ? state : null;
  if (!current?.data) return <div className="cinematic-schedule"><div className="schedule-state">
    <p role={current?.failed ? "alert" : "status"}>{current?.failed ? "The schedule is temporarily unavailable." : "Loading fixtures…"}</p>
    {current?.failed && <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>}
  </div></div>;
  return <CinematicSchedule key={`${clubId}-${current.data.seasonLabel}`} schedule={current.data} initialNow={initialNow} />;
}
