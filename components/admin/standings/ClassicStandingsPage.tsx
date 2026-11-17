"use client";

import { useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { AdminDialog, AdminDialogFooter, AdminDialogSection } from "@/components/admin/ui/AdminDialog";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { Button } from "@/components/ui/button";
import { GRAPHIC_UPLOAD_MIME_TYPES } from "@/lib/media-upload-types";
import { LEAGUE_TEAM_NAME_LIMIT } from "@/lib/admin-data-contract";
import { newStandingRow, type StandingDraftRow } from "@/lib/admin-standings-draft";
import { normalizeStandingsRows, sortStandingsRows, teamAbbreviation } from "@/lib/standings-content";
import LeagueStandingsTable from "@/components/LeagueStandingsTable";
import AcademyLeagueStandingsTable from "@/components/sites/diverse-city/AcademyStandingsTable";
import { StandingNumberField } from "./StandingNumberField";
import { useStandingsEditor } from "./useStandingsEditor";
import styles from "./standings.module.css";

type TeamEdit = { session: symbol; row: StandingDraftRow; initial: StandingDraftRow; added: boolean; uploaded: string[] };
type Confirmation = "page" | "team" | "remove" | null;
const numbers = [
  ["played", "Games played", "GP"], ["wins", "Wins", "W"], ["draws", "Draws", "D"],
  ["losses", "Losses", "L"], ["goal_difference", "Goal difference", "GD"], ["points", "Points", "Pts"],
] as const;

function Crest({ row }: { row: StandingDraftRow }) {
  return <span className={styles.crest}>{row.logo_url
    ? <Image src={row.logo_url} alt="" fill sizes="32px" className="object-contain" />
    : <span>{row.team_abbreviation || teamAbbreviation(row.team_name)}</span>}</span>;
}

function StandingsSkeleton() {
  return <div className={styles.loadedLayout} data-standings-skeleton="">
    <div className={styles.season}><Shimmer className={styles.skeletonLabel} /><Shimmer className={styles.skeletonSelect} /></div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>#</th><th>Team</th>{numbers.map(([key,,short]) => <th key={key} className={["wins","draws","losses"].includes(key) ? styles.phoneHidden : undefined}>{short}</th>)}<th><span className="sr-only">Edit</span></th></tr></thead>
      <tbody>{Array.from({ length: 6 }, (_, i) => <tr key={i}><td><Shimmer className={styles.skeletonNumber} /></td><td><span className={styles.team}><Shimmer className={styles.crest} /><Shimmer className={styles.skeletonName} /></span></td>{numbers.map(([key]) => <td key={key} className={["wins","draws","losses"].includes(key) ? styles.phoneHidden : undefined}><Shimmer className={styles.skeletonNumber} /></td>)}<td><Shimmer className={styles.skeletonEdit} /></td></tr>)}</tbody></table></div>
  </div>;
}

export default function ClassicStandingsPage() {
  const club = useClubContext();
  const policy = codeSiteAdminFor(club)?.standings;
  const model = useStandingsEditor(club.id);
  const [edit, setEdit] = useState<TeamEdit | null>(null);
  const editor = useRef(edit);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [closing, setClosing] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const teamName = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const editorChanged = !!edit && JSON.stringify(edit.row) !== JSON.stringify(edit.initial);
  const busy = model.saveState === "saving" || model.mediaPending || closing;
  const unavailable = model.loading || model.loadFailed;
  const autoSeason = model.seasons.find((season) => season.id === model.seasonId)?.standings_from_scores === true;
  const latest = useRef({ model, edit, busy, closing });
  latest.current = { model, edit, busy, closing };

  function setEditor(value: TeamEdit | null) { editor.current = value; setEdit(value); }
  function updateRow(update: Partial<StandingDraftRow>) {
    const value = editor.current;
    if (value) setEditor({ ...value, row: { ...value.row, ...update } });
  }
  function openTeam(row?: StandingDraftRow) {
    if (unavailable || busy || latest.current.model.isWorking()) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : addButton.current;
    const value = row ?? newStandingRow(model.draft.rows.length);
    setEditor({ session: Symbol(), row: structuredClone(value), initial: structuredClone(value), added: !row, uploaded: [] });
  }
  function applyTeam(fromGuard = false) {
    const value = editor.current;
    if (!value || latest.current.model.mediaPending || latest.current.model.isWorking() ||
      latest.current.closing || (!fromGuard && latest.current.busy) || !form.current?.reportValidity()) return false;
    const previous = latest.current.model.current.current.rows.find((row) => row.id === value.row.id);
    if (previous?.logo_url !== value.row.logo_url) latest.current.model.retainLogo(previous?.logo_url ?? null);
    latest.current.model.change((draft) => ({
      ...draft,
      rows: value.added ? [...draft.rows, value.row] : draft.rows.map((row) => row.id === value.row.id ? value.row : row),
    }));
    if (value.row.is_club) latest.current.model.change((draft) => ({
      ...draft, rows: draft.rows.map((row) => ({ ...row, is_club: row.id === value.row.id })),
    }));
    for (const url of value.uploaded) if (url !== value.row.logo_url) latest.current.model.retainLogo(url);
    setEditor(null);
    return true;
  }
  async function closeTeam() {
    if (busy || latest.current.model.isWorking() || !editor.current) return;
    setClosing(true);
    try {
      await model.releaseLogos(editor.current.uploaded);
      setEditor(null);
      setConfirmation(null);
    } catch (failure) { model.setError(failure instanceof Error ? failure.message : "The unused logo could not be removed."); }
    finally { setClosing(false); }
  }
  function requestCloseTeam() {
    if (busy || latest.current.model.isWorking()) return;
    if (editorChanged || edit?.added) setConfirmation("team");
    else void closeTeam();
  }
  async function guardSave() {
    const value = latest.current;
    if (value.closing || value.model.mediaPending || value.model.isWorking() || value.model.loading || value.model.loadFailed) return false;
    if (value.model.pending) {
      const saved = await value.model.saveGuardCurrent();
      return saved && editor.current === null;
    }
    if (editor.current && !applyTeam(true)) return false;
    return latest.current.model.saveGuardCurrent();
  }
  async function guardDiscard() {
    const value = latest.current;
    if (value.busy || value.model.isWorking() || !value.model.canDiscard) throw new Error("Wait for the last save and logo upload to finish.");
    if (editor.current) await value.model.releaseLogos(editor.current.uploaded);
    await value.model.discard();
    setEditor(null);
  }
  const guardLatest = useRef({ save: guardSave, discard: guardDiscard });
  guardLatest.current = { save: guardSave, discard: guardDiscard };
  const requestNavigation = useUnsavedGuard({
    dirty: model.isDirty || editorChanged || !!edit?.added || model.mediaPending || busy,
    edited: "the standings table",
    onSave: () => guardLatest.current.save(),
    onDiscard: () => guardLatest.current.discard(),
  });

  const ranked = sortStandingsRows(model.draft.rows);
  const previewRows = normalizeStandingsRows(model.draft.rows, { fallbackToSample: policy?.useSampleFallback ?? true });
  return <AdminPage className={styles.page}>
    <AdminPageHeader title="Standings" breadcrumb="Competition › Standings"
      description="The league table on your homepage. Teams rank by points, then goal difference, then wins."
      actions={<>
        {model.isDirty && <button type="button" className={styles.headerButton} disabled={!model.canDiscard} onClick={() => setConfirmation("page")}>Discard</button>}
        <button ref={addButton} type="button" className={styles.headerButton} disabled={unavailable || busy} onClick={() => openTeam()}>Add a team</button>
        <AdminSaveButton state={model.saveState === "saving" ? "saving" : model.mediaPending || unavailable ? "clean" : model.saveState} onSave={() => void model.saveCurrent()} />
      </>} />
    {model.error && <p role="alert" className={styles.error}>{model.error}</p>}
    {model.loadFailed && <Button type="button" variant="outline" className={styles.retry} disabled={model.loading || model.saveState === "saving"} onClick={() => void model.retry()}>{model.loading ? "Loading…" : "Retry loading"}</Button>}
    {model.pending && !model.loadFailed && model.saveState !== "saving" && <p className={styles.note} role="status">The last submitted version still needs to finish. Save changes retries that version first; newer edits stay unsaved.</p>}
    <ShimmerRegion loading={model.loading} minHeight={0} loadingLabel="Loading standings" skeleton={<StandingsSkeleton />}>
      {!model.loadFailed && <div className={styles.loadedLayout}>
        {model.seasons.length > 0 && <div className={styles.season} data-testid="standings-season">
          <label htmlFor="standings-season-select">Season</label>
          <select id="standings-season-select" value={model.seasonId ?? ""} disabled={busy || model.seasons.length < 2} onChange={(event) => {
            const id = event.target.value;
            requestNavigation({ kind: "switch", label: model.seasons.find((item) => item.id === id)?.label ?? "another season", continue: () => { void latest.current.model.switchSeason(id); }, opener: event.currentTarget });
          }}>{model.seasons.map((season) => <option key={season.id} value={season.id}>{season.label}{season.active ? " · on your website" : ""}</option>)}</select>
        </div>}
        {autoSeason && model.draft.rows.some((row) => row.is_club) && <p className={styles.note} data-testid="standings-auto-note">Your team’s games, wins, draws, losses, goal difference and points come from the scores you save, so they can’t be typed here.</p>}
        <div className={styles.tableWrap}><table className={styles.table}>
          <caption className="sr-only">Teams ranked by points, goal difference and wins</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Team</th>{numbers.map(([key,label,short]) => <th key={key} scope="col" className={["wins","draws","losses"].includes(key) ? styles.phoneHidden : undefined}><abbr title={label}>{short}</abbr></th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{ranked.map((row,index) => <tr key={row.id} data-our-team={row.is_club || undefined}>
            <td>{index + 1}</td><th scope="row"><span className={styles.team}><Crest row={row} /><span className={styles.teamName}>{row.team_name || "New team"}{row.is_club && <small>Our team</small>}</span></span></th>
            {numbers.map(([key]) => <td key={key} className={["wins","draws","losses"].includes(key) ? styles.phoneHidden : key === "points" ? styles.points : undefined}>{row[key]}</td>)}
            <td><button type="button" className={styles.editButton} aria-label={"Edit " + (row.team_name || "new team")} disabled={busy} onClick={() => openTeam(row)}>Edit</button></td>
          </tr>)}</tbody>
        </table>{!ranked.length && <div className={styles.empty}><h2>No teams yet</h2><p>Add a team to build this season’s league table.</p><Button type="button" variant="outline" disabled={busy} onClick={() => openTeam()}>Add a team</Button></div>}</div>
        <p className={styles.note}>Ranked the way the public table is: points, then goal difference, then wins.</p>
        <section className={styles.headingPanel}><h2>Table heading</h2><p>Shown above the table on your homepage.</p><div className={styles.headingFields}>
          {(["eyebrow","title","intro"] as const).map((field) => <div key={field} className={styles.field}><label htmlFor={"standings-" + field}>{field === "eyebrow" ? "Eyebrow" : field === "title" ? "Table title" : "Intro"}</label>
            {field === "intro" ? <textarea id={"standings-" + field} rows={2} value={model.draft.settings[field]} onChange={(event) => model.change((draft) => ({ ...draft, settings: { ...draft.settings, [field]: event.target.value } }))} /> : <input id={"standings-" + field} aria-describedby={field === "title" ? "standings-title-help" : undefined} value={model.draft.settings[field]} onChange={(event) => model.change((draft) => ({ ...draft, settings: { ...draft.settings, [field]: event.target.value } }))} />}
            {field === "title" && <small id="standings-title-help">Leave it blank to show no title.</small>}
          </div>)}
        </div></section>
        <section className={styles.preview}><h2>Homepage preview</h2><div data-admin-public-preview>{previewRows.length === 0 ? <p>Add a team above to see a preview of your standings table.</p> : policy?.preview === "academy-table" ? <AcademyLeagueStandingsTable settings={model.draft.settings} rows={previewRows} /> : <LeagueStandingsTable settings={model.draft.settings} rows={previewRows} />}</div></section>
      </div>}
    </ShimmerRegion>
    <AdminDialog open={edit !== null} onClose={requestCloseTeam} size="sm" title={edit?.row.team_name || "New team"} eyebrow={edit?.row.is_club ? "Our team" : "Team"} busy={busy} initialFocus={teamName} finalFocus={opener}
      footer={<AdminDialogFooter primary={<Button type="button" className="min-h-11" disabled={busy} onClick={() => applyTeam()}>Apply</Button>}
        destructive={!edit?.added && <Button type="button" variant="outline" className="min-h-11 text-destructive" disabled={busy} onClick={() => setConfirmation("remove")}>Remove team</Button>}>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={requestCloseTeam}>Cancel</Button>
      </AdminDialogFooter>}>
      {edit && <form ref={form} onSubmit={(event) => { event.preventDefault(); applyTeam(); }}>
        {model.error && <p role="alert" className={styles.error}>{model.error}</p>}
        <AdminDialogSection title="Team"><div className={styles.dialogFields}>
          <label className={styles.field}><span>Team name</span><input ref={teamName} required maxLength={LEAGUE_TEAM_NAME_LIMIT} value={edit.row.team_name} onChange={(event) => updateRow({ team_name: event.target.value })} /></label>
          <label className={styles.field}><span>Short name</span><input value={edit.row.team_abbreviation ?? ""} onChange={(event) => updateRow({ team_abbreviation: event.target.value })} /></label>
          <label className={styles.checkbox}><input type="checkbox" checked={edit.row.is_club} disabled={busy} onChange={(event) => { if (!latest.current.busy && !latest.current.model.isWorking()) updateRow({ is_club: event.target.checked }); }} />Our team’s row</label>
          {edit.row.is_club ? <p className={styles.note}>Uses your club crest. Logo controls are locked.</p> : <AdminImageField label="Team logo" previewUrl={edit.row.logo_url} initials={edit.row.team_abbreviation || teamAbbreviation(edit.row.team_name)} size={64} allowedTypes={GRAPHIC_UPLOAD_MIME_TYPES} maxBytes={5 * 1024 * 1024}
            onPendingChange={model.pendingMedia}
            onUpload={async (files) => {
              const session = editor.current;
              if (!session) return false;
              try {
                const url = await model.upload(files[0]);
                const current = editor.current;
                if (current?.session !== session.session) { await model.releaseLogos([url]); return false; }
                setEditor({ ...current, uploaded: [...current.uploaded, url], row: { ...current.row, logo_url: url } });
                return true;
              } catch (failure) { model.setError(failure instanceof Error ? failure.message : "Logo upload failed."); return false; }
            }}
            onRemove={() => updateRow({ logo_url: null })} />}
        </div></AdminDialogSection>
        <AdminDialogSection title="Numbers">
          {autoSeason && edit.row.is_club && <p className={styles.note}>These numbers come from the scores you save.</p>}
          <div className={styles.numbers}>{numbers.map(([key,label]) => <StandingNumberField key={key} label={label} value={edit.row[key]} allowNegative={key === "goal_difference"} readOnly={autoSeason && edit.row.is_club} onChange={(value) => updateRow({ [key]: value })} />)}</div>
        </AdminDialogSection>
      </form>}
    </AdminDialog>
    <AdminConfirmDialog open={confirmation !== null} title={confirmation === "remove" ? "Remove this team?" : confirmation === "team" ? "Discard team changes?" : "Discard standings changes?"}
      confirmLabel={confirmation === "remove" ? "Remove team" : "Discard changes"} destructive busy={closing} finalFocus={confirmation === "page" ? addButton : undefined}
      onCancel={() => setConfirmation(null)} onConfirm={() => {
        if (confirmation === "team") { void closeTeam(); return; }
        if (confirmation === "remove" && edit) {
          const row = model.current.current.rows.find((item) => item.id === edit.row.id);
          model.retainLogo(row?.logo_url ?? null);
          model.change((draft) => ({ ...draft, rows: draft.rows.filter((item) => item.id !== edit.row.id) }));
          opener.current = addButton.current;
          void closeTeam();
          return;
        }
        setClosing(true);
        void model.discard().then(() => setConfirmation(null)).catch((failure: unknown) => model.setError(failure instanceof Error ? failure.message : "Changes could not be discarded.")).finally(() => setClosing(false));
      }}>
      {confirmation === "remove" ? "This removes the team from your draft table. Save changes to update your website." : "Your unapplied changes will be lost."}
    </AdminConfirmDialog>
  </AdminPage>;
}
