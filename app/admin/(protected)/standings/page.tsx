"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import LeagueStandingsTable from "@/components/LeagueStandingsTable";
import AcademyLeagueStandingsTable from "@/components/AcademyLeagueStandingsTable";
import type {
  DBLeagueStandingRow,
  DBLeagueStandingsSettings,
} from "@/lib/db-types";
import { fetchLeagueStandings } from "@/lib/queries";
import {
  DEFAULT_STANDINGS_SETTINGS,
  normalizeStandingsRows,
  sortStandingsRows,
  teamAbbreviation,
} from "@/lib/standings-content";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { createClient } from "@/lib/admin-client";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
import { cn } from "@/lib/utils";

type DraftRow = DBLeagueStandingRow & {
  isNew?: boolean;
};

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const statLabelClass =
  "font-display text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground";

// Small uppercase eyebrow label used for the "Teams" / "Homepage preview"
// panel headers — matches the tracked-caps convention used across the other
// admin pages (roster, schedule, tryouts, ...).
const eyebrowLabelClass =
  "font-display text-xs font-black uppercase tracking-widest text-muted-foreground";

// Sentence-case panel title used for "Table heading" / "Two rules worth
// knowing" — distinct from the tracked-caps eyebrow above, matching the
// mockup's own distinction between the two label styles.
const panelTitleClass = "font-display text-sm font-bold text-foreground";

function createDraftRow(index: number): DraftRow {
  return {
    id: `draft-${Date.now()}-${index}`,
    team_name: "",
    team_abbreviation: "",
    logo_url: null,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goal_difference: 0,
    points: 0,
    is_club: false,
    sort_order: index,
    created_at: "",
    updated_at: "",
    isNew: true,
  };
}

function isPersistedRow(row: DraftRow): boolean {
  return !row.isNew && !row.id.startsWith("default-") && !row.id.startsWith("draft-");
}

