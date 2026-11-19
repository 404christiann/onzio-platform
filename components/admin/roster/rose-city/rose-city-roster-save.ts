import type { createClient } from "@/lib/admin-client";
import { getPlayerSeasonSeed } from "@/lib/player-season";
import { rosterImageForStorage } from "@/lib/roster-images";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import type { Player, PlayerForm, Position } from "../roster-model";
import { buildPlayerPayload, firstProblem, validatePlayer } from "./rose-city-roster-model";

/**
 * The writes of the classic Roster editor (app/admin/(protected)/roster/page.tsx and
 * components/admin/roster/ClassicRosterPage.tsx), in the same order and with the same
 * bodies. RC-ADMIN-4b-roster moves the page onto the editor kit and changes none of them;
 * tests/contracts/rc-admin-4b-roster.test.ts pins that.
 */
export type RosterClient = ReturnType<typeof createClient>;
export type SeasonLookup = (clubId: string) => Promise<{ id: string } | null>;

// lib/queries builds a browser Supabase client when it is imported, so it is loaded only when a season is looked up.
const activeSeason: SeasonLookup = async clubId => (await import("@/lib/queries")).fetchActiveSeason(clubId);

export async function uploadRosterPhoto(client: RosterClient, file: File, bucket: string, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await client.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Gives a player a season stats row, so the player can be shown for the active season. */
export async function seedPlayer(
  client: RosterClient, id: string, position: Position, clubId: string, lookup: SeasonLookup = activeSeason,
): Promise<void> {
  const season = await lookup(clubId);
  if (!season) throw new Error("A player cannot be activated until an active season is configured.");
  const { table, stats } = getPlayerSeasonSeed(position);
  const { error } = await client.from(table).upsert([{
    player_id: id, season_id: season.id, ...stats,
  }], { onConflict: "player_id,season_id", ignoreDuplicates: true });
  if (error) throw new Error(`Player was not activated because season stats could not be seeded: ${error.message}`);
}

export type PersistInput = {
  client: RosterClient;
  clubId: string;
  /** The saved row this edit started from, or null for a new player. */
  persisted: Player | null;
  form: PlayerForm;
  active: boolean;
  /** A photo chosen but not uploaded yet. */
  photo: File | null;
  lookup?: SeasonLookup;
};
export type PersistResult = { next: Player; seedError: string };

export async function persistPlayerRow({ client, clubId, persisted, form, active, photo, lookup }: PersistInput): Promise<PersistResult> {
  const problem = firstProblem(validatePlayer(form));
  if (problem) throw new Error(problem);
  let photoUrl = rosterImageForStorage(form.photo_url);
  if (photo) photoUrl = await uploadRosterPhoto(client, photo, "roster-images", "players");
  if (persisted && !persisted.active && active) await seedPlayer(client, persisted.id, form.position, clubId, lookup);
  const payload = buildPlayerPayload(form, photoUrl);
  let id = persisted?.id;
  if (id) {
    const { error } = await client.from("players").update({
      ...payload, ...(active !== persisted?.active ? { active } : {}),
    }).eq("id", id);
    if (error) throw new Error(error.message);
    if (persisted?.photo_url !== photoUrl) await deleteStorageUrls("roster-images", [persisted?.photo_url], ["players/"]);
  } else {
    const { data, error } = await client.from("players").insert([{ ...payload, active }]).select("id").single();
    if (error) throw new Error(error.message);
    id = data!.id as string;
  }
  const next = { ...form, ...payload, id: id!, active } as Player;
  let seedError = "";
  if (!persisted) {
    try { await seedPlayer(client, id!, form.position, clubId, lookup); }
    catch (problem) { seedError = `Player saved, but season stats were not seeded: ${problem instanceof Error ? problem.message : "Unknown error"}`; }
  }
  return { next, seedError };
}

/**
 * The card's show/hide switch and the Undo toast: the classic editor's `restoreVisibility`.
 * Returns "stale" when the player changed elsewhere since the page loaded (reload instead of writing).
 */
export async function setPlayerVisibility(
  client: RosterClient, player: Player, active: boolean, clubId: string, lookup?: SeasonLookup,
): Promise<"saved" | "stale"> {
  const { data: current, error: readError } = await client.from("players").select("*").eq("id", player.id).single();
  if (readError || !current) throw new Error(readError?.message ?? "This player is no longer available.");
  if (current.active !== player.active) return "stale";
  if (active) await seedPlayer(client, player.id, current.position as Position, clubId, lookup);
  const { error } = await client.from("players").update({ active }).eq("id", player.id);
  if (error) throw new Error(error.message);
  return "saved";
}

export const FIELD_STAT_DEFAULTS: Record<string, number> = { goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0 };
export const KEEPER_STAT_DEFAULTS: Record<string, number> = { goals_against: 0, saves: 0, clean_sheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 };
