import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usesKitRoster } from "@/lib/admin-roster-variant";
import type { Player, PlayerForm } from "@/components/admin/roster/roster-model";
import {
  DEFAULT_ROSTER_FILTERS, FIELD_SECTION, buildPlayerPayload, cardStats, firstProblem, groupPlayers, validatePlayer,
} from "@/components/admin/roster/rose-city/rose-city-roster-model";
import { RosterPlayerCard } from "@/components/admin/roster/rose-city/RosterPlayerCard";
import { PlayerBackgroundFields, PlayerBasicsFields, PlayerDetailsFields, PlayerVisibilityFields } from "@/components/admin/roster/rose-city/RosterPlayerFields";
import { persistPlayerRow, setPlayerVisibility, type RosterClient } from "@/components/admin/roster/rose-city/rose-city-roster-save";

const deleteStorageUrls = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/storage-cleanup", () => ({ deleteStorageUrls }));

vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/NationalityFlag", () => ({ default: ({ nationality }: { nationality: string }) => createElement("i", { "data-flag": nationality }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt, ...rest }: { src: string; alt: string }) => createElement("img", { src, alt, ...rest }) }));
vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

type Call = { table: string; op: string; body?: unknown; options?: unknown; filter?: string };

/** A recording stand-in for the admin data client: every write the editor makes, in order. */
function fakeClient(existing?: Record<string, unknown>) {
  const calls: Call[] = [];
  const uploads: string[] = [];
  const client = {
    from(table: string) {
      return {
        update: (body: unknown) => ({ eq: async (column: string, value: unknown) => { calls.push({ table, op: "update", body, filter: `${column}=${String(value)}` }); return { error: null }; } }),
        insert: (body: unknown) => ({ select: () => ({ single: async () => { calls.push({ table, op: "insert", body }); return { data: { id: "new-player" }, error: null }; } }) }),
        upsert: async (body: unknown, options: unknown) => { calls.push({ table, op: "upsert", body, options }); return { error: null }; },
        select: () => ({ eq: () => ({ single: async () => ({ data: existing ?? null, error: null }) }) }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => { uploads.push(`${bucket}:${path}`); return { error: null }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
      }),
    },
  } as unknown as RosterClient;
  return { client, calls, uploads };
}

const season = async () => ({ id: "season-1" });
const form = (over: Partial<PlayerForm> = {}): PlayerForm => ({
  number: 7, name: "  Andre Walker ", caption: "", nationality: "American", position: "Forward", height: "5'11\"", weight: "168 lbs",
  hometown: "Altadena, CA", age: 24, school: "  ", previous_club: " Rose FC ", photo_url: "", bio: "", pronunciation: "", foot: "Left", ...over,
});
const saved = (over: Partial<Player> = {}): Player => ({ id: "p1", active: true, ...form(), name: "Andre Walker", ...over } as Player);

beforeEach(() => { deleteStorageUrls.mockClear(); });

describe("RC-ADMIN-4b-roster: who gets the kit Roster", () => {
  it("lists Rose City by slug and nobody else, so Diverse City keeps the classic editor", () => {
    expect(usesKitRoster("rose-city")).toBe(true);
    expect(usesKitRoster("diverse-city")).toBe(false);
    expect(usesKitRoster("lions")).toBe(false);
    expect(usesKitRoster(null)).toBe(false);
    expect(usesKitRoster(undefined)).toBe(false);
    expect(usesKitRoster("")).toBe(false);
  });

  it("branches the page in one guarded return and leaves the classic render, and the legacy page, as they were", () => {
    const page = read("app/admin/(protected)/roster/page.tsx");
    expect(page).toContain("if (!reimagined && usesKitRoster(club.slug)) {");
    expect(page).toContain("<RoseCityRosterPage StaffComponent={StaffTab} />");
    expect(page).toContain("<AdminToastProvider><ClassicRosterPage StaffComponent={StaffTab} PlayerFields={PlayerFormFields} /></AdminToastProvider>");
    expect(page).toContain('return reimagined ? <LegacyRosterPage /> : (');
    expect(page).not.toMatch(/presentationTemplateKey|cinematic@2/);
  });

  it("adds no template selector in any new file", () => {
    for (const file of [
      "lib/admin-roster-variant.ts",
      "components/admin/roster/rose-city/RoseCityRosterPage.tsx",
      "components/admin/roster/rose-city/RoseCityPlayerDialog.tsx",
      "components/admin/roster/rose-city/RosterPlayerCard.tsx",
      "components/admin/roster/rose-city/RosterPlayerFields.tsx",
      "components/admin/roster/rose-city/rose-city-roster-save.ts",
    ]) expect(read(file), file).not.toMatch(/presentationTemplateKey|cinematic@2|academy@1/);
  });

  it("does not touch the classic roster files", () => {
    // The kit editor is new files plus the one branch above; these still hold the writes the new editor ports.
    const classic = read("components/admin/roster/ClassicRosterPage.tsx");
    expect(classic).toContain("...payload, ...(active !== persisted?.active ? { active } : {}),");
    expect(classic).toContain("const { data, error: saveError } = await supabase.from(\"players\").insert([{ ...payload, active }]).select(\"id\").single();");
    expect(classic).toContain("onConflict: \"player_id,season_id\", ignoreDuplicates: true");
    expect(classic).toContain("if (current.active !== player.active) { await load(); return; }");
  });
});

describe("RC-ADMIN-4b-roster: save payloads are the classic editor's", () => {
  it("writes the same expressions as the classic editor, in the same order", () => {
    const ours = read("components/admin/roster/rose-city/rose-city-roster-save.ts");
    expect(ours).toContain("...payload, ...(active !== persisted?.active ? { active } : {}),");
    expect(ours).toContain('client.from("players").insert([{ ...payload, active }]).select("id").single()');
    expect(ours).toContain('onConflict: "player_id,season_id", ignoreDuplicates: true');
    expect(ours).toContain("if (current.active !== player.active) return \"stale\";");
    expect(ours.indexOf("uploadRosterPhoto(client, photo")).toBeLessThan(ours.indexOf("seedPlayer(client, persisted.id"));
    expect(ours.indexOf("seedPlayer(client, persisted.id")).toBeLessThan(ours.indexOf('client.from("players").update('));
  });

  it("builds the row the classic editor builds: trimmed optional text is null when blank, the form's other values untouched", () => {
    expect(buildPlayerPayload(form(), "")).toEqual({
      ...form(), photo_url: "", caption: null, school: null, previous_club: "Rose FC", bio: null, pronunciation: null, foot: "Left",
    });
    expect(buildPlayerPayload(form({ caption: "(C)", bio: " Hi " }), "https://x/y.jpg")).toMatchObject({ caption: "(C)", bio: "Hi", photo_url: "https://x/y.jpg" });
  });

  it("a new player is one insert of the payload with active, then one stats seed for the active season", async () => {
    const { client, calls } = fakeClient();
    const { next, seedError } = await persistPlayerRow({ client, clubId: "club", persisted: null, form: form(), active: true, photo: null, lookup: season });
    expect(seedError).toBe("");
    expect(calls).toEqual([
      { table: "players", op: "insert", body: [{ ...buildPlayerPayload(form(), ""), active: true }] },
      { table: "player_season_stats", op: "upsert", body: [{ player_id: "new-player", season_id: "season-1", goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0 }], options: { onConflict: "player_id,season_id", ignoreDuplicates: true } },
    ]);
    expect(next.id).toBe("new-player");
  });

  it("a new goalkeeper seeds the goalkeeper table", async () => {
    const { client, calls } = fakeClient();
    await persistPlayerRow({ client, clubId: "club", persisted: null, form: form({ position: "Goalkeeper" }), active: false, photo: null, lookup: season });
    expect(calls[1]).toMatchObject({ table: "goalkeeper_season_stats", op: "upsert" });
    expect(calls[0]).toMatchObject({ body: [expect.objectContaining({ active: false, position: "Goalkeeper" })] });
  });

  it("an edit is one update of the payload; active is sent only when it changed", async () => {
    const same = fakeClient();
    await persistPlayerRow({ client: same.client, clubId: "club", persisted: saved(), form: form({ hometown: "Pasadena, CA" }), active: true, photo: null, lookup: season });
    expect(same.calls).toEqual([{ table: "players", op: "update", body: buildPlayerPayload(form({ hometown: "Pasadena, CA" }), ""), filter: "id=p1" }]);
    expect(same.calls[0].body).not.toHaveProperty("active");

    const changed = fakeClient();
    await persistPlayerRow({ client: changed.client, clubId: "club", persisted: saved(), form: form(), active: false, photo: null, lookup: season });
    expect(changed.calls).toEqual([{ table: "players", op: "update", body: { ...buildPlayerPayload(form(), ""), active: false }, filter: "id=p1" }]);
  });

  it("showing a hidden player seeds the season row before the update, and a new photo replaces the old one in storage", async () => {
    const { client, calls, uploads } = fakeClient();
    const file = new File(["x"], "me.png", { type: "image/png" });
    await persistPlayerRow({ client, clubId: "club", persisted: saved({ active: false, photo_url: "https://storage.test/roster-images/players/old.jpg" }), form: form({ photo_url: "https://storage.test/roster-images/players/old.jpg" }), active: true, photo: file, lookup: season });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^roster-images:players\/\d+-[a-z0-9]+\.png$/);
    expect(calls.map(call => `${call.table}:${call.op}`)).toEqual(["player_season_stats:upsert", "players:update"]);
    expect(calls[1].body).toMatchObject({ active: true, photo_url: expect.stringContaining("https://storage.test/roster-images/players/") });
    expect(deleteStorageUrls).toHaveBeenCalledWith("roster-images", ["https://storage.test/roster-images/players/old.jpg"], ["players/"]);
  });

  it("the card's show/hide switch is the classic update({ active }) with the same seed first and the same stale check", async () => {
    const show = fakeClient({ id: "p1", active: false, position: "Midfielder" });
    expect(await setPlayerVisibility(show.client, saved({ active: false }), true, "club", season)).toBe("saved");
    expect(show.calls.map(call => `${call.table}:${call.op}`)).toEqual(["player_season_stats:upsert", "players:update"]);
    expect(show.calls[1]).toMatchObject({ body: { active: true }, filter: "id=p1" });

    const hide = fakeClient({ id: "p1", active: true, position: "Midfielder" });
    expect(await setPlayerVisibility(hide.client, saved({ active: true }), false, "club", season)).toBe("saved");
    expect(hide.calls).toEqual([{ table: "players", op: "update", body: { active: false }, filter: "id=p1" }]);

    const stale = fakeClient({ id: "p1", active: false, position: "Midfielder" });
    expect(await setPlayerVisibility(stale.client, saved({ active: true }), false, "club", season)).toBe("stale");
    expect(stale.calls).toEqual([]);
  });

  it("needs an active season to show a player, with the classic message", async () => {
    const { client } = fakeClient({ id: "p1", active: false, position: "Midfielder" });
    await expect(setPlayerVisibility(client, saved({ active: false }), true, "club", async () => null)).rejects.toThrow("A player cannot be activated until an active season is configured.");
  });

  it("refuses an invalid player with the classic message before any write", async () => {
    const { client, calls } = fakeClient();
    await expect(persistPlayerRow({ client, clubId: "club", persisted: null, form: form({ name: " " }), active: true, photo: null, lookup: season })).rejects.toThrow("Enter the player's name.");
    expect(calls).toEqual([]);
  });
});

