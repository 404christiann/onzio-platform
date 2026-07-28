"use client";

import { useClubId } from "@/components/ClubContextProvider";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import LeagueStandingsTable from "@/components/LeagueStandingsTable";
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

const inputStyle = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.45rem",
  color: "white",
  padding: "0.62rem 0.7rem",
  fontSize: "0.86rem",
  outline: "none",
};

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
  const clubId = useClubId();
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

  const previewRows = normalizeStandingsRows(rows);

  return (
    <div className="mx-auto min-w-0 max-w-7xl overflow-hidden">
      <AdminSaveFeedback saving={saving} saved={saved} />
      <div className="mb-4 sm:mb-6">
        <h1
          className="font-display font-black uppercase leading-none text-white"
          style={{ fontSize: "clamp(2rem, 10vw, 2.75rem)" }}
        >
          Standings
        </h1>
        <p className="font-body mt-1" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}>
          Edit the homepage league table and optional team logos.
        </p>
      </div>

      {loading ? (
        <p className="font-display text-sm uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading...
        </p>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(360px,520px)_minmax(0,1fr)]">
          <section
            className="min-w-0 self-start rounded-xl p-4 sm:p-5"
            style={{
              backgroundColor: "#141414",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="grid gap-3">
              <label className="font-body text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                Eyebrow
                <input
                  value={settings.eyebrow}
                  onChange={(event) => updateSetting("eyebrow", event.target.value)}
                  style={inputStyle}
                  className="mt-1"
                />
              </label>
              <label className="font-body text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                Table Title
                <input
                  value={settings.title}
                  onChange={(event) => updateSetting("title", event.target.value)}
                  style={inputStyle}
                  className="mt-1"
                />
              </label>
              <label className="font-body text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                Intro
                <textarea
                  value={settings.intro}
                  onChange={(event) => updateSetting("intro", event.target.value)}
                  rows={3}
                  style={inputStyle}
                  className="mt-1 resize-y"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="font-display text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                Teams
              </p>
              <button
                type="button"
                onClick={addRow}
                className="font-display rounded-md px-3 py-2 text-xs font-bold uppercase tracking-widest"
                style={{ backgroundColor: "#FFFFFF", color: "#141414" }}
              >
                Add Team
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-lg p-3"
                  style={{ border: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 flex-none overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                      {row.logo_url ? (
                        <Image src={row.logo_url} alt="" fill sizes="48px" className="object-contain" />
                      ) : (
                        <span className="font-display grid h-full w-full place-items-center text-xs font-black uppercase" style={{ color: "#E7001B" }}>
                          {row.team_abbreviation || teamAbbreviation(row.team_name)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        value={row.team_name}
                        onChange={(event) => updateRow(row.id, "team_name", event.target.value)}
                        placeholder="Team name"
                        style={inputStyle}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="font-display rounded-md px-2 py-2 text-xs uppercase"
                      style={{ color: "#E7001B", border: "1px solid rgba(231,0,27,0.45)" }}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-7">
                    <input aria-label="Abbreviation" value={row.team_abbreviation ?? ""} onChange={(event) => updateRow(row.id, "team_abbreviation", event.target.value)} placeholder="Abbr" style={inputStyle} />
                    <NumberField label="GP" value={row.played} onChange={(value) => updateRow(row.id, "played", value)} />
                    <NumberField label="W" value={row.wins} onChange={(value) => updateRow(row.id, "wins", value)} />
                    <NumberField label="D" value={row.draws} onChange={(value) => updateRow(row.id, "draws", value)} />
                    <NumberField label="L" value={row.losses} onChange={(value) => updateRow(row.id, "losses", value)} />
                    <NumberField label="GD" value={row.goal_difference} onChange={(value) => updateRow(row.id, "goal_difference", value)} allowNegative />
                    <NumberField label="Pts" value={row.points} onChange={(value) => updateRow(row.id, "points", value)} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="font-body flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                      <input
                        type="checkbox"
                        checked={row.is_club}
                        onChange={(event) => updateRow(row.id, "is_club", event.target.checked)}
                      />
                      Rose City row
                    </label>
                    <button
                      type="button"
                      onClick={() => openLogoUpload(index)}
                      disabled={uploading || row.is_club}
                      className="font-display rounded-md px-3 py-2 text-xs uppercase tracking-widest"
                      style={{
                        color: row.is_club ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        cursor: row.is_club ? "not-allowed" : "pointer",
                      }}
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
              <p className="font-body mt-4 text-sm" style={{ color: "#E7001B" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || uploading || !dirty}
              className="font-display mt-5 w-full rounded-lg py-3 text-sm font-bold uppercase tracking-widest transition-opacity"
              style={{
                backgroundColor: "#E7001B",
                color: "white",
                opacity: saving || uploading || !dirty ? 0.5 : 1,
                cursor: saving || uploading || !dirty ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : uploading ? "Uploading..." : "Save Standings"}
            </button>
          </section>

          <section className="min-w-0 overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <LeagueStandingsTable settings={settings} rows={previewRows} />
          </section>
        </div>
      )}
    </div>
  );
}

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
    <label className="font-body text-[0.62rem] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>
      {label}
      <input
        type="number"
        min={allowNegative ? undefined : 0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={inputStyle}
        className="mt-1"
      />
    </label>
  );
}
