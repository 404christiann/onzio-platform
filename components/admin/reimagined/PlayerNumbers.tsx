"use client";

import { Switch } from "@base-ui/react/switch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { ChevronRight, IconAdd, IconRemove, IconSuccess } from "@/components/admin/icons";
import { NumberStepper } from "@/components/ui/number-stepper";
import type { NumbersGame } from "@/lib/admin-player-numbers-data";
import { resultLabel } from "@/lib/admin-score-data";
import {
  goalSummary,
  goalsOf,
  GROUP_LABELS,
  GROUP_ORDER,
  PLAYER_NUMBER_LIMITS,
  saveRows,
  setFieldNumber,
  setKeeperNumber,
  type FieldNumberKey,
  type KeeperNumberKey,
  type NumbersPlayer,
} from "@/lib/player-numbers";
import { TopBarTitle, useLeaveGuard } from "./TopBar";
import styles from "./player-numbers.module.css";

// ADMIN-RE-11c-2: "Who played and scored?" for one game (design cd-after-game;
// group 1 decisions 2, 6, 7). Players by position; any number marks a player as
// played and Played can be set on its own; Yellow, Red and "More numbers" open
// once a player has played. The summary says "2 of 3 goals added" and offers
// "Own goal or not sure"; Save always works. One save writes every row through
// POST /api/admin/data, which resolves the club and checks the session itself.

type SaveState = "idle" | "busy" | "saved" | "error";

const FIELD_MORE: readonly { key: FieldNumberKey; label: string }[] = [
  { key: "mins", label: "Minutes" },
  { key: "tackles", label: "Tackles" },
  { key: "offsides", label: "Offsides" },
  { key: "fouls", label: "Fouls" },
  { key: "fouls_suffered", label: "Fouled" },
];

const KEEPER_MORE: readonly { key: KeeperNumberKey; label: string }[] = [{ key: "mins", label: "Minutes" }];

