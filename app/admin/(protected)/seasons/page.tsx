"use client";

import { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import type { DBSeason } from "@/lib/db-types";
import { createClient } from "@/lib/admin-client";
import { cn } from "@/lib/utils";

type SeasonDeleteState = { deletable: boolean; reason: string };

function rowHasNonZeroStats(row: Record<string, unknown>): boolean {
  return Object.entries(row).some(([key, value]) =>
    key !== "player_id" && key !== "season_id" && Number(value ?? 0) !== 0
  );
}

async function getSeasonDeleteState(
  supabase: ReturnType<typeof createClient>,
  seasonId: string,
): Promise<SeasonDeleteState> {
  const [matchesResult, fieldResult, gkResult] = await Promise.all([
    supabase.from("matches").select("id").eq("season_id", seasonId).limit(1),
    supabase.from("player_season_stats")
      .select("player_id, season_id, goals, assists, tackles, offsides, fouls, fouls_suffered, starts, yellow, red, mins")
      .eq("season_id", seasonId),
    supabase.from("goalkeeper_season_stats")
      .select("player_id, season_id, goals_against, saves, clean_sheets, starts, yellow, red, mins")
      .eq("season_id", seasonId),
  ]);

  const queryError = matchesResult.error ?? fieldResult.error ?? gkResult.error;
  if (queryError) throw new Error(queryError.message);
  if ((matchesResult.data ?? []).length > 0) {
    return { deletable: false, reason: "This season has matches and cannot be deleted." };
  }
  if (((fieldResult.data ?? []) as Record<string, unknown>[]).some(rowHasNonZeroStats)) {
    return { deletable: false, reason: "This season has field player stats and cannot be deleted." };
  }
  if (((gkResult.data ?? []) as Record<string, unknown>[]).some(rowHasNonZeroStats)) {
    return { deletable: false, reason: "This season has goalkeeper stats and cannot be deleted." };
  }
  return { deletable: true, reason: "No matches or recorded stats. This season can be deleted." };
}

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<DBSeason[]>([]);
  const [deleteStates, setDeleteStates] = useState<Record<string, SeasonDeleteState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error: seasonsError } = await supabase
      .from("seasons")
      .select("*")
      .order("start_year", { ascending: false });

    if (seasonsError) {
      setError(seasonsError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as DBSeason[];
    setSeasons(rows);
    try {
      const states = await Promise.all(
        rows.map(async (season) => [season.id, await getSeasonDeleteState(supabase, season.id)] as const)
      );
      setDeleteStates(Object.fromEntries(states));
    } catch (guardError) {
      setError(guardError instanceof Error ? guardError.message : "Failed to check season usage");
      setDeleteStates({});
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSetActive(seasonId: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Deactivate all first; this order is required by the single-active partial unique index.
    const { error: deactivateError } = await supabase
      .from("seasons")
      .update({ active: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (deactivateError) {
      setError(deactivateError.message);
      setSaving(false);
      return;
    }

    const { error: activateError } = await supabase
      .from("seasons")
      .update({ active: true })
      .eq("id", seasonId);
    if (activateError) {
      setError(activateError.message);
      setSaving(false);
      return;
    }

    await load();
    flash();
    setSaving(false);
  }

  async function handleCreateNextSeason() {
    if (seasons.length === 0) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const latest = seasons[0];
    const nextStart = latest.start_year + 1;
    const nextEnd = latest.end_year + 1;
    const nextLabel = `${nextStart}–${String(nextEnd).slice(2)}`;

    const { data: newSeason, error: seasonError } = await supabase
      .from("seasons")
      .insert([{ label: nextLabel, start_year: nextStart, end_year: nextEnd, active: false }])
      .select()
      .single();
    if (seasonError || !newSeason) {
      setError(seasonError?.message ?? "Failed to create season");
      setSaving(false);
      return;
    }

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, position")
      .eq("active", true);
    if (playersError) {
      setError(`Season created, but players could not be loaded for stat seeding: ${playersError.message}`);
      await load();
      setSaving(false);
      return;
    }

    const fieldPlayers = (players ?? []).filter((player: { id: string; position: string }) => player.position !== "Goalkeeper");
    const goalkeepers = (players ?? []).filter((player: { id: string; position: string }) => player.position === "Goalkeeper");
    const [fieldSeedResult, goalkeeperSeedResult] = await Promise.all([
      fieldPlayers.length > 0
        ? supabase.from("player_season_stats").insert(fieldPlayers.map((player: { id: string }) => ({
            player_id: player.id,
            season_id: newSeason.id,
            goals: 0, assists: 0, tackles: 0, starts: 0,
            yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0,
          })))
        : Promise.resolve({ error: null }),
      goalkeepers.length > 0
        ? supabase.from("goalkeeper_season_stats").insert(goalkeepers.map((player: { id: string }) => ({
            player_id: player.id,
            season_id: newSeason.id,
            goals_against: 0, saves: 0, clean_sheets: 0,
            starts: 0, yellow: 0, red: 0, mins: 0,
          })))
        : Promise.resolve({ error: null }),
    ]);

    const seedError = fieldSeedResult.error ?? goalkeeperSeedResult.error;
    if (seedError) {
      setError(`Season created, but some player stats were not seeded: ${seedError.message}`);
    } else {
      flash();
    }
    await load();
    setSaving(false);
  }

  async function handleDelete(seasonId: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      const guard = await getSeasonDeleteState(supabase, seasonId);
      if (!guard.deletable) {
        setError(guard.reason);
        return;
      }

      const { error: fieldDeleteError } = await supabase.from("player_season_stats").delete().eq("season_id", seasonId);
      if (fieldDeleteError) throw new Error(fieldDeleteError.message);
      const { error: goalkeeperDeleteError } = await supabase.from("goalkeeper_season_stats").delete().eq("season_id", seasonId);
      if (goalkeeperDeleteError) throw new Error(goalkeeperDeleteError.message);
      const { error: seasonDeleteError } = await supabase.from("seasons").delete().eq("id", seasonId);
      if (seasonDeleteError) throw new Error(seasonDeleteError.message);
      await load();
      flash();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete season");
    } finally {
      setConfirmDeleteId(null);
      setSaving(false);
    }
  }

  const activeSeason = seasons.find((season) => season.active);
  const nextLabel = seasons.length > 0
    ? `${seasons[0].start_year + 1}–${String(seasons[0].end_year + 1).slice(2)}`
    : "";

  return (
    <div className="max-w-4xl mx-auto">
      <AdminSaveFeedback
        saving={saving}
        saved={saved}
        savingLabel="Updating seasons…"
        successLabel="Season changes saved"
      />
      {showCreateConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm" style={{ zIndex: 200 }} onClick={() => setShowCreateConfirm(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="create-season-title" className="rounded-2xl p-8 max-w-sm w-full mx-4 border border-border bg-background" onClick={(event) => event.stopPropagation()}>
            <h2 id="create-season-title" className="font-display font-black uppercase text-foreground mb-2" style={{ fontSize: "1.4rem" }}>Create {nextLabel} Season?</h2>
            <p className="font-body text-sm leading-relaxed mb-1 text-muted-foreground">This will:</p>
            <ul className="font-body text-sm mb-5 space-y-1 text-muted-foreground">
              <li>• Create the <strong className="text-foreground">{nextLabel}</strong> season</li>
              <li>• Seed zero stats for all active players</li>
              <li>• Keep the current season active until you change it</li>
            </ul>
            <p className="font-body text-xs mb-6 text-muted-foreground">A new season remains removable until matches or recorded stats are added.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowCreateConfirm(false); handleCreateNextSeason(); }} disabled={saving} className="flex-1 px-5 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-destructive-foreground text-xs bg-destructive transition-opacity hover:bg-destructive/90 disabled:opacity-60 disabled:cursor-not-allowed">{saving && <Loader className="mr-2 inline size-4 animate-spin" />}{saving ? "Creating…" : "Create Season"}</button>
              <button onClick={() => setShowCreateConfirm(false)} className="flex-1 px-5 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-xs bg-secondary text-muted-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display font-black uppercase text-foreground leading-none" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>Seasons</h1>
          <p className="font-body mt-1 text-muted-foreground" style={{ fontSize: "1rem" }}>Create seasons, choose what is active, and protect historical records.</p>
        </div>
        <button onClick={() => setShowCreateConfirm(true)} disabled={saving || seasons.length === 0} className="px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-destructive-foreground bg-destructive transition-opacity hover:bg-destructive/90 disabled:opacity-60 disabled:cursor-not-allowed" style={{ fontSize: "1.1rem" }}>+ Create Next Season</button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-background px-5 py-4">
        <div><p className="font-display uppercase tracking-widest text-muted-foreground" style={{ fontSize: "0.75rem" }}>Active Season</p><p className="font-display font-black text-foreground" style={{ fontSize: "1.25rem" }}>{activeSeason?.label ?? "Not set"}</p></div>
        <div><p className="font-display uppercase tracking-widest text-muted-foreground" style={{ fontSize: "0.75rem" }}>Season Records</p><p className="font-display font-black text-foreground" style={{ fontSize: "1.25rem" }}>{seasons.length}</p></div>
      </div>

      {error && <p className="font-body text-sm mb-4 text-destructive">Error: {error}</p>}

      {loading ? (
        <p className="font-display text-sm tracking-widest uppercase text-muted-foreground">Loading…</p>
      ) : seasons.length === 0 ? (
        <div className="rounded-xl border border-border bg-background px-5 py-6"><p className="font-body text-muted-foreground">No seasons exist yet. Create the first season in Supabase before using this workflow.</p></div>
      ) : (
        <div className="flex flex-col gap-3">
          {seasons.map((season) => {
            const deleteState = deleteStates[season.id];
            const canDelete = deleteState?.deletable === true;
            return (
              <div
                key={season.id}
                className={cn(
                  "flex flex-col gap-4 px-5 py-4 rounded-xl border sm:flex-row sm:items-center sm:justify-between",
                  season.active
                    ? "border-primary/30 bg-accent/50"
                    : "border-border bg-card transition-colors hover:border-muted-foreground/40",
                )}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display font-black text-foreground" style={{ fontSize: "1.25rem" }}>{season.label} Season</p>
                    {season.active && <span className="font-display text-xs tracking-widest uppercase px-3 py-1 rounded-full border border-success/30 bg-success/15 text-success">Active</span>}
                  </div>
                  <p className="font-body text-sm text-muted-foreground">{season.start_year} – {season.end_year}</p>
                  {!season.active && deleteState && <p className="font-body text-xs mt-1 text-muted-foreground/80">{deleteState.reason}</p>}
                </div>

                {!season.active && (
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button onClick={() => handleSetActive(season.id)} disabled={saving} className="px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest border border-success/20 bg-success/10 text-success/80 transition-colors hover:bg-success/20 disabled:opacity-60 disabled:cursor-not-allowed" style={{ fontSize: "0.85rem" }}>Set Active</button>
                    <button
                      onClick={() => confirmDeleteId === season.id ? handleDelete(season.id) : setConfirmDeleteId(season.id)}
                      disabled={saving || !canDelete}
                      title={deleteState?.reason ?? "Checking whether this season can be deleted."}
                      className={cn(
                        "px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        confirmDeleteId === season.id
                          ? "border-destructive/50 bg-destructive/20 text-destructive hover:bg-destructive/30"
                          : "border-border bg-transparent text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive/80",
                      )}
                      style={{ fontSize: "0.85rem" }}
                    >{confirmDeleteId === season.id ? "Confirm Delete" : "Delete"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
