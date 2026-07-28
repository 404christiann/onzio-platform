"use client";

import Image from "@/components/ResilientImage";
import { useEffect, useRef, useState } from "react";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import SeasonSelect from "@/components/admin/SeasonSelect";
import OpponentCrest from "@/components/OpponentCrest";
import type { DBSeason } from "@/lib/db-types";
import { createClient } from "@/lib/admin-client";
import { useSeasons } from "@/lib/use-seasons";
import { carrySponsorFromLatestMatch } from "@/lib/match-sponsor";
import { deleteStorageUrls } from "@/lib/storage-cleanup";

// ── Types ─────────────────────────────────────

type Match = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  opponent_short_name: string | null;
  opponent_logo_url: string | null;
  competition: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_link: string | null;
  home: boolean;
  venue: string;
  address: string | null;
  city: string | null;
  state: string | null;
  rose_city_score: number | null;
  opponent_score: number | null;
  season_id: string;
};

type FormState = Omit<Match, "id">;

function emptyForm(seasonId = ""): FormState {
  return {
    date: "", time: "", opponent: "", opponent_short_name: null, opponent_logo_url: null, competition: "",
    sponsor_name: null, sponsor_logo_url: null, sponsor_link: null,
    home: true, venue: "", address: "", city: "", state: "",
    rose_city_score: null, opponent_score: null, season_id: seasonId,
  };
}

function normalizeScore(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value;
}

async function uploadPhoto(file: File, bucket: string, folder: string): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function deleteUnusedMatchImageUrls({
  bucket,
  urls,
  column,
  allowedPrefixes,
}: {
  bucket: string;
  urls: Array<string | null | undefined>;
  column: "opponent_logo_url" | "sponsor_logo_url";
  allowedPrefixes: string[];
}) {
  const supabase = createClient();
  const unusedUrls: string[] = [];

  for (const url of urls) {
    if (!url) continue;
    const { count, error } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq(column, url);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) unusedUrls.push(url);
  }

  await deleteStorageUrls(bucket, unusedUrls, allowedPrefixes);
}

// ── Main component ────────────────────────────

