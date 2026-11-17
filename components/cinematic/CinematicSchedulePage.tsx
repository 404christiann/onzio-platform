"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import CinematicSchedule, { type CinematicScheduleData } from "./CinematicSchedule";

export default function CinematicSchedulePage() {
  const { id: clubId } = useClubContext();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ clubId: string; data: CinematicScheduleData | null; failed: boolean }>({ clubId, data: null, failed: false });
  useEffect(() => {
    let active = true;
    setState({ clubId, data: null, failed: false });
    void Promise.all([fetchActiveSeason(clubId), fetchClubIdentity(clubId)]).then(async ([season, identity]) => {
      const fixtures = season ? await fetchSchedule(season.id, clubId) : [];
      if (active) setState({ clubId, data: { fixtures, seasonLabel: season?.label ?? "Current", timeZone: identity?.timeZone || "UTC" }, failed: false });
    }).catch(() => { if (active) setState({ clubId, data: null, failed: true }); });
    return () => { active = false; };
  }, [clubId, retry]);
  const current = state.clubId === clubId ? state : null;
  if (!current?.data) return <div className="cinematic-schedule"><div className="schedule-state">
    <p role={current?.failed ? "alert" : "status"}>{current?.failed ? "The schedule is temporarily unavailable." : "Loading fixtures…"}</p>
    {current?.failed && <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>}
  </div></div>;
  return <CinematicSchedule key={`${clubId}-${current.data.seasonLabel}`} schedule={current.data} />;
}
