"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent } from "react";
import { Plus, Search } from "lucide-react";
import { useClubId } from "@/components/ClubContextProvider";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Shimmer, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { useAdminToast } from "@/components/admin/ui/AdminToast";
import { PageFrame, useEditorDialog } from "@/components/admin/ui/editor-kit";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/admin-client";
import { fetchActiveSeason } from "@/lib/queries";
import type { Player, Position } from "../roster-model";
import classic from "../classic-roster.module.css";
import { RoseCityPlayerDialog } from "./RoseCityPlayerDialog";
import { RosterPlayerCard } from "./RosterPlayerCard";
import type { PlayerSectionId } from "./RosterPlayerFields";
import {
  DEFAULT_ROSTER_FILTERS, ROSTER_POSITIONS, ROSTER_POSITION_ABBR, groupPlayers, type RosterFilters, type SeasonLine,
} from "./rose-city-roster-model";
import { setPlayerVisibility } from "./rose-city-roster-save";
import styles from "./rose-city-roster.module.css";

const TABS = [{ id: "players", label: "Players" }, { id: "staff", label: "Staff" }];
const CRUMBS = [{ label: "Competition" }];
const DESCRIPTION = "Players and staff. Each player saves on their own.";

type Editor = { key: number; player: Player | null };

async function loadTotals(clubId: string): Promise<Record<string, SeasonLine> | null> {
  try {
    const season = await fetchActiveSeason(clubId);
    if (!season) return {};
    const client = createClient();
    const [field, keepers] = await Promise.all([
      client.from("player_season_totals").select("player_id, goals, assists, mins").eq("season_id", season.id),
      client.from("goalkeeper_season_totals").select("player_id, saves, clean_sheets, mins").eq("season_id", season.id),
    ]);
    if (field.error || keepers.error) return null;
    const map: Record<string, SeasonLine> = {};
    for (const row of [...(field.data ?? []), ...(keepers.data ?? [])] as Array<SeasonLine & { player_id: string }>) map[row.player_id] = row;
    return map;
  } catch {
    return null;
  }
}

/**
 * Rose City's Roster (RC-ADMIN-4b-roster): a card per player styled like the public Squad card, grouped Goalkeepers first,
 * a show/hide switch on each card (the existing players.active), and a two-pane dialog with its own Save for one player.
 * There is no page Save and no way to change the order, as in the classic editor. Staff keeps the classic list and dialog.
 */
