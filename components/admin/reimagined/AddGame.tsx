"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  IconClock,
  IconMapPin,
  IconSchedule,
  IconSuccess,
} from "@/components/admin/icons";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverPositioner, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  compareMatches,
  distinctVenues,
  MATCH_COLUMNS,
  opponentCarry,
  sponsorPayload,
  toAddGameMatch,
  type AddGameMatch,
  type AddGameOpponent,
  type AddGameSeason,
  type AddGameSponsor,
} from "@/lib/admin-add-game-data";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";
import { formatClubDate, formatClubTime } from "@/lib/club-time";
import { savedLabel, type WebsiteState } from "@/lib/save-status";
import { cn } from "@/lib/utils";
import styles from "./add-game.module.css";

// ADMIN-RE-07: "Add a game" (design: cd-game). Plain questions; only the
// opponent has to be typed. Home, next Saturday 10:00 in club time and the
// active season come filled in, and the last venues used are one tap away.
// The save goes through POST /api/admin/data like every other admin write.
// ADMIN-RE-07b: where the club's website shows match sponsors, "Sponsor?"
// comes filled in with the latest game's sponsor. A game against an opponent
// played before quietly keeps that opponent's short name and logo.

/** How many upcoming games "Coming up" lists before linking to the schedule. */
const COMING_UP_SHOWN = 6;
/** How long the button keeps saying "Added" before it is ready again. */
const DONE_MS = 4000;
/** The "Sponsor?" answer for none. */
const NO_SPONSOR = "none";

type SaveState = "idle" | "busy" | "done";
type FieldErrors = Partial<Record<"opponent" | "venue", string>>;

function toPickerDate(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : undefined;
}

function fromPickerDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function readError(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && message.length < 200
    ? `The game was not added: ${message}`
    : "The game was not added. Check your connection and try again.";
}

