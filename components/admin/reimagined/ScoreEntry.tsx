"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import {
  ChevronRight,
  IconAdd,
  IconRemove,
  IconStandings,
  IconSuccess,
} from "@/components/admin/icons";
import { NumberStepper } from "@/components/ui/number-stepper";
import { resultLabel, type ScoreGame, type ScorePageData } from "@/lib/admin-score-data";
import styles from "./score.module.css";

// ADMIN-RE-06: Enter a score (design: cd-score on a phone, cd-score-desktop on
// a laptop). The games that need a score come first, newest first; each has a
// stepper per side and a Save button that confirms on itself. Saving changes
// the match only (the league table is ADMIN-RE-11b) and goes through
// POST /api/admin/data, which resolves the club and checks the session itself.

const MAX_SCORE = 99;

type SaveState = "idle" | "busy" | "saved" | "error";

export function ScoreEntry({
  clubName,
  data,
  canSave,
  savedText,
  addGameHref,
}: {
  clubName: string;
  data: ScorePageData;
  canSave: boolean;
  /** The hold-aware label from lib/save-status.ts (decision 2), worked out on the server. */
  savedText: string;
  addGameHref: string | null;
}) {
  const seasonLabel = data.status === "ready" ? data.seasonLabel : null;
  return (
    <div className={styles.page} data-admin-page="score">
      <header className={styles.head}>
        <span className={styles.headIcon}>
          <IconStandings className="size-6" aria-hidden="true" />
        </span>
        <span className={styles.headText}>
          <h1 className={styles.title}>Enter a score</h1>
          {seasonLabel ? (
            <span className={styles.season} title={seasonLabel}>
              {seasonLabel}
            </span>
          ) : null}
        </span>
      </header>

      {data.status === "error" ? (
        <p className={styles.alert} role="alert">
          We could not load your games. Refresh the page to try again.
        </p>
      ) : (
        <div className={styles.body}>
          <section className={styles.games} aria-label="Games that need a score">
            {!canSave ? (
              <p className={styles.notice}>
                Changes to your website are paused right now, so scores can’t be saved.
              </p>
            ) : null}
            {data.needScore.length ? (
              data.needScore.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  clubName={clubName}
                  canSave={canSave}
                  savedText={savedText}
                />
              ))
            ) : (
              <AllScoresIn addGameHref={addGameHref} />
            )}
          </section>

          <aside className={styles.rail}>
            <Link href="/admin/stats?view=match" className={styles.scorers}>
              <span className={styles.scorersText}>
                <span className={styles.scorersTitle}>Who scored?</span>
                <span className={styles.scorersSub}>Add goal scorers to Match stats</span>
              </span>
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
            <EarlierResults games={data.earlier} />
          </aside>
        </div>
      )}
    </div>
  );
}

function vsLine(game: ScoreGame): string {
  return `${game.home ? "vs" : "at"} ${game.opponent}`;
}

