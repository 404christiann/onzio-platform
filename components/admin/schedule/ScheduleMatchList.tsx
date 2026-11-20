"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import OpponentCrest from "@/components/OpponentCrest";
import { Button } from "@/components/ui/button";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { cn } from "@/lib/utils";
import { emptyForm, formatRowDate, formatTime12h, hasResult, MAX_MATCH_SCORE, type Match } from "./schedule-model";
import styles from "./ScheduleMatchList.module.css";

type Props = {
  groups: Array<[string, Match[]]>;
  clubName: string;
  today: string;
  showSponsors: boolean;
  flashedId: string | null;
  onEdit: (match: Match) => void;
  onResultFocusFallback: () => void;
  onSaveResult: (match: Match, home: number, away: number) => Promise<void>;
};

type QuickResult = { id: string; home: string; away: string; error: string | null; saving: boolean };

export function ScheduleMatchList({ groups, clubName, today, showSponsors, flashedId, onEdit, onSaveResult, onResultFocusFallback }: Props) {
  const [quick, setQuick] = useState<QuickResult | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const resultBusy = useRef(false);
  const missing = (match: Match) => match.date < today && !hasResult(match);

  function focusResult(id: string) {
    requestAnimationFrame(() => {
      const target = host.current?.querySelector<HTMLElement>(`[data-result-for="${CSS.escape(id)}"]`);
      if (target) target.focus();
      else onResultFocusFallback();
    });
  }

  async function saveResult(match: Match) {
    if (!quick || quick.id !== match.id || resultBusy.current) return false;
    const home = Number(quick.home);
    const away = Number(quick.away);
    if (quick.home.trim() === "" || quick.away.trim() === "" || ![home, away].every((score) => Number.isInteger(score) && score >= 0 && score <= MAX_MATCH_SCORE)) {
      setQuick({ ...quick, error: "Enter both scores, using whole numbers from 0 to 99." });
      return false;
    }
    resultBusy.current = true;
    setQuick({ ...quick, saving: true, error: null });
    try {
      await onSaveResult(match, home, away);
      const next = groups.flatMap(([, matches]) => matches).find((row) => row.id !== match.id && missing(row));
      setQuick(null);
      focusResult(next?.id ?? match.id);
      return true;
    } catch (error) {
      setQuick({ ...quick, saving: false, error: error instanceof Error ? error.message : "The result could not be saved. Try again." });
      return false;
    } finally { resultBusy.current = false; }
  }

  const requestNavigation = useUnsavedGuard({
    dirty: quick !== null && (quick.home !== "" || quick.away !== ""),
    edited: "a match result",
    onSave: async () => {
      const match = groups.flatMap(([, matches]) => matches).find((row) => row.id === quick?.id);
      return match ? saveResult(match) : false;
    },
    onDiscard: () => setQuick(null),
  });

  return (
    <div ref={host} className={styles.list} data-admin-schedule-list="">
      {groups.map(([month, matches]) => (
        <section key={month} className={styles.group} aria-label={month}>
          <header className={styles.groupHeader}><h2>{month}</h2><span>{matches.length} {matches.length === 1 ? "match" : "matches"}</span></header>
          <div className={styles.groupBody}>
            {matches.map((match) => {
              const outcome = hasResult(match) ? match.rose_city_score! > match.opponent_score! ? "W" : match.rose_city_score! < match.opponent_score! ? "L" : "D" : null;
              return (
                <div key={match.id} className={cn(styles.row, flashedId === match.id && styles.flash)} data-match-id={match.id}>
                  <div className={styles.date}><strong>{formatRowDate(match.date)}</strong><span>{formatTime12h(match.time)}</span></div>
                  <div className={styles.crest}><OpponentCrest name={match.opponent} logoUrl={match.opponent_logo_url} size={34} /></div>
                  <div className={styles.opponent}>
                    <div className={styles.name}><strong title={match.opponent}>{match.home ? "vs" : "@"} {match.opponent}</strong><span className={cn(styles.pill, match.home && styles.home)}>{match.home ? "Home" : "Away"}</span></div>
                    {match.competition && <p title={match.competition}>{match.competition}</p>}
                    {showSponsors && match.sponsor_logo_url && <p>Presented by {match.sponsor_name || "match sponsor"}</p>}
                  </div>
                  <div className={styles.result}>
                    {outcome ? (
                      <span tabIndex={-1} data-result-for={match.id} className={styles.score} data-outcome={outcome}>
                        <b>{outcome}</b><span aria-hidden="true">{match.rose_city_score} – {match.opponent_score}</span>
                        <span className="sr-only">Result: {clubName} {match.rose_city_score} - {match.opponent_score} {match.opponent}</span>
                      </span>
                    ) : missing(match) ? quick?.id === match.id ? (
                      <form className={styles.quick} aria-label={`Result against ${match.opponent}`} onSubmit={(event) => { event.preventDefault(); void saveResult(match); }} onKeyDown={(event) => {
                        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!quick.saving) { setQuick(null); focusResult(match.id); } }
                      }}>
                        <div className={styles.quickFields}>
                          <input autoFocus type="number" min={0} max={99} step={1} inputMode="numeric" aria-label={`${clubName} score against ${match.opponent}`} aria-invalid={Boolean(quick.error)} value={String(quick.home)} disabled={quick.saving}
                            onChange={(event) => setQuick({ ...quick, home: event.target.value, error: null })} />
                          <span aria-hidden="true">–</span>
                          <input type="number" min={0} max={99} step={1} inputMode="numeric" aria-label={`${match.opponent} score`} aria-invalid={Boolean(quick.error)} value={String(quick.away)} disabled={quick.saving}
                            onChange={(event) => setQuick({ ...quick, away: event.target.value, error: null })} />
                          <AdminPendingButton type="submit" pending={quick.saving} label="Save" pendingLabel="Saving…" size="sm" />
                        </div>
                        {quick.error && <p role="alert">{quick.error}</p>}
                      </form>
                    ) : <Button variant="outline" className="min-h-9 border-warning/50 px-3 text-warning-ink" data-result-for={match.id} onClick={() => requestNavigation({ kind: "switch", label: "another result", continue: () => setQuick({ id: match.id, home: "", away: "", error: null, saving: false }) })}>Add result</Button>
                    : <span className="text-xs text-muted-foreground">Upcoming</span>}
                  </div>
                  <p className={styles.venue} title={[match.venue, match.city, match.state, match.address].filter(Boolean).join(", ")}>{[match.venue, match.city, match.state].filter(Boolean).join(", ")}{match.address ? ` · ${match.address}` : ""}</p>
                  <Button variant="ghost" size="icon" className={styles.edit} aria-label={`Edit match against ${match.opponent}`} onClick={() => requestNavigation({ kind: "switch", label: "the match editor", continue: () => onEdit(match) })} disabled={quick?.saving}><Pencil size={17} /></Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ScheduleListSkeleton({ groups, showSponsors }: { groups?: Array<[string, Match[]]>; showSponsors: boolean }) {
  if (groups?.length === 0) return <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 py-10"><Shimmer className="h-5 w-36" /><Shimmer className="h-4 w-64 max-w-full" /></div>;
  const shape: Array<[string, Match[]]> = groups ?? [["Schedule", [{ ...emptyForm(), id: "loading", date: "2020-04-01", time: "10:00", opponent: "Opponent club", venue: "Local field", competition: "Competition" }]]];
  return <div className={styles.list} aria-hidden="true" data-schedule-skeleton="">{shape.map(([month, matches]) => (
    <div key={month} className={styles.group}>
      <div className={styles.groupHeader}><h2><Shimmer>{month}</Shimmer></h2><span><Shimmer>{matches.length} {matches.length === 1 ? "match" : "matches"}</Shimmer></span></div>
      <div className={styles.groupBody}>{matches.map((match) => (
        <div key={match.id} className={styles.row}>
          <div className={styles.date}><strong><Shimmer>{formatRowDate(match.date)}</Shimmer></strong><span><Shimmer>{formatTime12h(match.time)}</Shimmer></span></div>
          <Shimmer className={cn(styles.crest, "size-[34px] rounded-full")} />
          <div className={styles.opponent}>
            <div className={styles.name}><strong><Shimmer>{match.home ? "vs" : "@"} {match.opponent}</Shimmer></strong><span className={styles.pill}><Shimmer>{match.home ? "Home" : "Away"}</Shimmer></span></div>
            {match.competition && <p><Shimmer>{match.competition}</Shimmer></p>}
            {showSponsors && match.sponsor_logo_url && <p><Shimmer>Presented by {match.sponsor_name || "match sponsor"}</Shimmer></p>}
          </div>
          <div className={styles.result}><Shimmer className="h-9 w-24" /></div>
          <p className={styles.venue}><Shimmer>{[match.venue, match.city, match.state].filter(Boolean).join(", ")}{match.address ? ` · ${match.address}` : ""}</Shimmer></p>
          <Shimmer className={cn(styles.edit, "size-9")} />
        </div>
      ))}</div>
    </div>
  ))}</div>;
}
