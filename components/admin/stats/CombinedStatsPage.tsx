"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { useSeasons } from "@/lib/use-seasons";
import { MatchStatsEditor } from "./MatchStatsEditor";
import { SeasonStatsEditor } from "./SeasonStatsEditor";
import type { StatsEditorControls, StatsEditorProps, StatsView } from "./types";
import styles from "./stats-workspace.module.css";

const VIEWS: { id: StatsView; label: string }[] = [
  { id: "match", label: "Match stats" },
  { id: "season", label: "Season stats" },
];

export function CombinedStatsPage() {
  const club = useClubContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: StatsView = searchParams.get("view") === "season" ? "season" : "match";
  const seasonState = useSeasons();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerDetail, setShowPlayerDetail] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [switching, startTransition] = useTransition();
  const controls = useRef<StatsEditorControls>(null);
  const tabs = useRef(new Map<StatsView, HTMLButtonElement>());
  const requestedView = useRef<StatsView | null>(null);
  const isEditorialTemplate = club.presentationTemplateKey === "editorial@1";

  useEffect(() => {
    if (isEditorialTemplate) router.replace("/admin");
  }, [isEditorialTemplate, router]);

  useEffect(() => {
    if (switching || requestedView.current !== view) return;
    tabs.current.get(view)?.focus({ preventScroll: true });
    requestedView.current = null;
  }, [view, switching]);

  function changeView(next: StatsView) {
    if (next === view) return;
    requestedView.current = next;
    const query = new URLSearchParams(searchParams.toString());
    query.set("view", next);
    startTransition(() => router.replace(`/admin/stats?${query.toString()}`, { scroll: false }));
  }

  function requestView(next: StatsView) {
    if (next !== view && !saving && !switching) controls.current?.changeView();
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: StatsView | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = VIEWS[1 - index].id;
    else if (event.key === "Home") next = "match";
    else if (event.key === "End") next = "season";
    if (!next || saving || switching) return;
    event.preventDefault();
    tabs.current.get(next)?.focus();
    requestView(next);
  }

  const editorProps: StatsEditorProps = {
    seasonState, selectedPlayerId, onSelectedPlayerChange: setSelectedPlayerId,
    showPlayerDetail, onShowPlayerDetailChange: setShowPlayerDetail,
    selectedMatchId, onSelectedMatchChange: setSelectedMatchId,
    onViewChange: changeView, controlsRef: controls, onSavingChange: setSaving,
  };
  if (isEditorialTemplate) return null;

  return <AdminPage className="max-w-6xl">
    <AdminPageHeader title="Stats" description="Choose one match or enter the season’s totals."
      actions={<SeasonSelect seasons={seasonState.seasons} loading={seasonState.loading}
        value={seasonState.selectedSeasonId} onChange={id => controls.current?.changeSeason(id)}
        label="Season" disabled={saving || switching || seasonState.loading} className={styles.seasonPicker} />} />
    <div className={styles.viewTabs} role="tablist" aria-label="Stats view">
      {VIEWS.map((item, index) => <button key={item.id} type="button" role="tab"
        ref={node => { if (node) tabs.current.set(item.id, node); else tabs.current.delete(item.id); }}
        id={`stats-tab-${item.id}`} aria-controls={`stats-panel-${item.id}`} aria-selected={view === item.id}
        tabIndex={view === item.id ? 0 : -1} disabled={saving || switching}
        onClick={() => requestView(item.id)} onKeyDown={event => handleTabKey(event, index)}>{item.label}</button>)}
    </div>
    {VIEWS.map(item => <div key={item.id} id={`stats-panel-${item.id}`} role="tabpanel"
      aria-labelledby={`stats-tab-${item.id}`} hidden={view !== item.id} className={styles.viewPanel}>
      {view === item.id && <>
        <div className={styles.viewIntro}>
          <h2>{view === "match" ? "Match stats" : "Season totals"}</h2>
          <p>{view === "match" ? "Statistics for one game. Choose a match below, then a player." : "Totals for the whole season. Enter these separately from match stats."}</p>
        </div>
        <fieldset disabled={switching} aria-busy={switching} className={styles.editorBoundary}>
          {view === "match" ? <MatchStatsEditor {...editorProps} /> : <SeasonStatsEditor {...editorProps} />}
        </fieldset>
      </>}
    </div>)}
  </AdminPage>;
}