async function uploadStandingLogo(file: File): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "png";
  const path = `teams/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("standings").upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("standings").getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminStandingsPage() {
  const club = useClubContext();
  const clubId = useClubId();
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const isEditorial = club.presentationTemplateKey === "editorial@1";
  const [settings, setSettings] =
    useState<DBLeagueStandingsSettings>(DEFAULT_STANDINGS_SETTINGS);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [originalRows, setOriginalRows] = useState<DBLeagueStandingRow[]>([]);
  const [pendingDeleteUrls, setPendingDeleteUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadIndexRef = useRef<number | null>(null);
  const showFullLoader = useDelayedLoading(loading, 400);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLeagueStandings(clubId)
      .then((content) => {
        setSettings(content.settings);
        setRows(content.rows.map((row) => ({
          ...row,
          isNew: row.id.startsWith("default-"),
        })));
        setOriginalRows(content.rows);
        setPendingDeleteUrls([]);
        setDirty(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load standings");
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function updateSetting(field: "eyebrow" | "title" | "intro", value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
    markDirty();
  }

  function updateRow(
    id: string,
    field: keyof Pick<
      DraftRow,
      | "team_name"
      | "team_abbreviation"
      | "played"
      | "wins"
      | "draws"
      | "losses"
      | "goal_difference"
      | "points"
      | "is_club"
    >,
    value: string | number | boolean,
  ) {
    setRows((current) =>
      current.map((row) => {
        if (field === "is_club" && value === true) {
          return { ...row, is_club: row.id === id };
        }
        return row.id === id ? { ...row, [field]: value } : row;
      }),
    );
    markDirty();
  }

  function addRow() {
    setRows((current) => [...current, createDraftRow(current.length)]);
    markDirty();
  }

  function removeRow(id: string) {
    const row = rows.find((item) => item.id === id);
    if (row?.logo_url) {
      const logoUrl = row.logo_url;
      setPendingDeleteUrls((current) => [...current, logoUrl]);
    }
    setRows((current) => current.filter((item) => item.id !== id));
    markDirty();
  }

  function openLogoUpload(index: number) {
    uploadIndexRef.current = index;
    fileRef.current?.click();
  }

  async function handleLogoUpload(file: File | null) {
    const index = uploadIndexRef.current;
    if (!file || index === null || !rows[index]) return;

    setUploading(true);
    setError(null);
    try {
      const nextUrl = await uploadStandingLogo(file);
      const replacedUrl = rows[index].logo_url;
      if (replacedUrl) {
        setPendingDeleteUrls((current) => [...current, replacedUrl]);
      }
      setRows((current) =>
        current.map((row, rowIndex) =>
          rowIndex === index ? { ...row, logo_url: nextUrl } : row,
        ),
      );
      markDirty();
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      uploadIndexRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeLogo(index: number) {
    const row = rows[index];
    if (!row?.logo_url) return;
    const logoUrl = row.logo_url;
    setPendingDeleteUrls((current) => [...current, logoUrl]);
    setRows((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, logo_url: null } : item,
      ),
    );
    markDirty();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const cleanedSettings = {
        ...settings,
        id: 1,
        eyebrow: settings.eyebrow.trim() || DEFAULT_STANDINGS_SETTINGS.eyebrow,
        title: settings.title.trim() || DEFAULT_STANDINGS_SETTINGS.title,
        intro: settings.intro.trim(),
        updated_at: now,
      };
      const cleanedRows = rows
        .filter((row) => row.team_name.trim())
        .map((row, index) => ({
          id: isPersistedRow(row) ? row.id : null,
          team_name: row.team_name.trim(),
          team_abbreviation:
            row.team_abbreviation?.trim().toUpperCase() ||
            teamAbbreviation(row.team_name),
          logo_url: row.is_club ? null : row.logo_url,
          played: Math.max(0, Number(row.played) || 0),
          wins: Math.max(0, Number(row.wins) || 0),
          draws: Math.max(0, Number(row.draws) || 0),
          losses: Math.max(0, Number(row.losses) || 0),
          goal_difference: Number(row.goal_difference) || 0,
          points: Math.max(0, Number(row.points) || 0),
          is_club: row.is_club,
          sort_order: index,
          updated_at: now,
        }));

      const existingRows = cleanedRows
        .filter((row) => row.id !== null)
        .map((row) => ({
          ...row,
          id: row.id as string,
        }));
      const rowsToInsert = cleanedRows
        .filter((row) => row.id === null)
        .map(({ id, ...row }) => row);

      const originalIds = new Set(
        originalRows
          .filter((row) => !row.id.startsWith("default-"))
          .map((row) => row.id),
      );
      const draftIds = new Set(rows.filter(isPersistedRow).map((row) => row.id));
      const deletedIds = Array.from(originalIds).filter((id) => !draftIds.has(id));

      const { error: settingsError } = await supabase
        .from("league_standings_settings")
        .upsert([cleanedSettings]);
      if (settingsError) throw new Error(settingsError.message);

      if (deletedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("league_standings")
          .delete()
          .in("id", deletedIds);
        if (deleteError) throw new Error(deleteError.message);
      }

      if (existingRows.length > 0) {
        const { error: rowError } = await supabase
          .from("league_standings")
          .upsert(existingRows);
        if (rowError) throw new Error(rowError.message);
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("league_standings")
          .insert(rowsToInsert);
        if (insertError) throw new Error(insertError.message);
      }

      await deleteStorageUrls("standings", pendingDeleteUrls, ["teams/"]);

      const fresh = await fetchLeagueStandings(clubId);
      setSettings(fresh.settings);
      setRows(fresh.rows.map((row) => ({ ...row })));
      setOriginalRows(fresh.rows);
      setPendingDeleteUrls([]);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Display-only rank lookup: sortStandingsRows never mutates its input, and
  // the result here is only used to look up each row's rank by id. The
  // editable `rows` array itself keeps its as-entered order — the public
  // standings components independently call sortStandingsRows before
  // rendering, so the editor's row order must never drive public order.
  const standingsRank = new Map(
    sortStandingsRows(rows).map((row, index) => [row.id, index + 1]),
  );

  // "N teams · M new rows" panel-header copy, mirroring the mockup's
  // "3 teams · 1 new row" text: persisted rows count as teams, rows added
  // via "Add Team" (or not yet saved) count as new rows.
  const persistedTeamCount = rows.filter((row) => !row.isNew).length;
  const newRowCount = rows.length - persistedTeamCount;
  const teamCountText = `${persistedTeamCount} team${persistedTeamCount === 1 ? "" : "s"}${
    newRowCount > 0 ? ` · ${newRowCount} new row${newRowCount === 1 ? "" : "s"}` : ""
  }`;

  // DEFAULT_STANDINGS_ROWS hardcodes "Rose City FC" (plus Ocelot, LA Sol,
  // AMSG, AYSD, Montclair) as its example table, so substituting it for a
  // club with no saved rows shows another club's teams in this club's admin.
  // That is only tolerable for clubhouse@1, whose club *is* Rose City.
  //
  // academy@1's real public standings table renders nothing when there is no
  // real data, so its preview matches by showing the empty state instead.
  // editorial@1's public standings table
  // (components/editorial/EditorialStandingsTable.tsx) reads these same rows
  // and renders nothing when there are none, so it behaves like academy@1
  // here: the empty state is the honest preview until rows are entered.
  const previewRows = normalizeStandingsRows(rows, {
    fallbackToSample: !isAcademy && !isEditorial,
  });

  return (
    <AdminPage className="max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <AdminPageHeader
        title="Standings"
        description="Edit the homepage league table and optional team logos."
        actions={
          <>
            {dirty && (
              <span className="flex items-center gap-2 border-r border-border pr-3 font-body text-xs font-medium text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-none rounded-full bg-warning"
                />
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || uploading || !dirty}
              className="font-display rounded-lg bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-opacity hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(saving || uploading) && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving..." : uploading ? "Uploading..." : "Save Standings"}
            </button>
          </>
        }
      />

      {error && (
        <p
          role="alert"
          className="font-body rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {loading ? (
        showFullLoader ? (
          <AdminFullPageLoader label="Loading standings" />
        ) : (
          <div className="flex flex-col gap-6" role="status" aria-label="Loading standings">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        )
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <AdminPanel className="overflow-hidden p-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-4">
              <h2 className={panelTitleClass}>Table heading</h2>
              <p className="font-body text-xs text-muted-foreground">
                Shown above the table on your homepage
              </p>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-3">
              <label className="block">
                <span className={ADMIN_LABEL_CLASS}>Eyebrow</span>
                <input
                  value={settings.eyebrow}
                  onChange={(event) => updateSetting("eyebrow", event.target.value)}
                  className={ADMIN_INPUT_CLASS}
                />
              </label>
              <label className="block">
                <span className={ADMIN_LABEL_CLASS}>Table Title</span>
                <input
                  value={settings.title}
                  onChange={(event) => updateSetting("title", event.target.value)}
                  className={ADMIN_INPUT_CLASS}
                />
              </label>
              <label className="block">
                <span className={ADMIN_LABEL_CLASS}>Intro</span>
                <Textarea
                  value={settings.intro}
                  onChange={(event) => updateSetting("intro", event.target.value)}
                  rows={2}
                />
              </label>
            </div>
          </AdminPanel>

          {/* One row per team; header labels each field once. The rank
              column is a display-only lookup into `standingsRank` (built
              from sortStandingsRows above) — it never reorders `rows`
              itself, so this editable list stays in as-entered order. */}
          <AdminPanel className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
              <h2 className={eyebrowLabelClass}>Teams</h2>
              <p className="font-body text-xs text-muted-foreground">{teamCountText}</p>
              <button
                type="button"
                onClick={addRow}
                className="font-display ml-auto rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Add Team
              </button>
            </div>

            {/* [contain:paint] is load-bearing, not decorative: this table's
                per-column fixed-width `<th>` cells give it a genuine
                min-content width past 900px, and at narrow viewports this
                wrapper's `overflow-x-auto` clips it correctly on screen (and
                its own scrollWidth/clientWidth report the clip is working)
                but Chromium still lets the table's intrinsic width leak past
                every flex ancestor's `min-w-0` and widen the document/layout
                viewport itself (window.innerWidth included) rather than just
                this box. `contain: paint` forces this box to be treated as
                the true clipping boundary, which stops that leak; plain
                `overflow-x-auto`/`overflow-hidden`/`overflow-x-clip` on this
                div or `min-w-0` on it were all verified live NOT to fix it. */}
            <div className="overflow-x-auto [contain:paint]">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th scope="col" className={`w-10 px-2 py-2 text-center ${statLabelClass}`}>
                      #
                    </th>
                    <th scope="col" className={`w-14 px-2 py-2 ${statLabelClass}`}>
                      Logo
                    </th>
                    <th scope="col" className={`min-w-[200px] px-2 py-2 ${statLabelClass}`}>
                      Team name
                    </th>
                    <th scope="col" className={`w-20 px-1 py-2 text-center ${statLabelClass}`}>
                      Abbr
                    </th>
                    <th scope="col" className={`w-14 px-1 py-2 text-center ${statLabelClass}`}>
                      GP
                    </th>
                    <th scope="col" className={`w-14 px-1 py-2 text-center ${statLabelClass}`}>
                      W
                    </th>
                    <th scope="col" className={`w-14 px-1 py-2 text-center ${statLabelClass}`}>
                      D
                    </th>
                    <th scope="col" className={`w-14 px-1 py-2 text-center ${statLabelClass}`}>
                      L
                    </th>
                    <th scope="col" className={`w-16 px-1 py-2 text-center ${statLabelClass}`}>
                      GD
                    </th>
                    <th scope="col" className={`w-16 px-1 py-2 text-center ${statLabelClass}`}>
                      Pts
                    </th>
                    <th scope="col" className="w-44 px-2 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border align-top transition-colors last:border-b-0 hover:bg-accent/30",
                        row.is_club && "border-l-4 border-l-primary bg-primary/5",
                      )}
                    >
                      <td className="px-2 py-3 text-center font-display text-xs font-bold tabular-nums text-muted-foreground">
                        {standingsRank.get(row.id) ?? "–"}
                      </td>
                      <td className="px-2 py-3">
                        <div className="relative h-10 w-10 flex-none overflow-hidden rounded-full bg-muted">
                          {row.logo_url ? (
                            <Image src={row.logo_url} alt="" fill sizes="40px" className="object-contain" />
                          ) : (
                            <span className="font-display grid h-full w-full place-items-center text-[0.6rem] font-black uppercase text-muted-foreground">
                              {row.team_abbreviation || teamAbbreviation(row.team_name)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="min-w-[200px] px-2 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={row.team_name}
                            onChange={(event) => updateRow(row.id, "team_name", event.target.value)}
                            placeholder="Team name"
                            aria-label="Team name"
                            className={fieldClass}
                          />
                          {row.is_club && (
                            <span className="flex-none rounded-full bg-primary/10 px-2.5 py-1 font-display text-[0.6rem] font-bold uppercase tracking-wider text-primary">
                              Our row
                            </span>
                          )}
                        </div>
                        <label className="mt-2 flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={row.is_club}
                            onChange={(event) => updateRow(row.id, "is_club", event.target.checked)}
                          />
                          Our team&rsquo;s row
                        </label>
                      </td>
                      <td className="px-1 py-3">
                        <input
                          value={row.team_abbreviation ?? ""}
                          onChange={(event) => updateRow(row.id, "team_abbreviation", event.target.value)}
                          placeholder="ABC"
                          aria-label="Team abbreviation"
                          className={`${fieldClass} px-2 py-1.5 text-center font-display font-bold uppercase`}
                        />
                      </td>
                      <td className="px-1 py-3">
                        <TableNumberField
                          ariaLabel="Games played"
                          value={row.played}
                          onChange={(value) => updateRow(row.id, "played", value)}
                        />
                      </td>
                      <td className="px-1 py-3">
                        <TableNumberField
                          ariaLabel="Wins"
                          value={row.wins}
                          onChange={(value) => updateRow(row.id, "wins", value)}
                        />
                      </td>
                      <td className="px-1 py-3">
                        <TableNumberField
                          ariaLabel="Draws"
                          value={row.draws}
                          onChange={(value) => updateRow(row.id, "draws", value)}
                        />
                      </td>
                      <td className="px-1 py-3">
                        <TableNumberField
                          ariaLabel="Losses"
                          value={row.losses}
                          onChange={(value) => updateRow(row.id, "losses", value)}
                        />
                      </td>
                      <td className="px-1 py-3">
                        <TableNumberField
                          ariaLabel="Goal difference"
                          value={row.goal_difference}
                          onChange={(value) => updateRow(row.id, "goal_difference", value)}
                          allowNegative
                        />
                      </td>
                      <td className="px-1 py-3">
                        <TableNumberField
                          ariaLabel="Points"
                          value={row.points}
                          onChange={(value) => updateRow(row.id, "points", value)}
                          emphasize
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-col items-end gap-1.5">
                          {row.is_club ? (
                            <span className="font-display rounded-md border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground/50">
                              Logo locked
                            </span>
                          ) : (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openLogoUpload(index)}
                                disabled={uploading}
                                className="font-display rounded-md border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/40"
                              >
                                {row.logo_url ? "Replace Logo" : "Upload Logo"}
                              </button>
                              {row.logo_url && (
                                <button
                                  type="button"
                                  onClick={() => removeLogo(index)}
                                  disabled={uploading}
                                  className="font-display rounded-md border border-destructive/45 px-3 py-2 text-xs uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground/40 disabled:hover:bg-transparent"
                                >
                                  Remove Logo
                                </button>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="font-display rounded-md px-3 py-2 text-xs uppercase tracking-widest text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            Remove team
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleLogoUpload(event.target.files?.[0] ?? null)}
            />
          </AdminPanel>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <AdminPanel className="overflow-hidden p-0">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className={eyebrowLabelClass}>Homepage preview</h2>
              </div>
              <div className="p-5">
                {/* previewRows is only ever empty for the templates excluded
                    from the sample fallback above (academy@1, editorial@1);
                    templates that still get DEFAULT_STANDINGS_ROWS always
                    take a table branch, exactly as before. */}
                {previewRows.length === 0 ? (
                  <p className="font-body text-sm text-muted-foreground">
                    Add a team above to see a preview of your standings table.
                  </p>
                ) : isAcademy ? (
                  <AcademyLeagueStandingsTable settings={settings} rows={previewRows} />
                ) : (
                  <LeagueStandingsTable settings={settings} rows={previewRows} />
                )}
              </div>
            </AdminPanel>

            <AdminPanel className="flex flex-col gap-2.5 p-4 sm:p-5">
              <h2 className={panelTitleClass}>Two rules worth knowing</h2>
              <p className="font-body text-xs leading-relaxed text-muted-foreground">
                Your own row uses the club crest, so its logo controls are locked.
              </p>
              <p className="font-body text-xs leading-relaxed text-muted-foreground">
                The public table ranks itself: points, then goal difference, then wins. Row
                order here does not change it.
              </p>
            </AdminPanel>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

/**
 * Bare numeric input for a standings table cell. Deliberately separate from
 * `components/admin/StatInput.tsx` even though both are compact stat inputs:
 * GD needs negative values (StatInput clamps to >= 0), and this one carries
 * no inline label — the table header labels each column once, and an
 * `aria-label` keeps the field named for assistive tech. The visual
 * treatment mirrors StatInput's semantic-token styling so the two read as
 * one family. `emphasize` mirrors the mockup's highlighted Pts box.
 */
function TableNumberField({
  ariaLabel,
  value,
  onChange,
  allowNegative = false,
  emphasize = false,
}: {
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
  allowNegative?: boolean;
  emphasize?: boolean;
}) {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      min={allowNegative ? undefined : 0}
      value={value}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        onChange(Number(event.target.value))
      }
      className={cn(
        "w-full rounded-lg border border-input bg-background px-2 py-1.5 text-center font-display text-sm font-bold tabular-nums text-foreground outline-none transition-shadow [appearance:textfield] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        emphasize && "border-primary/50 ring-2 ring-primary/15",
      )}
    />
  );
}