describe("RC-ADMIN-4b-roster: validation keeps the classic rules and messages", () => {
  it("uses the classic strings in the classic order", () => {
    const empty = validatePlayer(form({ name: "", number: NaN, nationality: "", hometown: "", height: "", weight: "", age: 0 }));
    expect(empty).toEqual({
      name: "Enter the player's name.", number: "Use 0 to 99.", nationality: "Nationality is required.", hometown: "Hometown is required.",
      height: "Height is required.", weight: "Weight is required.", age: expect.stringMatching(/under 14/),
    });
    expect(firstProblem(empty)).toBe("Enter the player's name.");
    expect(validatePlayer(form({ number: 100 })).number).toBe("Use 0 to 99.");
    expect(validatePlayer(form({ number: 1.5 })).number).toBe("Use 0 to 99.");
    expect(validatePlayer(form({ age: 81 })).age).toMatch(/80/);
    expect(validatePlayer(form())).toEqual({});
    const classic = read("components/admin/roster/ClassicRosterPage.tsx");
    for (const message of ["Enter the player's name.", "Use 0 to 99.", "Nationality is required.", "Hometown is required.", "Height is required.", "Weight is required."]) {
      expect(classic).toContain(message);
    }
  });

  it("points each problem at the dialog section that holds its field", () => {
    expect(FIELD_SECTION).toEqual({ name: "basics", number: "basics", nationality: "basics", hometown: "details", height: "details", weight: "details", age: "details" });
  });
});