export default function SchedulePage() {
  const {
    seasons,
    selectedSeasonId,
    setSelectedSeasonId,
    loading: seasonsLoading,
  } = useSeasons();
  const [matches, setMatches]       = useState<Match[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<FormState>(emptyForm());
  const [addOpen, setAddOpen]       = useState(false);
  const [addForm, setAddForm]       = useState<FormState>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  // ── Load ────────────────────────────────────

  async function load() {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("matches")
      .select("id, date, time, opponent, opponent_short_name, opponent_logo_url, competition, sponsor_name, sponsor_logo_url, sponsor_link, home, venue, address, city, state, rose_city_score, opponent_score, season_id")
      .order("date")
      .order("time");
    if (loadError) setError(loadError.message);
    setMatches((data ?? []) as Match[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setEditingId(null);
    setAddForm({
      ...emptyForm(selectedSeasonId),
      ...carrySponsorFromLatestMatch(matches, selectedSeasonId),
    });
  }, [matches, selectedSeasonId]);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  // ── Add ─────────────────────────────────────

  function validate(form: FormState): string | null {
    if (!form.season_id) return "Season is required.";
    if (!form.date)     return "Date is required.";
    if (!form.time)     return "Time is required.";
    if (!form.opponent.trim()) return "Opponent is required.";
    if (!form.venue.trim())    return "Venue is required.";
    const roseCityScore = form.rose_city_score;
    const opponentScore = form.opponent_score;
    const hasRoseCityScore = roseCityScore !== null;
    const hasOpponentScore = opponentScore !== null;
    if (hasRoseCityScore !== hasOpponentScore) {
      return "Enter both scores, or leave both blank.";
    }
    if (
      (roseCityScore !== null && (!Number.isInteger(roseCityScore) || roseCityScore < 0)) ||
      (opponentScore !== null && (!Number.isInteger(opponentScore) || opponentScore < 0))
    ) {
      return "Scores must be whole numbers of 0 or higher.";
    }
    if (form.sponsor_logo_url && !form.sponsor_name?.trim()) {
      return "Sponsor name is required when a sponsor logo is uploaded.";
    }
    if (form.sponsor_link?.trim()) {
      try {
        const sponsorUrl = new URL(form.sponsor_link);
        if (!['http:', 'https:'].includes(sponsorUrl.protocol)) throw new Error();
      } catch {
        return "Sponsor website link must be a valid http or https address.";
      }
    }
    return null;
  }

  async function handleAdd() {
    const validationError = validate(addForm);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("matches").insert([{
      ...addForm,
      address: addForm.address?.trim() || null,
      city: addForm.city?.trim() || null,
      state: addForm.state?.trim() || null,
      rose_city_score: normalizeScore(addForm.rose_city_score),
      opponent_score: normalizeScore(addForm.opponent_score),
      opponent_short_name: addForm.opponent_short_name?.trim() || null,
      competition: addForm.competition?.trim() || null,
      sponsor_name: addForm.sponsor_name?.trim() || null,
      sponsor_logo_url: addForm.sponsor_logo_url?.trim() || null,
      sponsor_link: addForm.sponsor_link?.trim() || null,
    }]);
    if (e) { setError(e.message); setSaving(false); return; }
    setAddForm({
      ...emptyForm(selectedSeasonId),
      ...carrySponsorFromLatestMatch(matches, selectedSeasonId),
    });
    setAddOpen(false);
    await load();
    flash();
    setSaving(false);
  }

  // ── Edit ────────────────────────────────────

  function startEdit(m: Match) {
    setEditingId(m.id);
    setEditForm({
      date: m.date, time: m.time, opponent: m.opponent,
      opponent_short_name: m.opponent_short_name,
      opponent_logo_url: m.opponent_logo_url, competition: m.competition ?? "",
      sponsor_name: m.sponsor_name, sponsor_logo_url: m.sponsor_logo_url,
      sponsor_link: m.sponsor_link,
      home: m.home, venue: m.venue, address: m.address ?? "",
      city: m.city ?? "", state: m.state ?? "",
      rose_city_score: m.rose_city_score, opponent_score: m.opponent_score,
      season_id: m.season_id,
    });
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const validationError = validate(editForm);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const originalMatch = matches.find((match) => match.id === editingId);
    const { error: e } = await supabase.from("matches").update({
      ...editForm,
      address: editForm.address?.trim() || null,
      city: editForm.city?.trim() || null,
      state: editForm.state?.trim() || null,
      rose_city_score: normalizeScore(editForm.rose_city_score),
      opponent_score: normalizeScore(editForm.opponent_score),
      opponent_short_name: editForm.opponent_short_name?.trim() || null,
      competition: editForm.competition?.trim() || null,
      sponsor_name: editForm.sponsor_name?.trim() || null,
      sponsor_logo_url: editForm.sponsor_logo_url?.trim() || null,
      sponsor_link: editForm.sponsor_link?.trim() || null,
    }).eq("id", editingId);
    if (e) { setError(e.message); setSaving(false); return; }
    await deleteUnusedMatchImageUrls({
      bucket: "opponent-logos",
      urls: [
        originalMatch?.opponent_logo_url !== editForm.opponent_logo_url
          ? originalMatch?.opponent_logo_url
          : null,
      ],
      column: "opponent_logo_url",
      allowedPrefixes: ["match-opponents/"],
    });
    await deleteUnusedMatchImageUrls({
      bucket: "sponsors",
      urls: [
        originalMatch?.sponsor_logo_url !== editForm.sponsor_logo_url
          ? originalMatch?.sponsor_logo_url
          : null,
      ],
      column: "sponsor_logo_url",
      allowedPrefixes: ["match-sponsors/"],
    });
    setEditingId(null);
    await load();
    flash();
    setSaving(false);
  }

  // ── Delete ──────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("matches").delete().eq("id", id);
    if (e) { setError(e.message); setDeletingId(null); return; }
    setMatches((prev) => prev.filter((m) => m.id !== id));
    setDeletingId(null);
  }

  // ── Render ───────────────────────────────────

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);
  const sorted = matches.filter((match) => match.season_id === selectedSeasonId).sort((a, b) => {
    const keyA = `${a.date}T${a.time ?? "00:00"}`;
    const keyB = `${b.date}T${b.time ?? "00:00"}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  return (
    <div className="max-w-4xl mx-auto">
      <AdminSaveFeedback saving={saving} saved={saved} />

      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="font-display font-black uppercase text-white leading-none"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
          >
            Schedule
          </h1>
          <p className="font-body mt-1" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.35)" }}>
            Add, edit, or remove matches.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SeasonSelect
            seasons={seasons}
            value={selectedSeasonId}
            onChange={setSelectedSeasonId}
            label="View Season"
            disabled={seasonsLoading || saving}
          />
          <button
            onClick={() => {
              setAddOpen((open) => !open);
              setAddForm({
                ...emptyForm(selectedSeasonId),
                ...carrySponsorFromLatestMatch(matches, selectedSeasonId),
              });
              setError(null);
            }}
            disabled={!selectedSeasonId}
            className="flex-shrink-0 px-6 py-2.5 rounded-lg font-display font-black uppercase tracking-widest text-white transition-opacity"
            style={{ backgroundColor: "#dc2626", fontSize: "1.1rem", opacity: selectedSeasonId ? 1 : 0.5 }}
          >
            {addOpen ? "Cancel" : "+ Add Match"}
          </button>
        </div>
      </div>

      {/* Global feedback */}
      {error && (
        <p className="font-body text-sm mb-4" style={{ color: "#dc2626" }}>
          Error: {error}
        </p>
      )}

      {/* Add form */}
      {addOpen && (
        <div
          className="rounded-xl p-5 mb-6"
          style={{ backgroundColor: "#161616", border: "1px solid rgba(220,38,38,0.25)" }}
        >
          <p className="font-display font-black uppercase text-xs tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
            New Match
          </p>
          <MatchForm form={addForm} onChange={setAddForm} seasons={seasons} cleanupDraftUploads />
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
              style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : "Save Match"}
            </button>
          </div>
        </div>
      )}

      {/* Match list */}
      {loading || seasonsLoading ? (
        <p className="font-display text-sm tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading…
        </p>
      ) : sorted.length === 0 ? (
        <p className="font-body text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          No matches for {selectedSeason?.label ?? "the selected season"}. Add one above.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((m) => {
            const isEditing = editingId === m.id;
            const isDeleting = deletingId === m.id;

            return (
              <div
                key={m.id}
                className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${isEditing ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.07)"}` }}
              >
                {isEditing ? (
                  /* Edit mode */
                  <div className="p-5" style={{ backgroundColor: "#161616" }}>
                    <MatchForm form={editForm} onChange={setEditForm} seasons={seasons} />
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-white text-xs"
                        style={{ backgroundColor: "#dc2626", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-6 py-2 rounded-lg font-display font-black uppercase tracking-widest text-xs"
                        style={{ backgroundColor: "#222", color: "rgba(255,255,255,0.5)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div
                    className="flex items-center justify-between gap-4 px-5 py-4"
                    style={{ backgroundColor: "#111111" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <OpponentCrest name={m.opponent} logoUrl={m.opponent_logo_url} size={40} />
                      <div className="min-w-0">
                      {/* Date + home/away badge */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-display font-bold text-white" style={{ fontSize: "1.1rem" }}>{m.date}</span>
                        <span className="font-body" style={{ fontSize: "1rem", color: "rgba(255,255,255,0.3)" }}>{m.time}</span>
                        <span
                          className="font-display font-black uppercase px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: m.home ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)",
                            color: m.home ? "rgba(34,197,94,0.9)" : "rgba(255,255,255,0.4)",
                            fontSize: "0.75rem",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {m.home ? "Home" : "Away"}
                        </span>
                      </div>

                      {/* Opponent */}
                      <p className="font-display font-black uppercase text-white" style={{ fontSize: "1.25rem" }}>
                        {m.home ? "vs" : "@"} {m.opponent}
                      </p>

                      {(m.rose_city_score !== null && m.opponent_score !== null) && (
                        <p
                          className="font-display mt-1 font-black uppercase tracking-widest"
                          style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.72)" }}
                        >
                          Result: Rose City {m.rose_city_score} - {m.opponent_score} {m.opponent}
                        </p>
                      )}

                      {/* Competition */}
                      {m.competition && (
                        <p className="font-body truncate" style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.35)" }}>
                          {m.competition}
                        </p>
                      )}

                      {m.sponsor_logo_url && (
                        <p className="font-body truncate" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>
                          Presented by {m.sponsor_name || "match sponsor"}
                        </p>
                      )}

                      {/* Venue */}
                      <p className="font-body mt-0.5 truncate" style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.3)" }}>
                        {m.venue}
                        {m.city ? `, ${m.city}` : ""}
                        {m.state ? `, ${m.state}` : ""}
                        {m.address ? ` · ${m.address}` : ""}
                      </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => startEdit(m)}
                        className="px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest transition-colors"
                        style={{
                          fontSize: "0.95rem",
                          backgroundColor: "#1e1e1e",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.6)",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={isDeleting}
                        className="px-4 py-2 rounded-lg font-display font-black uppercase tracking-widest transition-colors"
                        style={{
                          fontSize: "0.95rem",
                          backgroundColor: "rgba(220,38,38,0.1)",
                          border: "1px solid rgba(220,38,38,0.2)",
                          color: isDeleting ? "rgba(220,38,38,0.4)" : "rgba(220,38,38,0.8)",
                          cursor: isDeleting ? "not-allowed" : "pointer",
                        }}
                      >
                        {isDeleting ? "…" : "Delete"}
                      </button>
                    </div>
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

// ── Reusable form ─────────────────────────────

function MatchForm({
  form,
  onChange,
  seasons,
  cleanupDraftUploads = false,
}: {
  form: Omit<Match, "id">;
  onChange: (f: Omit<Match, "id">) => void;
  seasons: DBSeason[];
  cleanupDraftUploads?: boolean;
}) {
  function set(field: string, value: string | boolean | number | null) {
    onChange({ ...form, [field]: value });
  }

  function setScore(field: "rose_city_score" | "opponent_score", value: string) {
    set(field, value === "" ? null : Number(value));
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Season" required>
        <select
          value={form.season_id}
          onChange={(e) => set("season_id", e.target.value)}
          style={inputStyle}
          required
        >
          <option value="">— Select a season —</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.label}{season.active ? " (Active)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date" required>
        <input
          type="date"
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Time" required>
        <input
          type="time"
          value={form.time}
          onChange={(e) => set("time", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Opponent" required>
        <input
          type="text"
          placeholder="e.g. Portland FC"
          value={form.opponent}
          onChange={(e) => set("opponent", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field
        label="Opponent Short Name (optional)"
        help="Used on the homepage Next Match card only when the full opponent name is too long to fit on one line."
      >
        <input
          type="text"
          placeholder="e.g. LA Galaxy Reserves"
          value={form.opponent_short_name ?? ""}
          onChange={(e) => set("opponent_short_name", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Competition (optional)">
        <input
          type="text"
          placeholder="e.g. UPSL 2027 Premier SoCal North"
          value={form.competition ?? ""}
          onChange={(e) => set("competition", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Opponent Logo (optional)">
        <OpponentLogoUpload
          logoUrl={form.opponent_logo_url}
          opponentName={form.opponent}
          onUploaded={async (url) => {
            if (cleanupDraftUploads) {
              await deleteUnusedMatchImageUrls({
                bucket: "opponent-logos",
                urls: [form.opponent_logo_url],
                column: "opponent_logo_url",
                allowedPrefixes: ["match-opponents/"],
              });
            }
            onChange({ ...form, opponent_logo_url: url });
          }}
          onRemove={async () => {
            if (cleanupDraftUploads) {
              await deleteUnusedMatchImageUrls({
                bucket: "opponent-logos",
                urls: [form.opponent_logo_url],
                column: "opponent_logo_url",
                allowedPrefixes: ["match-opponents/"],
              });
            }
            onChange({ ...form, opponent_logo_url: null });
          }}
        />
      </Field>

      <div
        className="mt-2 border-t pt-4 sm:col-span-2"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <p
          className="font-display text-xs font-black uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Presented By Sponsor
        </p>
        <p
          className="font-body mt-1 text-xs"
          style={{ color: "rgba(255,255,255,0.28)" }}
        >
          New matches inherit these sponsor details from the latest match. Clear the logo to hide the sponsor on the homepage.
        </p>
      </div>

      <Field label="Sponsor Name (optional)">
        <input
          type="text"
          placeholder="e.g. Tepito Coffee"
          value={form.sponsor_name ?? ""}
          onChange={(e) => set("sponsor_name", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Sponsor Website Link (optional)">
        <input
          type="url"
          placeholder="https://..."
          value={form.sponsor_link ?? ""}
          onChange={(e) => set("sponsor_link", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Sponsor Logo (optional)">
          <SponsorLogoUpload
            logoUrl={form.sponsor_logo_url}
            sponsorName={form.sponsor_name ?? ""}
            onUploaded={async (url) => {
              if (cleanupDraftUploads) {
                await deleteUnusedMatchImageUrls({
                  bucket: "sponsors",
                  urls: [form.sponsor_logo_url],
                  column: "sponsor_logo_url",
                  allowedPrefixes: ["match-sponsors/"],
                });
              }
              onChange({ ...form, sponsor_logo_url: url });
            }}
            onRemove={async () => {
              if (cleanupDraftUploads) {
                await deleteUnusedMatchImageUrls({
                  bucket: "sponsors",
                  urls: [form.sponsor_logo_url],
                  column: "sponsor_logo_url",
                  allowedPrefixes: ["match-sponsors/"],
                });
              }
              onChange({ ...form, sponsor_logo_url: null });
            }}
          />
        </Field>
      </div>

      <Field label="Home / Away" required>
        <select
          value={form.home ? "home" : "away"}
          onChange={(e) => set("home", e.target.value === "home")}
          style={inputStyle}
        >
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
      </Field>

      <Field label="Venue" required>
        <input
          type="text"
          placeholder="e.g. Delta Park"
          value={form.venue}
          onChange={(e) => set("venue", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Address (optional)">
        <input
          type="text"
          placeholder="e.g. 1234 N Broadacre St"
          value={form.address ?? ""}
          onChange={(e) => set("address", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="City (optional)">
        <input
          type="text"
          placeholder="e.g. Irvine"
          value={form.city ?? ""}
          onChange={(e) => set("city", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="State (optional)">
        <input
          type="text"
          placeholder="e.g. CA"
          value={form.state ?? ""}
          onChange={(e) => set("state", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <div
        className="mt-2 border-t pt-4 sm:col-span-2"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <p
          className="font-display text-xs font-black uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Match Result
        </p>
        <p
          className="font-body mt-1 text-xs"
          style={{ color: "rgba(255,255,255,0.28)" }}
        >
          Leave both scores blank until the match is complete. The public schedule updates automatically once both scores are saved.
        </p>
      </div>

      <Field label="Rose City Score (optional)">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="e.g. 2"
          value={form.rose_city_score ?? ""}
          onChange={(e) => setScore("rose_city_score", e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Opponent Score (optional)">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="e.g. 1"
          value={form.opponent_score ?? ""}
          onChange={(e) => setScore("opponent_score", e.target.value)}
          style={inputStyle}
        />
      </Field>
    </div>
  );
}

function OpponentLogoUpload({
  logoUrl,
  opponentName,
  onUploaded,
  onRemove,
}: {
  logoUrl: string | null;
  opponentName: string;
  onUploaded: (url: string) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUploaded(await uploadPhoto(file, "opponent-logos", "match-opponents"));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <OpponentCrest name={opponentName || "?"} logoUrl={logoUrl} size={40} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="px-3 py-2 rounded-lg font-display font-bold uppercase tracking-widest text-xs"
        style={{
          backgroundColor: "#1e1e1e",
          border: "1px solid rgba(255,255,255,0.08)",
          color: uploading ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
          cursor: uploading ? "not-allowed" : "pointer",
        }}
      >
        {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
      </button>
      {logoUrl && !uploading && (
        <button
          type="button"
          onClick={() => void onRemove()}
          className="font-display font-bold uppercase tracking-widest text-xs"
          style={{ color: "rgba(220,38,38,0.8)" }}
        >
          Remove
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {error && (
        <p className="font-body text-xs" style={{ color: "#dc2626" }}>{error}</p>
      )}
    </div>
  );
}

function SponsorLogoUpload({
  logoUrl,
  sponsorName,
  onUploaded,
  onRemove,
}: {
  logoUrl: string | null;
  sponsorName: string;
  onUploaded: (url: string) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUploaded(await uploadPhoto(file, "sponsors", "match-sponsors"));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="relative flex h-14 w-28 items-center justify-center overflow-hidden rounded-lg"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={sponsorName ? `${sponsorName} logo` : "Sponsor logo"}
            fill
            sizes="112px"
            className="object-contain p-2"
          />
        ) : (
          <span
            className="font-display text-[0.55rem] font-bold uppercase tracking-widest"
            style={{ color: "rgba(0,0,0,0.35)" }}
          >
            No Logo
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="rounded-lg px-3 py-2 font-display text-xs font-bold uppercase tracking-widest"
        style={{
          backgroundColor: "#1e1e1e",
          border: "1px solid rgba(255,255,255,0.08)",
          color: uploading ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)",
          cursor: uploading ? "not-allowed" : "pointer",
        }}
      >
        {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
      </button>
      {logoUrl && !uploading && (
        <button
          type="button"
          onClick={() => void onRemove()}
          className="font-display text-xs font-bold uppercase tracking-widest"
          style={{ color: "rgba(220,38,38,0.8)" }}
        >
          Remove
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />
      {error && (
        <p className="font-body w-full text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block font-display text-xs tracking-widest uppercase mb-1"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {label}
        {required && <span style={{ color: "#dc2626", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {help && (
        <p className="font-body mt-1.5 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
          {help}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#0e0e0e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "white",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  outline: "none",
  colorScheme: "dark",
};
