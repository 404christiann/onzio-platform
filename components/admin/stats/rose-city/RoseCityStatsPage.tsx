"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SeasonSelect from "@/components/admin/SeasonSelect";
import { EditorNotice, EditorSecondaryButton } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import lists from "@/components/admin/list-cards/ListEditor.module.css";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { PageFrame, derivePageSaveState } from "@/components/admin/ui/editor-kit";
import type { SaveState } from "@/components/admin/ui/useSaveState";
import { useSeasons } from "@/lib/use-seasons";
import type { StatsView } from "../types";
import type { StatsFailure } from "./stats-model";
import { RoseCityMatchStats } from "./RoseCityMatchStats";
import { RoseCitySeasonStats } from "./RoseCitySeasonStats";
import type { RoseCityStatsControls, RoseCityStatsViewProps } from "./types";
import styles from "./rose-city-stats.module.css";

const VIEWS: { id: StatsView; label: string }[] = [
  { id: "match", label: "Match stats" },
  { id: "season", label: "Season totals" },
];

/**
 * Rose City's Stats page on the editor kit: one header with Save, a Season picker, two views of read-only
 * tables, and a dialog per player. The page Save publishes; the dialog's Apply only changes the draft.
 * The URL is the classic page's: /admin/stats?view=match|season.
 */
export function RoseCityStatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: StatsView = searchParams.get("view") === "season" ? "season" : "match";
  const seasonState = useSeasons();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [failure, setFailure] = useState<StatsFailure | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [switching, startTransition] = useTransition();
  const controls = useRef<RoseCityStatsControls>(null);
  const tabs = useRef(new Map<StatsView, HTMLButtonElement>());
  const requestedView = useRef<StatsView | null>(null);
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

  const viewProps: RoseCityStatsViewProps = {
    seasonState, selectedMatchId, onSelectedMatchChange: setSelectedMatchId,
    onViewChange: changeView, controlsRef: controls, onSavingChange: setSaving, onSaveStateChange: setSaveState, onFailureChange: setFailure,
  };
  const pageState = derivePageSaveState(saveState, failure && saveState !== "clean" ? failure.kind : null);

  const notice = failure ? <div className={lists.notice} data-stats-notice={failure.kind}>
    <EditorNotice failed>{failure.message}
      <span className={lists.noticeActions}>
        {failure.kind === "error" && <button type="button" className={`admin-press ${lists.keep}`} disabled={saving} onClick={() => controls.current?.save()}>Try again</button>}
        {failure.kind === "conflict" && <>
          <button ref={keepRef} type="button" className={`admin-press ${lists.keep}`} disabled={saving} onClick={() => controls.current?.loadLatest(true)}>Load latest and keep my edits</button>
          <EditorSecondaryButton disabled={saving} onClick={() => controls.current?.loadLatest(false)}>Reload saved numbers</EditorSecondaryButton>
        </>}
      </span>
    </EditorNotice>
  </div> : null;

  return <>
    <PageFrame title="Stats" breadcrumb={[{ label: "Competition" }]} description="Enter one match’s stats, or adjust the season’s totals."
      state={pageState} onSave={() => controls.current?.save()} onRetry={() => controls.current?.save()} onConflict={() => keepRef.current?.focus()}
      onDiscard={() => setConfirmDiscard(true)} notice={notice}>
      <div className="flex min-w-0 flex-col gap-6">
        <div className={styles.bar}>
          <SeasonSelect seasons={seasonState.seasons} loading={seasonState.loading} value={seasonState.selectedSeasonId}
            onChange={id => controls.current?.changeSeason(id)} label="Season" disabled={saving || switching || seasonState.loading} />
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Stats view">
          {VIEWS.map((item, index) => <button key={item.id} type="button" role="tab"
            ref={node => { if (node) tabs.current.set(item.id, node); else tabs.current.delete(item.id); }}
            id={`stats-tab-${item.id}`} aria-controls={`stats-panel-${item.id}`} aria-selected={view === item.id}
            tabIndex={view === item.id ? 0 : -1} disabled={saving || switching}
            onClick={() => requestView(item.id)} onKeyDown={event => handleTabKey(event, index)}>{item.label}</button>)}
        </div>
        {VIEWS.map(item => <div key={item.id} id={`stats-panel-${item.id}`} role="tabpanel" aria-labelledby={`stats-tab-${item.id}`} hidden={view !== item.id} className={styles.panel}>
          {view === item.id && <fieldset disabled={switching} aria-busy={switching} className={styles.boundary}>
            {view === "match" ? <RoseCityMatchStats {...viewProps} /> : <RoseCitySeasonStats {...viewProps} />}
          </fieldset>}
        </div>)}
      </div>
    </PageFrame>
    <AdminConfirmDialog open={confirmDiscard} title="Discard your edits?" confirmLabel="Discard changes" destructive
      onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); controls.current?.discard(); }}>
      Your unsaved edits on this page will be discarded and the saved numbers shown again.
    </AdminConfirmDialog>
  </>;
}