describe("RC-ADMIN-4b-roster: order, filters and the card's numbers", () => {
  const roster = [
    { id: "a", number: 9, name: "Zed Forward", position: "Forward", active: true },
    { id: "b", number: 1, name: "Gus Keeper", position: "Goalkeeper", active: true },
    { id: "c", number: 5, name: "Dee Back", position: "Defender", active: false },
    { id: "d", number: 5, name: "Abe Back", position: "Defender", active: true },
    { id: "e", number: 8, name: "Mia Mid", position: "Midfielder", active: true },
  ] as Player[];

  it("lists Goalkeepers first, as the classic admin does, and orders a group by number then name", () => {
    const groups = groupPlayers(roster);
    expect(groups.map(group => group.position)).toEqual(["Goalkeeper", "Defender", "Midfielder", "Forward"]);
    expect(groups[1].players.map(player => player.name)).toEqual(["Abe Back", "Dee Back"]);
  });

  it("filters by name, jersey number, position and status like the classic list, and leaves empty groups out", () => {
    expect(groupPlayers(roster, { ...DEFAULT_ROSTER_FILTERS, query: "mia" }).flatMap(group => group.players.map(player => player.id))).toEqual(["e"]);
    expect(groupPlayers(roster, { ...DEFAULT_ROSTER_FILTERS, query: "5" }).flatMap(group => group.players.map(player => player.id))).toEqual(["d", "c"]);
    expect(groupPlayers(roster, { ...DEFAULT_ROSTER_FILTERS, position: "Defender", status: "hidden" }).flatMap(group => group.players.map(player => player.id))).toEqual(["c"]);
    expect(groupPlayers(roster, { ...DEFAULT_ROSTER_FILTERS, status: "active" }).flatMap(group => group.players).some(player => !player.active)).toBe(false);
    expect(groupPlayers([], DEFAULT_ROSTER_FILTERS)).toEqual([]);
  });

  it("shows the three numbers visitors see on the public card", () => {
    expect(cardStats(roster[0], { goals: 3, assists: 1, mins: 168 })).toEqual([["Goals", 3], ["Assists", 1], ["Mins", 168]]);
    expect(cardStats(roster[1], { saves: 7, clean_sheets: 1, mins: 180 })).toEqual([["Saves", 7], ["Clean sheets", 1], ["Mins", 180]]);
    expect(cardStats(roster[0], undefined)).toEqual([["Goals", 0], ["Assists", 0], ["Mins", 0]]);
  });
});

