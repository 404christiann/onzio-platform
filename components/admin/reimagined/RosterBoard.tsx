"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconRoster, IconSearch, Plus } from "@/components/admin/icons";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatPlayerNumber,
  hiddenSummary,
  playerInitials,
  rosterSections,
  rosterTotals,
  type RosterPosition,
  type RosterViewPlayer,
} from "@/lib/admin-roster-view";
import { isRosterPlaceholderLogo } from "@/lib/roster-images";
import styles from "./roster.module.css";

// ADMIN-RE-17: Team roster (design: cd-roster-final-cascade). Presentation
// only: the page loads, saves and edits players exactly as the classic roster
// does and hands them in. On a laptop a small pitch beside the players jumps
// to a position; on a phone four tabs are pinned under the top bar. A jump
// lands the page on the position and deals its cards in, row by row.

const countFormat = new Intl.NumberFormat("en-US");
const AVATAR_HUES = ["#c59a4e", "#6f86c9", "#6d9a7c", "#9a6d8a", "#c9736f", "#5f9aa8"] as const;
// Past this many pixels from the top a section is "in view" for the rail.
const READING_LINE = 180;

function avatarHue(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length]!;
}

export type RosterTab = "players" | "staff";

/** Players / Staff. The design shows players only, so Staff keeps its page here. */
export function RosterSwitch({ tab, onSelect }: { tab: RosterTab; onSelect: (tab: RosterTab) => void }) {
  const order: RosterTab[] = ["players", "staff"];
  return (
    <div role="tablist" aria-label="Roster sections" className={styles.switch}>
      {order.map((value) => (
        <button
          key={value}
          id={`roster-${value}-tab`}
          type="button"
          role="tab"
          aria-selected={tab === value}
          aria-controls={`roster-${value}-panel`}
          tabIndex={tab === value ? 0 : -1}
          className={styles.switchTab}
          onClick={() => onSelect(value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
              return;
            }
            event.preventDefault();
            const next =
              event.key === "Home"
                ? order[0]!
                : event.key === "End"
                  ? order[order.length - 1]!
                  : order[(order.indexOf(value) + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length]!;
            onSelect(next);
            requestAnimationFrame(() => document.getElementById(`roster-${next}-tab`)?.focus());
          }}
        >
          {value === "players" ? "Players" : "Staff"}
        </button>
      ))}
    </div>
  );
}

/** The page's title row: icon, title with its count, a line under it, and Add. */
export function RosterHeading({
  title,
  count,
  summary,
  addLabel,
  onAdd,
}: {
  title: string;
  count: number;
  summary: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <header className={styles.head}>
      <div className={styles.titleRow}>
        <span className={styles.titleIcon} aria-hidden="true">
          <IconRoster size={24} />
        </span>
        <div className={styles.titles}>
          <h1 className={styles.h1} title={title}>
            <span className={styles.h1Text}>{title}</span>
            <span className={styles.count} data-testid="roster-count">
              {countFormat.format(count)}
            </span>
          </h1>
          <p className={styles.sub} data-testid="roster-summary">
            {summary}
          </p>
        </div>
      </div>
      <button type="button" className={styles.add} onClick={onAdd}>
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </button>
    </header>
  );
}

function PlayerAvatar({ player }: { player: RosterViewPlayer }) {
  const hasPhoto = !isRosterPlaceholderLogo(player.photo_url);
  const initials = playerInitials(player.name);
  return (
    <span className={styles.avatar} style={{ ["--avatar-hue" as string]: avatarHue(player.id) }} aria-hidden="true">
      {hasPhoto ? (
        // Native rendering through the shared resilient image: no runtime
        // optimizer, and a photo that will not load falls back to initials.
        <ResilientNativeImage
          src={player.photo_url}
          alt={player.name}
          className={styles.avatarImage}
          fallback={<>{initials}</>}
        />
      ) : (
        initials
      )}
    </span>
  );
}

type BoardProps<P extends RosterViewPlayer & { hometown: string }> = {
  players: P[];
  loading: boolean;
  error: string | null;
  /** The player whose edit panel is open, if any. */
  editingId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  /** Add a player; a position pre-fills the form (from an empty section). */
  onAdd: (position?: RosterPosition) => void;
  onOpen: (player: P) => void;
  switcher: ReactNode;
};