function GameCard({
  game,
  clubName,
  canSave,
  savedText,
}: {
  game: ScoreGame;
  clubName: string;
  canSave: boolean;
  savedText: string;
}) {
  const [ours, setOurs] = useState(game.ourScore ?? 0);
  const [theirs, setTheirs] = useState(game.theirScore ?? 0);
  const [save, setSave] = useState<SaveState>("idle");
  const [savedResult, setSavedResult] = useState<string | null>(null);
  const titleId = `score-game-${game.id}`;

  function change(side: "ours" | "theirs", value: number) {
    (side === "ours" ? setOurs : setTheirs)(value);
    if (save === "saved" || save === "error") setSave("idle");
  }

  async function handleSave() {
    if (!canSave || save === "busy") return;
    setSave("busy");
    try {
      const response = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table: "matches",
          operation: "update",
          columns: "id,rose_city_score,opponent_score",
          payload: { rose_city_score: ours, opponent_score: theirs },
          filters: [{ kind: "eq", column: "id", value: game.id }],
        }),
      });
      const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
      // Exactly one of this club's matches must have changed; anything else is a failed save.
      if (!response.ok || !Array.isArray(body?.data) || body.data.length !== 1) {
        setSave("error");
        return;
      }
      setSavedResult(resultLabel(ours, theirs));
      setSave("saved");
    } catch {
      setSave("error");
    }
  }

  return (
    <article className={styles.card} aria-labelledby={titleId} data-score-game={game.id}>
      <div className={styles.match}>
        <span className={styles.matchText}>
          <span id={titleId} className={styles.vs} title={vsLine(game)}>
            {vsLine(game)}
          </span>
          <span className={styles.when} title={game.when}>
            {game.when}
          </span>
        </span>
        <span className={styles.pill} data-done={savedResult ? true : undefined} data-testid="score-pill">
          {savedResult ?? "Result missing"}
        </span>
      </div>

      <div className={styles.teams}>
        <Side name={clubName} value={ours} disabled={!canSave} onChange={(value) => change("ours", value)} />
        <Side
          name={game.opponent}
          value={theirs}
          disabled={!canSave}
          onChange={(value) => change("theirs", value)}
        />
      </div>

      <button
        type="button"
        className={styles.save}
        data-state={save}
        disabled={!canSave}
        aria-busy={save === "busy" || undefined}
        onClick={handleSave}
      >
        <span className={styles.saveLabel} aria-live="polite">
          {save === "busy" ? (
            <>
              <AdminLoadingDots />
              Saving…
            </>
          ) : save === "saved" ? (
            <>
              <IconSuccess className="size-5" aria-hidden="true" />
              {savedText}
            </>
          ) : (
            "Save score"
          )}
        </span>
      </button>
      {save === "error" ? (
        <p className={styles.error} role="alert">
          The score wasn’t saved. Check your connection and try again.
        </p>
      ) : null}
    </article>
  );
}

function Side({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.team} role="group" aria-label={`${name} score`}>
      <span className={styles.teamName} title={name}>
        {name}
      </span>
      <NumberStepper
        className={styles.stepper}
        value={value}
        min={0}
        max={MAX_SCORE}
        disabled={disabled}
        onChange={onChange}
        aria-label={`${name} goals`}
        decrementLabel={`Take a goal away from ${name}`}
        incrementLabel={`Add a goal for ${name}`}
        decrementIcon={<IconRemove className="size-5" aria-hidden="true" />}
        incrementIcon={<IconAdd className="size-5" aria-hidden="true" />}
      />
    </div>
  );
}

function AllScoresIn({ addGameHref }: { addGameHref: string | null }) {
  return (
    <div className={styles.allIn} data-testid="all-scores-in">
      <span className={styles.allInIcon}>
        <IconSuccess className="size-6" aria-hidden="true" />
      </span>
      <h2 className={styles.allInTitle}>All scores are in</h2>
      <p className={styles.allInText}>Every game you’ve played has its score. New games show up here once they’re over.</p>
      {addGameHref ? (
        <Link href={addGameHref} className={styles.allInLink}>
          Add a game
        </Link>
      ) : null}
    </div>
  );
}

function EarlierResults({ games }: { games: readonly ScoreGame[] }) {
  return (
    <section className={styles.earlier} aria-labelledby="earlier-results-title">
      <h2 id="earlier-results-title" className={styles.earlierTitle}>
        Earlier results
      </h2>
      {games.length ? (
        <ul className={styles.results}>
          {games.map((game) => {
            const result = resultLabel(game.ourScore, game.theirScore);
            const outcome = result?.split(" ")[0]?.toLowerCase();
            return (
              <li key={game.id} className={styles.result}>
                <span className={styles.resultText}>
                  <span className={styles.resultTitle} title={vsLine(game)}>
                    {vsLine(game)}
                  </span>
                  <span className={styles.resultMeta}>{game.day}</span>
                </span>
                <span className={styles.resultScore} data-outcome={outcome}>
                  {result}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.earlierEmpty}>No earlier results yet</p>
      )}
    </section>
  );
}