describe("RC-ADMIN-4b-roster: page shape", () => {
  const page = read("components/admin/roster/rose-city/RoseCityRosterPage.tsx");
  const dialog = read("components/admin/roster/rose-city/RoseCityPlayerDialog.tsx");

  it("has no page Save and no reordering, only each player's own Save", () => {
    expect(page).toContain("<PageFrame title=\"Roster\"");
    expect(page).not.toMatch(/onSave=|state=\{/);
    expect(page).not.toMatch(/sort_order|reorder|moveUp|moveDown/i);
    expect(dialog).toContain("<PageSaveButton");
    expect(dialog).toContain('saveLabel="Save player"');
    expect(dialog).toContain("footer={footer}");
  });

  it("reads a player's card numbers from the table for their current position, as the classic stats panel does", () => {
    expect(page).toContain('(player.position === "Goalkeeper" ? totals.keeper : totals.field)[player.id]');
    const classic = read("app/admin/(protected)/roster/page.tsx");
    expect(classic).toContain('const table = isGK ? "goalkeeper_season_totals" : "player_season_totals";');
  });

  it("keeps Staff as the classic list and dialog", () => {
    expect(page).toContain("<StaffComponent addRequest={staffAdd} classic />");
  });

  it("marks every card's Edit button as a kit edit control and keeps the data-player-id hook", () => {
    const card = read("components/admin/roster/rose-city/RosterPlayerCard.tsx");
    expect(card).toContain("{...KIT_EDIT_PROPS}");
    expect(card).toContain("data-player-id={player.id}");
    expect(card).toContain("aria-label={`Edit ${name}`}");
    expect(card).toContain("Show ${name} on the public roster");
  });

  it("keeps the kit dialog's own footer for every editor that does not pass one", () => {
    const kit = read("components/admin/ui/editor-kit/EditorDialog.tsx");
    expect(kit).toContain("{!phone && !footer && (");
    expect(kit).toContain("footer?: ReactNode;");
  });
});

describe("RC-ADMIN-4b-roster: rendered pieces", () => {
  const noop = () => undefined;
  const card = (player: Player, totals?: Record<string, number>) => renderToStaticMarkup(createElement(RosterPlayerCard, { player, totals, flash: false, switching: false, onEdit: noop, onVisibleChange: noop }));

  it("renders a card like the public one with Edit, a No photo flag and the switch", () => {
    const html = card(saved({ number: 9, caption: "(C)" }), { goals: 3, assists: 1, mins: 168 });
    expect(html).toContain('data-player-id="p1"');
    expect(html).toContain('aria-label="Edit Andre Walker"');
    expect(html).toContain("data-kit-edit");
    expect(html).toContain("Andre Walker");
    expect(html).toContain("No photo");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Show Andre Walker on the public roster"');
    expect(html).toContain("<strong>3</strong>");
    expect(html).toContain("FW · Altadena, CA");
  });

  it("dims a hidden player and shows its flag; keeps the stats strip out until totals load", () => {
    const html = card(saved({ active: false, photo_url: "https://storage.test/p.jpg" }));
    expect(html).toContain('data-hidden=""');
    expect(html).toContain(">Hidden<");
    expect(html).not.toContain("No photo");
    expect(html).not.toContain("<strong>");
  });

  it("renders the fields with the ids the classic editor and the verify spec use", () => {
    const common = { form: form(), onChange: noop, problems: {} };
    const basics = renderToStaticMarkup(createElement(PlayerBasicsFields, { ...common, photoPreview: null, uploading: false, onPhotoChange: noop, onPhotoPendingChange: noop }));
    for (const id of ["player-name", "player-number", "player-nationality", "player-pronunciation"]) expect(basics).toContain(`id="${id}"`);
    expect(basics).toContain("Player photo");
    expect(basics).toContain('aria-pressed="true" aria-label="Forward"');
    const details = renderToStaticMarkup(createElement(PlayerDetailsFields, common));
    for (const id of ["player-height", "player-weight", "player-age", "player-hometown", "player-foot"]) expect(details).toContain(`id="${id}"`);
    expect(details).toContain('aria-label="Captain"');
    const background = renderToStaticMarkup(createElement(PlayerBackgroundFields, { form: form(), onChange: noop }));
    for (const id of ["player-school", "player-previous-club", "player-bio"]) expect(background).toContain(`id="${id}"`);
    expect(renderToStaticMarkup(createElement(PlayerVisibilityFields, { active: false, disabled: false, onChange: noop }))).toContain("Show on the public roster");
  });

  it("marks a field with its message and points the control at it", () => {
    const html = renderToStaticMarkup(createElement(PlayerBasicsFields, { form: form({ name: "" }), onChange: noop, problems: { name: "Enter the player's name." }, photoPreview: null, uploading: false, onPhotoChange: noop, onPhotoPendingChange: noop }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Enter the player&#x27;s name.");
    expect(html).toMatch(/aria-describedby="[^"]*player-name-problem/);
  });
});