function noun(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function PlayerNumbers({
  clubName,
  game,
  players: initial,
  canSave,
  live,
  savedText,
  backHref,
  backLabel,
}: {
  clubName: string;
  game: NumbersGame;
  players: NumbersPlayer[];
  canSave: boolean;
  /** False while the website is held or paused: the saved words say so (decision 2). */
  live: boolean;
  savedText: string;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [ownGoal, setOwnGoal] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [leaving, setLeaving] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(players) !== JSON.stringify(baseline), [players, baseline]);

  useLeaveGuard(dirty && save !== "busy" ? (href: string) => setLeaving(href) : null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(id: string, key: string, value: number | boolean) {
    if (!canSave || save === "busy") return;
    setPlayers((current) =>
      current.map((player) => {
        if (player.id !== id) return player;
        return player.keeper
          ? { ...player, numbers: setKeeperNumber(player.numbers, key as KeeperNumberKey | "played" | "starts", value) }
          : { ...player, numbers: setFieldNumber(player.numbers, key as FieldNumberKey | "played" | "starts", value) };
      }),
    );
    if (save === "saved" || save === "error") setSave("idle");
  }

  async function saveAll(): Promise<boolean> {
    if (!canSave || save === "busy") return false;
    setSave("busy");
    const rows = saveRows(players, game.id);
    try {
      const requests = (
        [
          ["player_match_stats", rows.field],
          ["goalkeeper_match_stats", rows.keepers],
        ] as const
      )
        .filter(([, payload]) => payload.length > 0)
        .map(([table, payload]) =>
          fetch("/api/admin/data", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ table, operation: "upsert", onConflict: "player_id,match_id", columns: "player_id", payload }),
          }).then(async (response) => {
            const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
            return response.ok && Array.isArray(body?.data) && body.data.length === payload.length;
          }),
        );
      const ok = (await Promise.all(requests)).every(Boolean);
      if (!ok) {
        setSave("error");
        return false;
      }
      setBaseline(players);
      setSave("saved");
      router.refresh();
      return true;
    } catch {
      setSave("error");
      return false;
    }
  }

  const score = resultLabel(game.ourScore, game.theirScore);
  const summary = game.ourScore === null ? null : goalSummary(game.ourScore, goalsOf(players), ownGoal);
  const played = players.filter((player) => player.numbers.played).length;
  const savedWords = live ? "Saved · on each player’s page" : savedText;

  const saveButton = (
    <button
      type="button"
      className={styles.save}
      data-state={save}
      disabled={!canSave || players.length === 0}
      aria-busy={save === "busy" || undefined}
      onClick={() => void saveAll()}
      data-testid="save-player-numbers"
    >
      <span className={styles.saveLabel} aria-live="polite">
        {save === "busy" ? (
          "Saving…"
        ) : save === "saved" && !dirty ? (
          <>
            <IconSuccess className="size-5" aria-hidden="true" />
            {savedWords}
          </>
        ) : (
          "Save player numbers"
        )}
      </span>
    </button>
  );

  return (
    <div className={styles.page} data-admin-page="player-numbers">
      <TopBarTitle title="Player numbers" />
      <div className={styles.layout}>
        <aside className={styles.side}>
          <section className={styles.gameCard} aria-labelledby="player-numbers-game">
            <Link href={backHref} className={styles.backLink}>
              {backLabel}
            </Link>
            <h1 id="player-numbers-game" className={styles.gameTitle}>
              <span className={styles.clamp} title={`${clubName} ${game.home ? "vs" : "at"} ${game.opponent}`}>
                {game.home ? "vs" : "at"} {game.opponent}
              </span>
            </h1>
            <p className={styles.when} title={game.when}>
              {game.when}
            </p>
            <p className={styles.result} data-testid="player-numbers-result">
              {score ?? "Result missing"}
            </p>
          </section>

          <div className={styles.sticky}>
            {summary ? (
              <GoalLine summary={summary} ownGoal={ownGoal} onOwnGoal={setOwnGoal} disabled={!canSave} />
            ) : (
              <p className={styles.noScore}>Add the score first to check the goals against it.</p>
            )}
          </div>

          <div className={styles.sideSave}>
            <p className={styles.count}>
              {played === 0
                ? "Nobody marked as played yet"
                : `${played.toLocaleString("en-US")} ${noun(played, "player", "players")} played`}
            </p>
            {saveButton}
            {save === "error" ? (
              <p className={styles.error} role="alert">
                The player numbers weren’t saved. Check your connection and try again.
              </p>
            ) : null}
          </div>
        </aside>

        <div className={styles.list}>
          {!canSave ? (
            <p className={styles.notice}>Changes to your website are paused right now, so player numbers can’t be saved.</p>
          ) : null}
          {players.length === 0 ? (
            <div className={styles.empty} data-testid="player-numbers-empty">
              <p className={styles.emptyTitle}>No players in {game.seasonLabel || "this season"} yet</p>
              <p className={styles.emptyText}>Add players to your team roster, then come back to add their numbers.</p>
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              const members = players.filter((player) => player.group === group);
              if (members.length === 0) return null;
              return (
                <section key={group} className={styles.group} aria-labelledby={`numbers-${group}`}>
                  <h2 id={`numbers-${group}`} className={styles.groupHead}>
                    {GROUP_LABELS[group]} · {members.length.toLocaleString("en-US")}
                  </h2>
                  <ul className={styles.rows}>
                    {members.map((player) => (
                      <PlayerRow key={player.id} player={player} disabled={!canSave || save === "busy"} onChange={change} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.bar}>
        {save === "error" ? (
          <p className={styles.error} role="alert">
            Not saved. Check your connection and try again.
          </p>
        ) : null}
        {saveButton}
      </div>

      <AdminModal
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        className={styles.dialog}
        backdropClassName={styles.backdrop}
        aria-labelledby="player-numbers-leave-title"
      >
        <h2 id="player-numbers-leave-title" className={styles.dialogTitle}>
          Save player numbers first?
        </h2>
        <p className={styles.dialogText}>Your changes for this game are not saved yet.</p>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={save === "busy"}
            onClick={async () => {
              const to = leaving;
              const ok = await saveAll();
              setLeaving(null);
              if (ok && to) router.push(to);
            }}
          >
            Save and leave
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              const to = leaving;
              setBaseline(players);
              setLeaving(null);
              if (to) router.push(to);
            }}
          >
            Leave without saving
          </button>
          <button type="button" className={styles.quiet} onClick={() => setLeaving(null)}>
            Keep editing
          </button>
        </div>
      </AdminModal>
    </div>
  );
}

function GoalLine({
  summary,
  ownGoal,
  onOwnGoal,
  disabled,
}: {
  summary: ReturnType<typeof goalSummary>;
  ownGoal: boolean;
  onOwnGoal: (on: boolean) => void;
  disabled: boolean;
}) {
  const { added, of, over, ok } = summary;
  const segments = of > 0 && of <= 12;
  return (
    <div className={styles.summary} data-ok={ok || undefined} data-over={over || undefined} data-testid="goal-summary">
      <p className={styles.summaryLine} aria-live="polite">
        <span>
          {of === 0
            ? "No goals in the score"
            : `${added.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} ${noun(of, "goal", "goals")} added`}
        </span>
        {ok && of > 0 ? <IconSuccess className="size-6 shrink-0" aria-hidden="true" /> : null}
      </p>
      {over ? <p className={styles.warn}>That’s more than the {of.toLocaleString("en-US")}-goal score</p> : null}
      {of > 0 ? (
        segments ? (
          <div className={styles.segments} aria-hidden="true">
            {Array.from({ length: of }, (_, index) => (
              <i key={index} data-on={index < added || undefined} />
            ))}
          </div>
        ) : (
          <div className={styles.fill} aria-hidden="true">
            <i style={{ width: `${Math.min(100, (added / of) * 100)}%` }} />
          </div>
        )
      ) : null}
      {of > 0 && !over ? (
        <button
          type="button"
          className={styles.chip}
          aria-pressed={ownGoal}
          disabled={disabled || (ok && !ownGoal)}
          onClick={() => onOwnGoal(!ownGoal)}
        >
          Own goal or not sure
        </button>
      ) : null}
    </div>
  );
}

function PlayerRow({
  player,
  disabled,
  onChange,
}: {
  player: NumbersPlayer;
  disabled: boolean;
  onChange: (id: string, key: string, value: number | boolean) => void;
}) {
  const [more, setMore] = useState(false);
  const moreId = useId();
  const { numbers } = player;
  const set = (key: string) => (value: number | boolean) => onChange(player.id, key, value);
  const label = player.number === null ? player.name : `#${player.number} ${player.name}`;
  const moreFields = player.keeper ? KEEPER_MORE : FIELD_MORE;

  return (
    <li className={styles.row} data-played={numbers.played || undefined} data-player={player.id}>
      <div className={styles.rowHead}>
        {player.number !== null ? <span className={styles.shirt}>#{player.number}</span> : null}
        <span className={styles.name} title={player.name}>
          {player.name}
        </span>
        <label className={styles.played}>
          <span>Played</span>
          <Switch.Root
            className={styles.switch}
            checked={numbers.played}
            disabled={disabled}
            onCheckedChange={(on) => set("played")(on)}
            aria-label={`${label}: played`}
          >
            <Switch.Thumb className={styles.thumb} />
          </Switch.Root>
        </label>
      </div>

      <div className={styles.cells}>
        {player.keeper ? (
          <>
            <Cell label="Saves" value={player.numbers.saves} name={label} disabled={disabled} onChange={set("saves")} />
            <Cell label="Goals let in" value={player.numbers.goals_against} name={label} disabled={disabled} onChange={set("goals_against")} />
          </>
        ) : (
          <>
            <Cell label="Goals" value={player.numbers.goals} name={label} disabled={disabled} onChange={set("goals")} />
            <Cell label="Assists" value={player.numbers.assists} name={label} disabled={disabled} onChange={set("assists")} />
          </>
        )}
      </div>

      {numbers.played ? (
        <div className={styles.extra}>
          <div className={styles.cells}>
            <Cell label="Yellow" value={numbers.yellow} name={label} max={2} disabled={disabled} onChange={set("yellow")} />
            <Cell label="Red" value={numbers.red} name={label} max={1} disabled={disabled} onChange={set("red")} />
          </div>
          <button
            type="button"
            className={styles.moreButton}
            aria-expanded={more}
            aria-controls={moreId}
            onClick={() => setMore((open) => !open)}
          >
            More numbers
            <ChevronRight className={styles.moreCaret} data-open={more || undefined} aria-hidden="true" />
          </button>
          {more ? (
            <div id={moreId} className={styles.more}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={numbers.starts}
                  disabled={disabled}
                  onChange={(event) => set("starts")(event.target.checked)}
                />
                Started the game
              </label>
              {player.keeper ? (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={player.numbers.clean_sheets > 0}
                    disabled={disabled}
                    onChange={(event) => set("clean_sheets")(event.target.checked ? 1 : 0)}
                  />
                  Clean sheet
                </label>
              ) : null}
              <div className={styles.cells}>
                {moreFields.map(({ key, label: fieldLabel }) => (
                  <Cell
                    key={key}
                    label={fieldLabel}
                    value={(numbers as Record<string, number | boolean>)[key] as number}
                    name={label}
                    max={key === "mins" ? PLAYER_NUMBER_LIMITS.mins : undefined}
                    disabled={disabled}
                    onChange={set(key)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Cell({
  label,
  value,
  name,
  max = PLAYER_NUMBER_LIMITS.count,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  name: string;
  max?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const word = label.toLowerCase();
  return (
    <div className={styles.cell} role="group" aria-label={`${name}: ${word}`}>
      <span className={styles.cellLabel}>{label}</span>
      <NumberStepper
        className={styles.stepper}
        value={value}
        min={0}
        max={max}
        disabled={disabled}
        onChange={onChange}
        aria-label={`${name}: ${word}`}
        decrementLabel={`One less ${word} for ${name}`}
        incrementLabel={`One more ${word} for ${name}`}
        decrementIcon={<IconRemove className="size-5" aria-hidden="true" />}
        incrementIcon={<IconAdd className="size-5" aria-hidden="true" />}
      />
    </div>
  );
}
