"use client";

import { useClubContext, useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
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
  teamAbbreviation,
} from "@/lib/standings-content";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { createClient } from "@/lib/admin-client";

type DraftRow = DBLeagueStandingRow & {
  isNew?: boolean;
};

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 font-body text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const statLabelClass =
  "font-display text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground";

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

  // academy@1's real public standings table already renders nothing when
  // there is no real data (no fabricated placeholder rows) — the preview
  // should match that, rather than substituting the generic sample table,
  // which hardcodes "Rose City FC" as its example club regardless of which
  // club is actually being edited.
  const previewRows = normalizeStandingsRows(rows, { fallbackToSample: !isAcademy });

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <div className="mb-4 sm:mb-6">
        <h1
          className="font-display font-black uppercase leading-none text-foreground"
          style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)" }}
        >
          Standings
        </h1>
        <p className="font-body mt-1 text-muted-foreground" style={{ fontSize: "1rem" }}>
          Edit the homepage league table and optional team logos.
        </p>
      </div>

      {loading ? (
        <div
          role="status"
          aria-label="Loading standings"
          className="grid min-w-0 gap-6 xl:grid-cols-[minmax(360px,520px)_minmax(0,1fr)]"
        >
          <section className="min-w-0 self-start rounded-xl border border-border bg-background p-4 sm:p-5">
            <div className="grid gap-3">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>

            <div className="mt-3 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 flex-none rounded-full" />
                    <Skeleton className="h-9 flex-1 rounded-lg" />
                    <Skeleton className="h-9 w-16 flex-none rounded-md" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 sm:grid-cols-7">
                    {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                      <Skeleton key={j} className="h-9 w-full rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Skeleton className="mt-5 h-11 w-full rounded-lg" />
          </section>

          <section className="min-w-0 overflow-hidden rounded-xl border border-border p-4 sm:p-5">
            <Skeleton className="mb-4 h-5 w-1/3" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(360px,520px)_minmax(0,1fr)]">
          <section className="min-w-0 self-start rounded-xl border border-border bg-background p-4 sm:p-5">
            <div className="grid gap-3">
              <label className="font-body text-xs text-muted-foreground">
                Eyebrow
                <input
                  value={settings.eyebrow}
                  onChange={(event) => updateSetting("eyebrow", event.target.value)}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <label className="font-body text-xs text-muted-foreground">
                Table Title
                <input
                  value={settings.title}
                  onChange={(event) => updateSetting("title", event.target.value)}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>
              <label className="font-body text-xs text-muted-foreground">
                Intro
                <Textarea
                  value={settings.intro}
                  onChange={(event) => updateSetting("intro", event.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Teams
              </p>
              <button
                type="button"
                onClick={addRow}
                className="font-display rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground"
              >
                Add Team
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 flex-none overflow-hidden rounded-full bg-muted">
                      {row.logo_url ? (
                        <Image src={row.logo_url} alt="" fill sizes="48px" className="object-contain" />
                      ) : (
                        <span className="font-display grid h-full w-full place-items-center text-xs font-black uppercase text-muted-foreground">
                          {row.team_abbreviation || teamAbbreviation(row.team_name)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        value={row.team_name}
                        onChange={(event) => updateRow(row.id, "team_name", event.target.value)}
                        placeholder="Team name"
                        className={fieldClass}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="font-display rounded-md border border-destructive/45 px-2 py-2 text-xs uppercase text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 sm:grid-cols-7">
                    <label className={statLabelClass}>
                      Abbr
                      <input
                        value={row.team_abbreviation ?? ""}
                        onChange={(event) => updateRow(row.id, "team_abbreviation", event.target.value)}
                        placeholder="ABC"
                        className={`mt-1 ${fieldClass} px-2 py-1.5 text-center font-display font-bold uppercase`}
                      />
                    </label>
                    <NumberField label="GP" value={row.played} onChange={(value) => updateRow(row.id, "played", value)} />
                    <NumberField label="W" value={row.wins} onChange={(value) => updateRow(row.id, "wins", value)} />
                    <NumberField label="D" value={row.draws} onChange={(value) => updateRow(row.id, "draws", value)} />
                    <NumberField label="L" value={row.losses} onChange={(value) => updateRow(row.id, "losses", value)} />
                    <NumberField label="GD" value={row.goal_difference} onChange={(value) => updateRow(row.id, "goal_difference", value)} allowNegative />
                    <NumberField label="Pts" value={row.points} onChange={(value) => updateRow(row.id, "points", value)} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="font-body flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={row.is_club}
                        onChange={(event) => updateRow(row.id, "is_club", event.target.checked)}
                      />
                      Our team&rsquo;s row
                    </label>
                    <button
                      type="button"
                      onClick={() => openLogoUpload(index)}
                      disabled={uploading || row.is_club}
                      className="font-display rounded-md border border-border px-3 py-2 text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/40"
                    >
                      {row.logo_url ? "Replace Logo" : "Upload Logo"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleLogoUpload(event.target.files?.[0] ?? null)}
            />

            {error && (
              <p className="font-body mt-4 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || uploading || !dirty}
              className="font-display mt-5 w-full rounded-lg bg-brand py-3 text-sm font-bold uppercase tracking-widest text-brand-foreground transition-opacity hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {(saving || uploading) && <AdminLoadingDots className="mr-2" />}
              {saving ? "Saving..." : uploading ? "Uploading..." : "Save Standings"}
            </button>
          </section>

          <section className="min-w-0 overflow-hidden rounded-xl border border-border">
            {isAcademy ? (
              previewRows.length > 0 ? (
                <AcademyLeagueStandingsTable settings={settings} rows={previewRows} />
              ) : (
                <p className="font-body p-6 text-sm text-muted-foreground">
                  Add a team below to see a preview of your standings table.
                </p>
              )
            ) : (
              <LeagueStandingsTable settings={settings} rows={previewRows} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Labeled numeric field for the standings stat grid. Deliberately separate
 * from `components/admin/StatInput.tsx` even though both are compact stat
 * inputs: this one carries its own header label, must fill its grid cell
 * (StatInput sizes its width to the digit count), and GD needs negative
 * values (StatInput clamps to >= 0). The visual treatment mirrors
 * StatInput's semantic-token styling so the two read as one family.
 */
function NumberField({
  label,
  value,
  onChange,
  allowNegative = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  allowNegative?: boolean;
}) {
  return (
    <label className={statLabelClass}>
      {label}
      <input
        type="number"
        min={allowNegative ? undefined : 0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-center font-display text-sm font-bold tabular-nums text-foreground outline-none transition-shadow [appearance:textfield] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