export function RosterBoard<P extends RosterViewPlayer & { hometown: string }>({
  players,
  loading,
  error,
  editingId,
  query,
  onQueryChange,
  onAdd,
  onOpen,
  switcher,
}: BoardProps<P>) {
  const sections = useMemo(() => rosterSections(players, query), [players, query]);
  const totals = useMemo(() => rosterTotals(players), [players]);
  const searching = query.trim().length > 0;
  const nothingMatches = searching && sections.every((section) => section.players.length === 0);

  const [active, setActive] = useState(0);
  const [dealing, setDealing] = useState<number | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  // A jump to a section near the foot of the page cannot bring its heading to
  // the reading line, so the rail keeps the position that was asked for until
  // the person scrolls for themselves.
  const lockedTo = useRef<number | null>(null);
  const dealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unlock = () => {
      lockedTo.current = null;
    };
    let frame: number | undefined;
    const track = () => {
      frame = undefined;
      if (lockedTo.current !== null) return;
      let current = 0;
      sectionRefs.current.forEach((element, index) => {
        if (element && element.getBoundingClientRect().top <= READING_LINE) current = index;
      });
      setActive(current);
    };
    const onScroll = () => {
      if (frame === undefined) frame = requestAnimationFrame(track);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", unlock, { passive: true });
    window.addEventListener("touchmove", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", unlock);
      window.removeEventListener("touchmove", unlock);
      window.removeEventListener("keydown", unlock);
      clearTimeout(dealTimer.current);
    };
  }, []);

  const jumpTo = useCallback((index: number) => {
    const element = sectionRefs.current[index];
    if (!element) return;
    lockedTo.current = index;
    setActive(index);
    // The page lands at once; the cards arrive with the cascade (or, when the
    // person asks for less motion, simply are there).
    // "instant" because the site sets scroll-behavior: smooth on <html>, and a
    // glide down a 60-player page is exactly what the cascade replaces.
    element.scrollIntoView({ block: "start", behavior: "instant" });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDealing(index);
      clearTimeout(dealTimer.current);
      dealTimer.current = setTimeout(() => setDealing(null), 1000);
    }
  }, []);

  const showRail = !loading && totals.all > 0;

  return (
    <div className={styles.page}>
      <RosterHeading
        title="Your players"
        count={totals.shown}
        summary={loading ? "Loading players" : hiddenSummary(totals)}
        addLabel="Add a player"
        onAdd={() => onAdd()}
      />

      <div className={styles.tools}>
        {switcher}
        {loading || totals.all > 0 ? (
          <div className={styles.search}>
            <IconSearch className={styles.searchIcon} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Find a player"
              aria-label="Search players by name or jersey number"
              className={styles.searchInput}
              maxLength={120}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          Error: {error}
        </p>
      ) : null}

      {showRail ? (
        <div className={styles.tabs} role="group" aria-label="Jump to a position" data-testid="roster-tabs">
          {sections.map((section, index) => (
            <button
              key={section.position}
              type="button"
              className={styles.tab}
              aria-current={active === index}
              data-rail-tab={section.position}
              onClick={() => jumpTo(index)}
            >
              <span className={styles.tabLabel}>{section.short}</span>
              <span className={styles.tabCount}>{countFormat.format(section.count)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.body}>
        {showRail ? (
          <nav className={styles.pitch} aria-label="Jump to a position" data-testid="roster-pitch">
            <span className={styles.pitchBox} />
            <span className={styles.pitchSix} />
            <span className={styles.pitchHalf} />
            <span className={styles.pitchCircle} />
            <span className={styles.tint} style={{ transform: `translateY(${active * 100}%)` }} />
            {sections.map((section, index) => (
              <button
                key={section.position}
                type="button"
                className={styles.zone}
                aria-current={active === index}
                data-rail-zone={section.position}
                onClick={() => jumpTo(index)}
              >
                {section.heading} · {countFormat.format(section.count)}
              </button>
            ))}
          </nav>
        ) : null}

        <div className={styles.sections}>
          {loading ? (
            <div className={styles.grid} role="status" aria-label="Loading players">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className={styles.skeleton} />
              ))}
            </div>
          ) : totals.all === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No players yet</p>
              <p className={styles.emptyText}>Add your first player and they show up here and on your website.</p>
              <button type="button" className={styles.add} onClick={() => onAdd()}>
                <Plus className="size-4" aria-hidden="true" />
                Add a player
              </button>
            </div>
          ) : nothingMatches ? (
            <div className={styles.empty} role="status">
              <p className={styles.emptyTitle}>No players match “{query.trim()}”</p>
              <p className={styles.emptyText}>Try a different name or jersey number.</p>
              <button type="button" className={styles.sectionAdd} onClick={() => onQueryChange("")}>
                Show everyone
              </button>
            </div>
          ) : (
            sections.map((section, index) => {
              const hideEmpty = searching && section.players.length === 0;
              if (hideEmpty) return <span key={section.position} ref={(element) => { sectionRefs.current[index] = element; }} />;
              return (
                <section
                  key={section.position}
                  ref={(element) => {
                    sectionRefs.current[index] = element;
                  }}
                  className={styles.section}
                  aria-labelledby={`roster-section-${section.position}`}
                  data-roster-section={section.position}
                  data-deal={dealing === index || undefined}
                >
                  <h2 id={`roster-section-${section.position}`} className={styles.sectionHead}>
                    {section.heading}
                    <span className={styles.sectionCount}>· {countFormat.format(section.count)}</span>
                  </h2>
                  {section.players.length === 0 ? (
                    <p className={styles.sectionEmpty}>
                      No {section.heading.toLowerCase()} yet
                      <button type="button" className={styles.sectionAdd} onClick={() => onAdd(section.position)}>
                        Add one
                      </button>
                    </p>
                  ) : (
                    <ul className={styles.grid}>
                      {section.players.map((player, cardIndex) => {
                        const hidden = !player.active;
                        const number = formatPlayerNumber(player.number);
                        return (
                          <li key={player.id} style={{ ["--deal" as string]: Math.min(cardIndex, 12) }}>
                            <button
                              type="button"
                              className={styles.card}
                              aria-pressed={editingId === player.id}
                              aria-label={`${player.name}, ${number === "–" ? "no number" : `number ${player.number}`}${hidden ? ", hidden from your website" : ""}`}
                              data-hidden={hidden || undefined}
                              data-player-card={player.id}
                              onClick={() => onOpen(player)}
                            >
                              <PlayerAvatar player={player} />
                              <span className={styles.number} aria-hidden="true">
                                {number}
                              </span>
                              <span className={styles.name} title={player.name}>
                                {player.name}
                              </span>
                              <span className={styles.town} title={player.hometown || undefined}>
                                {player.hometown}
                              </span>
                              {hidden ? <span className={styles.hiddenTag}>Hidden</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