export function AddGame({
  seasons,
  upcoming: initialUpcoming,
  recentVenues: initialVenues,
  showSponsors,
  sponsors,
  opponents,
  today,
  defaultDate,
  defaultTime,
  websiteState,
}: {
  seasons: readonly AddGameSeason[];
  upcoming: readonly AddGameMatch[];
  recentVenues: readonly string[];
  /** Only where the club's website shows match sponsors. */
  showSponsors: boolean;
  /** The latest game's sponsor first, when it had one, then the Sponsors page's. */
  sponsors: readonly AddGameSponsor[];
  opponents: readonly AddGameOpponent[];
  /** The club's today, "YYYY-MM-DD": a game added for an earlier day is not "Coming up". */
  today: string;
  defaultDate: string;
  defaultTime: string;
  websiteState: WebsiteState;
}) {
  const activeSeason = seasons.find((season) => season.active) ?? seasons[0];
  const [seasonId, setSeasonId] = useState(activeSeason?.id ?? "");
  const [opponent, setOpponent] = useState("");
  const [home, setHome] = useState(true);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [venue, setVenue] = useState("");
  // The latest game's sponsor when it had one, otherwise "No sponsor".
  const [sponsorChoice, setSponsorChoice] = useState(() =>
    sponsors[0]?.from === "last-game" ? "0" : NO_SPONSOR,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [upcoming, setUpcoming] = useState<AddGameMatch[]>(() => [...initialUpcoming]);
  const [venues, setVenues] = useState<string[]>(() => [...initialVenues]);
  const [freshId, setFreshId] = useState<string | null>(null);
  const opponentRef = useRef<HTMLInputElement>(null);
  const venueRef = useRef<HTMLInputElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const season = seasons.find((candidate) => candidate.id === seasonId);
  const sponsor = sponsorChoice === NO_SPONSOR ? null : sponsors[Number(sponsorChoice)] ?? null;
  const comingUp = useMemo(
    () => upcoming.filter((match) => match.seasonId === seasonId && match.date >= today).sort(compareMatches),
    [upcoming, seasonId, today],
  );
  // The game just added always shows, even when it is further out than the first few.
  const shown = useMemo(() => {
    const first = comingUp.slice(0, COMING_UP_SHOWN);
    const fresh = comingUp.find((match) => match.id === freshId);
    return fresh && !first.includes(fresh) ? [...first, fresh] : first;
  }, [comingUp, freshId]);

  // Any change after "Added" starts the next game.
  function touch() {
    if (save === "done") setSave("idle");
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save === "busy" || !seasonId) return;
    const name = opponent.trim();
    const place = venue.trim();
    const errors: FieldErrors = {};
    if (!name) errors.opponent = "Type who you are playing.";
    if (!place) errors.venue = "Type where the game is, or pick a place you used before.";
    setFieldErrors(errors);
    if (errors.opponent) return opponentRef.current?.focus();
    if (errors.venue) return venueRef.current?.focus();

    setSave("busy");
    setError(null);
    try {
      const response = await fetch("/api/admin/data", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "matches",
          operation: "insert",
          columns: MATCH_COLUMNS,
          payload: {
            season_id: seasonId,
            date,
            time,
            opponent: name,
            home,
            venue: place,
            ...opponentCarry(opponents, name),
            ...(showSponsors ? sponsorPayload(sponsor) : {}),
          },
        }),
      });
      const body = await response.json().catch(() => null);
      const row = Array.isArray(body?.data) ? body.data[0] : null;
      if (!response.ok || !row) throw new Error(readError(body));

      const added = toAddGameMatch(row);
      setUpcoming((current) => [...current, added]);
      setVenues((current) => distinctVenues([added.venue, ...current]));
      setFreshId(added.id);
      setOpponent("");
      setVenue("");
      setHome(true);
      setDate(defaultDate);
      setTime(defaultTime);
      setSave("done");
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setSave((state) => (state === "done" ? "idle" : state)), DONE_MS);
    } catch (caught) {
      setSave("idle");
      setError(caught instanceof Error ? caught.message : readError(null));
    }
  }

  if (!activeSeason) {
    return (
      <div className={styles.page}>
        <Head season={null} seasons={seasons} seasonId="" onSeason={() => undefined} />
        <p className={styles.noSeason}>
          Games belong to a season, and this club has none yet.{" "}
          <Link href="/admin/seasons" className={styles.link}>
            Start a season
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const addedLabel = savedLabel(websiteState, "Added");

  return (
    <form className={styles.page} onSubmit={submit} noValidate data-add-game>
      <Head
        season={season ?? null}
        seasons={seasons}
        seasonId={seasonId}
        onSeason={(next) => {
          touch();
          setSeasonId(next);
        }}
      />

      <div className={styles.action}>
        <button
          type="submit"
          className={styles.add}
          data-state={save}
          aria-busy={save === "busy" || undefined}
          data-testid="add-game-submit"
        >
          {save === "busy" ? (
            <>
              <Spinner className="size-4" />
              Adding…
            </>
          ) : save === "done" ? (
            <>
              <IconSuccess className="size-4" aria-hidden="true" />
              <span className={styles.addText}>{addedLabel}</span>
            </>
          ) : (
            "Add to schedule"
          )}
        </button>
        <p className={styles.status} role="status" aria-live="polite">
          {save === "done" ? addedLabel : ""}
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <label htmlFor="add-game-opponent" className={styles.q}>
            Who are you playing?
          </label>
          <div className={styles.answer}>
            <input
              ref={opponentRef}
              id="add-game-opponent"
              className={styles.field}
              value={opponent}
              onChange={(event) => {
                touch();
                setOpponent(event.target.value);
                if (fieldErrors.opponent) setFieldErrors(({ opponent: _gone, ...rest }) => rest);
              }}
              placeholder="Opponent name"
              maxLength={MATCH_TEXT_LIMITS.opponent}
              autoComplete="off"
              required
              aria-invalid={fieldErrors.opponent ? true : undefined}
              aria-describedby={fieldErrors.opponent ? "add-game-opponent-error" : undefined}
              title={opponent || undefined}
            />
            {fieldErrors.opponent ? (
              <p id="add-game-opponent-error" className={styles.fieldError}>
                {fieldErrors.opponent}
              </p>
            ) : null}
          </div>
        </div>

        <fieldset className={styles.row}>
          <legend className={styles.q}>Home or away?</legend>
          <div className={styles.answer}>
            <div className={styles.segmented} role="radiogroup" aria-label="Home or away?">
              {([true, false] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={home === value}
                  className={styles.segment}
                  onClick={() => {
                    touch();
                    setHome(value);
                  }}
                >
                  {value ? "Home" : "Away"}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className={styles.row}>
          <legend className={styles.q}>When?</legend>
          <div className={cn(styles.answer, styles.when)}>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger className={cn(styles.field, styles.fieldButton)} aria-label={`Date, ${formatClubDate(date, "long") ?? ""}`}>
                <IconSchedule className={styles.lead} aria-hidden="true" />
                <span className={styles.fieldText}>{formatClubDate(date, "weekday-short")}</span>
              </PopoverTrigger>
              <PopoverPositioner align="start">
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    components={{
                      Chevron: ({ className, orientation, ...props }) => {
                        const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
                        return <Icon className={cn("size-4", className)} {...props} />;
                      },
                    }}
                    mode="single"
                    selected={toPickerDate(date)}
                    defaultMonth={toPickerDate(date)}
                    onSelect={(picked) => {
                      if (picked) {
                        touch();
                        setDate(fromPickerDate(picked));
                      }
                      setPickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </PopoverPositioner>
            </Popover>
            <span className={cn(styles.field, styles.timeField)}>
              <IconClock className={styles.lead} aria-hidden="true" />
              <input
                type="time"
                aria-label="Time"
                className={styles.timeInput}
                value={time}
                required
                onChange={(event) => {
                  touch();
                  if (event.target.value) setTime(event.target.value);
                }}
              />
            </span>
          </div>
        </fieldset>

        <div className={styles.row}>
          <label htmlFor="add-game-venue" className={styles.q}>
            Where?
          </label>
          <div className={cn(styles.answer, styles.where)}>
            <span className={styles.venueBox}>
              <span className={cn(styles.field, styles.withLead)}>
                <IconMapPin className={styles.lead} aria-hidden="true" />
                <input
                  ref={venueRef}
                  id="add-game-venue"
                  className={styles.bareInput}
                  value={venue}
                  onChange={(event) => {
                    touch();
                    setVenue(event.target.value);
                    if (fieldErrors.venue) setFieldErrors(({ venue: _gone, ...rest }) => rest);
                  }}
                  placeholder="Venue name"
                  maxLength={MATCH_TEXT_LIMITS.venue}
                  autoComplete="off"
                  required
                  aria-invalid={fieldErrors.venue ? true : undefined}
                  aria-describedby={fieldErrors.venue ? "add-game-venue-error" : undefined}
                  title={venue || undefined}
                />
              </span>
              {fieldErrors.venue ? (
                <p id="add-game-venue-error" className={styles.fieldError}>
                  {fieldErrors.venue}
                </p>
              ) : null}
            </span>
            {venues.length ? (
              <div className={styles.chips} role="group" aria-label="Last used">
                <span className={styles.chipsLabel} aria-hidden="true">
                  Last used
                </span>
                {venues.map((place) => (
                  <button
                    key={place}
                    type="button"
                    className={styles.chip}
                    aria-pressed={venue.trim() === place}
                    title={place}
                    onClick={() => {
                      touch();
                      setVenue(place);
                      setFieldErrors(({ venue: _gone, ...rest }) => rest);
                    }}
                  >
                    <span className={styles.chipText}>{place}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {showSponsors ? (
          <div className={styles.row}>
            {sponsors.length ? (
              <label htmlFor="add-game-sponsor" className={styles.q}>
                Sponsor?
              </label>
            ) : (
              <p className={styles.q}>Sponsor?</p>
            )}
            <div className={styles.answer}>
              {sponsors.length ? (
                <span className={cn(styles.field, styles.pick)} title={sponsor?.name}>
                  <span className={styles.fieldText}>{sponsor ? sponsor.name : "No sponsor"}</span>
                  <ChevronDown className={styles.lead} aria-hidden="true" />
                  <select
                    id="add-game-sponsor"
                    className={styles.pickSelect}
                    value={sponsorChoice}
                    onChange={(event) => {
                      touch();
                      setSponsorChoice(event.target.value);
                    }}
                    data-testid="add-game-sponsor"
                  >
                    {sponsors.map((option, index) => (
                      <option key={`${option.from}-${index}`} value={String(index)}>
                        {option.name}
                        {option.from === "last-game" ? " (last game)" : ""}
                      </option>
                    ))}
                    <option value={NO_SPONSOR}>No sponsor</option>
                  </select>
                </span>
              ) : (
                <p className={styles.noSponsor} data-testid="add-game-no-sponsor">
                  No sponsor.{" "}
                  <Link href="/admin/sponsors" className={styles.link}>
                    Add sponsors
                  </Link>
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <section className={styles.soon} aria-labelledby="add-game-coming-up">
        <h2 id="add-game-coming-up" className={styles.soonTitle}>
          Coming up
        </h2>
        {comingUp.length === 0 ? (
          <p className={styles.empty}>No games yet</p>
        ) : (
          <ul className={styles.games} data-testid="add-game-coming-up">
            {shown.map((match) => (
              <ComingUpGame key={match.id} match={match} fresh={match.id === freshId} />
            ))}
          </ul>
        )}
        {/* The old Games page edits and removes games until a reimagined page does. */}
        <Link href="/admin/schedule" className={styles.link}>
          {comingUp.length > shown.length
            ? `See all ${comingUp.length.toLocaleString("en-US")} games`
            : "Change or remove a game"}
        </Link>
      </section>
    </form>
  );
}

function Head({
  season,
  seasons,
  seasonId,
  onSeason,
}: {
  season: AddGameSeason | null;
  seasons: readonly AddGameSeason[];
  seasonId: string;
  onSeason: (seasonId: string) => void;
}) {
  return (
    <header className={styles.head}>
      <span className={styles.headIcon}>
        <IconSchedule className="size-6" aria-hidden="true" />
      </span>
      <span className={styles.headText}>
        <h1 className={styles.title}>Add a game</h1>
        {season ? (
          seasons.length > 1 ? (
            <label className={styles.season} title={season.label}>
              <span className={styles.seasonText}>{season.label}</span>
              <ChevronDown className="size-4 flex-none" aria-hidden="true" />
              <select
                className={styles.seasonSelect}
                value={seasonId}
                aria-label="Season"
                onChange={(event) => onSeason(event.target.value)}
              >
                {seasons.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.active ? " (this season)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className={styles.season} title={season.label}>
              <span className={styles.seasonText}>{season.label}</span>
            </span>
          )
        ) : null}
      </span>
    </header>
  );
}

function ComingUpGame({ match, fresh }: { match: AddGameMatch; fresh: boolean }) {
  const title = `${match.home ? "vs" : "at"} ${match.opponent}`;
  const meta = [formatClubTime(match.time), match.venue].filter(Boolean).join(" · ");
  const [month, day] = (formatClubDate(match.date, "short") ?? "").split(" ");
  return (
    <li className={styles.game} data-fresh={fresh || undefined} data-match-id={match.id}>
      <span className={styles.gameDate} aria-hidden="true">
        <span className={styles.gameMonth}>{month}</span>
        <span className={styles.gameDay}>{day}</span>
      </span>
      <span className={styles.gameText}>
        <span className="sr-only">{formatClubDate(match.date, "long")}: </span>
        <span className={styles.gameTitle} title={title}>
          {title}
        </span>
        <span className={styles.gameMeta} title={meta}>
          {meta}
        </span>
      </span>
    </li>
  );
}