export default function RoseCityRosterPage({ StaffComponent }: { StaffComponent: ComponentType<{ addRequest: number; classic?: boolean }> }) {
  const clubId = useClubId();
  const toast = useAdminToast();
  const [tab, setTab] = useState("players");
  const [staffAdd, setStaffAdd] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [totals, setTotals] = useState<Record<string, SeasonLine> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_ROSTER_FILTERS);
  const [flash, setFlash] = useState<string | null>(null);
  const [switching, setSwitching] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorKey = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityNotice = useRef<{ player: Player; previous: Player } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialog = useEditorDialog<PlayerSectionId>();

  const load = useCallback(async () => {
    const { data, error: problem } = await createClient().from("players").select("*").order("number");
    if (problem) setError(problem.message);
    else { setPlayers((data ?? []) as Player[]); setError(""); }
    setLoading(false);
    setTotals(await loadTotals(clubId));
  }, [clubId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const groups = useMemo(() => groupPlayers(players, filters), [players, filters]);
  const counts = useMemo(() => Object.fromEntries(ROSTER_POSITIONS.map(position => [position, players.filter(player => player.position === position).length])) as Record<Position, number>, [players]);
  const activeCount = players.filter(player => player.active).length;

  function openPlayer(player: Player | null, event?: MouseEvent<HTMLElement>) {
    setEditor({ key: ++editorKey.current, player });
    dialog.openSection("basics", event);
  }

  async function saved(player: Player, previous: Player | null, warning?: string) {
    await load();
    if (warning) setError(warning);
    setFlash(player.id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1400);
    if (previous && previous.active !== player.active) visibilityNotice.current = { player, previous };
  }

  async function changeVisibility(player: Player, active: boolean): Promise<boolean> {
    setError("");
    try {
      const outcome = await setPlayerVisibility(createClient(), player, active, clubId);
      await load();
      return outcome === "saved";
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Player visibility could not be changed.");
      return false;
    }
  }

  async function toggleCard(player: Player, active: boolean) {
    setSwitching(current => new Set(current).add(player.id));
    const ok = await changeVisibility(player, active);
    setSwitching(current => { const next = new Set(current); next.delete(player.id); return next; });
    if (ok) {
      toast.showUndo({
        message: active ? `${player.name} is on the public roster again` : `${player.name} is hidden from the public roster`,
        onUndo: () => { void changeVisibility({ ...player, active }, player.active); },
      });
    }
  }

  function closeEditor() {
    dialog.close();
    const notice = visibilityNotice.current;
    visibilityNotice.current = null;
    const opener = dialog.returnFocusRef.current;
    if (!opener?.isConnected) {
      const id = notice?.player.id ?? editor?.player?.id;
      dialog.returnFocusRef.current = (id ? document.querySelector<HTMLElement>(`[data-player-id="${id}"] button`) : null) ?? searchRef.current;
    }
    if (notice) {
      const { player, previous } = notice;
      toast.showUndo({
        message: player.active ? `${player.name} is on the public roster again` : `${player.name} is hidden from the public roster`,
        onUndo: () => { void changeVisibility(player, previous.active); },
      });
    }
  }

  const players_ = (
    <>
      <div className={classic.tools}>
        <label className={classic.search}>
          <Search size={16} aria-hidden="true" />
          <input ref={searchRef} type="search" className={ADMIN_INPUT_CLASS} aria-label="Search players by name or jersey number"
            placeholder="Search name or jersey number" value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} />
        </label>
        <span className="text-sm text-muted-foreground"><span className={classic.count}>{activeCount}</span> shown · <span className={classic.count}>{players.length - activeCount}</span> hidden</span>
      </div>
      <div className={classic.filters}>
        <div className={classic.segment} role="group" aria-label="Filter players by position">
          {(["All", ...ROSTER_POSITIONS] as const).map(position => (
            <button type="button" key={position} className="admin-press" aria-pressed={filters.position === position} onClick={() => setFilters(current => ({ ...current, position }))}>
              {position === "All" ? "All" : ROSTER_POSITION_ABBR[position]} <b className={classic.count}>{position === "All" ? players.length : counts[position]}</b>
            </button>
          ))}
        </div>
        <div className={classic.segment} role="group" aria-label="Filter players by status">
          {([["all", "All"], ["active", "Shown"], ["hidden", "Hidden"]] as const).map(([value, label]) => (
            <button type="button" key={value} className="admin-press" aria-pressed={filters.status === value} onClick={() => setFilters(current => ({ ...current, status: value }))}>{label}</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className={styles.alert}>{error} <button type="button" onClick={() => { setLoading(true); void load(); }}>Try again</button></p>}
      <ShimmerRegion loading={loading} minHeight={320} loadingLabel="Loading players" skeleton={<RosterCardsSkeleton />}>
        {groups.length ? (
          <>
            <p className={styles.hint}>Cards look the way they do on your public roster. Goalkeepers are listed first here. Hidden players are dimmed and don&rsquo;t appear on the site.</p>
            {groups.map(group => (
              <section key={group.position} className={styles.group} aria-labelledby={`roster-group-${group.position}`}>
                <h2 id={`roster-group-${group.position}`} className={styles.groupHead}>{group.position}s <span className={styles.groupCount}>{group.players.length}</span></h2>
                <ul className={styles.grid} aria-label={`${group.position}s`}>
                  {group.players.map(player => (
                    <RosterPlayerCard key={player.id} player={player} totals={totals ? totals[player.id] ?? {} : undefined} flash={flash === player.id}
                      switching={switching.has(player.id)} onEdit={event => openPlayer(player, event)} onVisibleChange={active => void toggleCard(player, active)} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <div className={`${styles.empty} rounded-xl border border-border bg-card`}>
            <h2>{players.length ? "No players match your search" : "No players yet"}</h2>
            <p>{players.length ? "Try a different name, jersey number, position, or status." : "Add your first player to start building your roster."}</p>
            {!players.length && <Button className="mt-4" onClick={() => openPlayer(null)}>Add player</Button>}
          </div>
        )}
      </ShimmerRegion>
    </>
  );

  return (
    <>
      <PageFrame title="Roster" breadcrumb={CRUMBS} openPageHref="/roster" description={DESCRIPTION}>
        <div className={styles.page}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <AdminTabs items={TABS} value={tab} onChange={setTab} tabsId="classic-roster" label="Roster sections" />
            <Button className="h-11 w-full sm:h-10 sm:w-auto" onClick={event => tab === "players" ? openPlayer(null, event) : setStaffAdd(value => value + 1)}>
              <Plus size={16} aria-hidden="true" />{tab === "players" ? "Add player" : "Add staff"}
            </Button>
          </div>
          <div role="tabpanel" id={`classic-roster-panel-${tab}`} aria-labelledby={`classic-roster-tab-${tab}`}>
            {tab === "staff" ? <StaffComponent addRequest={staffAdd} classic /> : players_}
          </div>
        </div>
      </PageFrame>
      {editor && (
        <RoseCityPlayerDialog key={editor.key} original={editor.player} open={dialog.open} activeId={dialog.activeId}
          onActiveChange={dialog.switchTo} returnFocusRef={dialog.returnFocusRef} onSaved={saved} onClose={closeEditor} />
      )}
    </>
  );
}

function RosterCardsSkeleton() {
  return (
    <div aria-hidden="true">
      <Shimmer className="mb-3 h-5 w-32" />
      <ul className={styles.grid}>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={styles.skelCard}>
            <Shimmer className="block aspect-square w-full" />
            <div style={{ padding: "10px 12px" }}><Shimmer className="h-6 w-10" /><Shimmer className="mt-2 h-4 w-3/4" /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
